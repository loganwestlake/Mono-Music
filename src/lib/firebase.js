import { initializeApp } from 'firebase/app'
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
} from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'

/**
 * Firebase web config.
 *
 * This is NOT a secret: Firebase web configs are public identifiers that
 * every visitor's browser receives (Google documents this). Access to data
 * is enforced server-side by `firestore.rules` — each signed-in user can
 * only read and write `users/{their uid}/…`. Lock it down further in the
 * Firebase / Google Cloud console (see README → "Firebase setup").
 */
const firebaseConfig = {
  apiKey: 'AIzaSyCalr0gQRiJuELC55395lcROCLE_87NVQs',
  authDomain: 'mono-music-c0b63.firebaseapp.com',
  projectId: 'mono-music-c0b63',
  storageBucket: 'mono-music-c0b63.firebasestorage.app',
  messagingSenderId: '819320058458',
  appId: '1:819320058458:web:662cf35456a088e6aa9e63',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
setPersistence(auth, browserLocalPersistence).catch(() => {})

// Offline cache so the library still loads without a connection.
export const db = (() => {
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

export const signOut = () => fbSignOut(auth)
export const onAuth = (cb) => onAuthStateChanged(auth, cb)
