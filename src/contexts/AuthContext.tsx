import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile } from '../types';
import { isAdminEmail } from '../lib/utils';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currUser) => {
      setUser(currUser);
      
      if (currUser) {
        // Listen to profile updates
        const unsubProfile = onSnapshot(doc(db, 'users', currUser.uid), (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            const isMatch = isAdminEmail(currUser.email);
            const role = (isMatch || data?.role === 'admin') ? 'admin' : 'user';
            
            if (isMatch && data?.role !== 'admin') {
              updateDoc(doc(db, 'users', currUser.uid), { role: 'admin' }).catch(err => {
                console.error("Failed to update user role to admin in Firestore:", err);
              });
            }
            
            setProfile({ id: docSnap.id, ...data, role } as UserProfile);
          } else {
            setProfile(null);
          }
          setLoading(false);
        }, (error) => {
          console.error('Error fetching profile', error);
          setLoading(false);
        });
        
        return () => unsubProfile();
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
