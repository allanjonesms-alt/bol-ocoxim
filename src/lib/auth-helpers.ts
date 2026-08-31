import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult,
  User 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  getDocFromCache, 
  setDoc, 
  serverTimestamp, 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs 
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { isAdminEmail } from './utils';

/**
 * Gets the next numerical ID for a new user
 */
export async function getNextAvailableNumericId(): Promise<number> {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, orderBy('numericId', 'desc'), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const lastNumericId = snap.docs[0].data().numericId || 0;
      return lastNumericId + 1;
    }
  } catch (e) {
    console.warn("Could not query numericId ordered, falling back:", e);
  }
  
  try {
    const snap = await getDocs(collection(db, 'users'));
    return snap.size + 1;
  } catch (e) {
    return 1;
  }
}

/**
 * Ensures a user document exists in Firestore for the given Firebase User.
 */
export async function ensureUserProfile(user: User): Promise<void> {
  if (!user || !user.uid) return;

  const userRef = doc(db, 'users', user.uid);
  let docSnap = null;

  try {
    docSnap = await getDoc(userRef);
  } catch (fErr) {
    try {
      docSnap = await getDocFromCache(userRef);
    } catch (cErr) {
      console.warn('[ensureUserProfile] Cache getDoc failed:', cErr);
    }
  }

  const userEmail = user.email || '';
  const userRole = isAdminEmail(userEmail) ? 'admin' : 'user';

  if (!docSnap || !docSnap.exists()) {
    const nextId = await getNextAvailableNumericId();
    const displayId = nextId.toString().padStart(3, '0');

    await setDoc(userRef, {
      name: user.displayName || userEmail.split('@')[0] || 'Usuário',
      email: userEmail,
      phone: '',
      pix_key: '',
      balance: 0,
      role: userRole,
      createdAt: serverTimestamp(),
      numericId: nextId,
      displayId: displayId,
    }).catch((sErr) => {
      console.warn('[ensureUserProfile] setDoc warning:', sErr);
    });
  } else {
    // If user is designated admin but role is not yet updated
    const data = docSnap.data();
    if (isAdminEmail(userEmail) && data?.role !== 'admin') {
      await setDoc(userRef, { role: 'admin' }, { merge: true }).catch((err) => {
        console.warn('[ensureUserProfile] Role elevation update warning:', err);
      });
    }
  }
}

/**
 * Performs Google Sign-In with popup, automatically falling back to redirect
 * if popups are blocked by the browser or sandbox iframe.
 */
export async function signInWithGoogle(): Promise<{ success: boolean; redirected?: boolean; error?: string; isPopupBlocked?: boolean }> {
  if (!auth) {
    return { success: false, error: 'Firebase Auth não inicializado.' };
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    const userCredential = await signInWithPopup(auth, provider);
    if (userCredential?.user) {
      await ensureUserProfile(userCredential.user);
      return { success: true };
    }
    return { success: true };
  } catch (err: any) {
    console.warn('[signInWithGoogle] signInWithPopup encountered error:', err.code, err.message);

    const isBlocked = 
      err.code === 'auth/popup-blocked' ||
      err.code === 'auth/cancelled-popup-request' ||
      (typeof err.message === 'string' && err.message.toLowerCase().includes('popup-blocked')) ||
      (typeof err.message === 'string' && err.message.toLowerCase().includes('popup was blocked'));

    if (isBlocked) {
      console.log('[signInWithGoogle] Popup blocked. Attempting signInWithRedirect fallback...');
      try {
        await signInWithRedirect(auth, provider);
        return { success: true, redirected: true };
      } catch (redirectErr: any) {
        console.error('[signInWithGoogle] signInWithRedirect also failed:', redirectErr);
        return {
          success: false,
          isPopupBlocked: true,
          error: 'O pop-up de login foi bloqueado pelo seu navegador. Por favor, permita pop-ups para este site ou abra o aplicativo em uma nova aba para entrar com o Google.'
        };
      }
    }

    if (err.code === 'auth/popup-closed-by-user') {
      return { success: false, error: 'Login com Google cancelado pelo usuário.' };
    }

    if (err.code === 'auth/network-request-failed' || (err.message && err.message.toLowerCase().includes('offline'))) {
      return { success: false, error: 'Erro de conexão com o servidor. Verifique sua conexão e tente novamente.' };
    }

    return { 
      success: false, 
      error: err.message || 'Erro ao realizar login com o Google.' 
    };
  }
}

/**
 * Handles redirect result on page load if user returned from Google Redirect flow
 */
export async function handleRedirectResult(): Promise<User | null> {
  if (!auth) return null;
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      await ensureUserProfile(result.user);
      return result.user;
    }
  } catch (err: any) {
    console.warn('[handleRedirectResult] Error handling redirect result:', err);
  }
  return null;
}
