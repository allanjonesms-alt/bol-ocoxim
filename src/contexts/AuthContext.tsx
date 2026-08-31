import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile } from '../types';
import { isAdminEmail } from '../lib/utils';
import { handleRedirectResult, ensureUserProfile } from '../lib/auth-helpers';
import { reconcilePendingProvisionalTickets } from '../utils/provisionalTicketManager';

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
    // Process any redirect sign-in result if returning from redirect flow
    handleRedirectResult().catch((err) => {
      console.warn('[AuthProvider] handleRedirectResult error:', err);
    });

    const unsubscribe = onAuthStateChanged(auth, async (currUser) => {
      setUser(currUser);
      
      if (currUser) {
        // Listen to profile updates
        const unsubProfile = onSnapshot(doc(db, 'users', currUser.uid), async (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            const isMatch = isAdminEmail(currUser.email);
            const role = (isMatch || data?.role === 'admin') ? 'admin' : 'user';
            
            if (isMatch && data?.role !== 'admin') {
              updateDoc(doc(db, 'users', currUser.uid), { role: 'admin' }).catch(err => {
                console.error("Failed to update user role to admin in Firestore:", err);
              });
            }
            
            const userProfileObj = { id: docSnap.id, ...data, role } as UserProfile;
            setProfile(userProfileObj);

            // If user has balance > 0, check and pay for pending provisional tickets automatically
            if ((userProfileObj.balance || 0) > 0) {
              reconcilePendingProvisionalTickets(db, currUser.uid).catch((err) => {
                console.warn('[AuthProvider] auto reconcile provisional tickets notice:', err);
              });
            }
          } else {
            // Profile document does not exist yet (e.g. fresh Google Sign-in or direct auth), ensure it is created
            try {
              await ensureUserProfile(currUser);
            } catch (err) {
              console.warn('[AuthProvider] ensureUserProfile onSnapshot fallback error:', err);
            }
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
