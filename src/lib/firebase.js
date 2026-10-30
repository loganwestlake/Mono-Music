import { initializeApp } from 'firebase/app'
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  connectAuthEmulator,
} from 'firebase/auth'
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'

// Automated tests build with VITE_FIREBASE_EMULATOR=1 to run against local
// emulators. The real site never sets it.
const EMULATOR = import.meta.env.VITE_FIREBASE_EMULATOR === '1'

/**
 * Firebase web config.
 *
 * This is NOT a secret: Firebase web configs are public identifiers that
 * every visitor's browser receives (Google documents this). Access to data
 * is enforced server-side by `firestore.rules` — each signed-in user can
 * only read and write `users/{their uid}/…`. Lock it down further in the
 * Firebase / Google Cloud console (see README → "Firebase setup").
 */
const firebaseConfig = EMULATOR
  ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-mono', appId: 'demo' }
  : {
      apiKey: 'AIzaSyCalr0gQRiJuELC55395lcROCLE_87NVQs',
      authDomain: 'mono-music-c0b63.firebaseapp.com',
      projectId: 'mono-music-c0b63',
      storageBucket: 'mono-music-c0b63.firebasestorage.app',
      messagingSenderId: '819320058458',
      appId: '1:819320058458:web:662cf35456a088e6aa9e63',
    }

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
if (EMULATOR) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
setPersistence(auth, browserLocalPersistence).catch(() => {})

// Offline cache so the library still loads without a connection.
export const db = (() => {
  if (EMULATOR) {
    const test = initializeFirestore(app, { ignoreUndefinedProperties: true })
    connectFirestoreEmulator(test, '127.0.0.1', 8085)
    return test
  }
  try {
    return initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  } catch {
    return initializeFirestore(app, { ignoreUndefinedProperties: true })
  }
})()

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  // Popup first: redirect sign-in breaks on Safari when the site and the
  // auth domain differ (GitHub Pages vs firebaseapp.com).
  try {
    return await signInWithPopup(auth, provider)
  } catch (err) {
    if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/operation-not-supported-in-this-environment')
      return signInWithRedirect(auth, provider)
    throw err
  }
}

// Test-only sign-in as a fixed account (emulator builds only).
if (EMULATOR)
  window.__testSignIn = (sub = 'tester') =>
    signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub, email: `${sub}@example.com`, email_verified: true })))

export const signOut = () => fbSignOut(auth)
export const onAuth = (cb) => onAuthStateChanged(auth, cb)
