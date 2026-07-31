import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);

// Initialize Firestore with force long polling to prevent connection timeouts/WebSocket blocking inside iframe container
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

// Standard getAuth handles sandbox iframes and fallback persistences safely
export const auth = getAuth(app);

