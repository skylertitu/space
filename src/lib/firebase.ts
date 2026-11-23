
// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

// Your web app's Firebase configuration (Conectado a elizmey-8dc59)
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyCbJb_VbRvW4dS05H8HtMccKp5cl-VmRKs",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "elizmey-8dc59.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "elizmey-8dc59",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "elizmey-8dc59.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "554364222314",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:554364222314:web:8e750b717aefb833eb4313",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-13T49H2WZW"
};

// Initialize Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Get Firebase services
import { initializeFirestore } from 'firebase/firestore';

const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});
const auth = getAuth(app);
const storage = getStorage(app);
const functions = getFunctions(app);

// Prueba de Conexión y Confirmación para elizmey
console.log("🚀 [elizmey]: Firebase inicializado correctamente.");

// Export the services
export { app, db, auth, storage, functions };

