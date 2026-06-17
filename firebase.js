// ============================================================
// firebase.js
// Initializes the Firebase App, Authentication, and Firestore
// using the Firebase v9+ Modular SDK (loaded directly from the
// official Google CDN — no build step / npm install required).
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --------------------------------------------------------
// Your exact Firebase project configuration
// --------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyD6eUkcF1DR5Tj_oMNmJGHDm06XzKLGBg4",
  authDomain: "expense-tracker-5c250.firebaseapp.com",
  projectId: "expense-tracker-5c250",
  storageBucket: "expense-tracker-5c250.firebasestorage.app",
  messagingSenderId: "770528221263",
  appId: "1:770528221263:web:d85908f947ff233a07f23a",
  measurementId: "G-NGR7KC6ESL"
};

// --------------------------------------------------------
// Initialize Firebase
// --------------------------------------------------------
const app = initializeApp(firebaseConfig);

// Auth instance
export const auth = getAuth(app);

// Keep the user logged in across page refreshes / browser restarts
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Failed to set auth persistence:", err);
});

// Firestore instance
export const db = getFirestore(app);

// Export the app itself in case it's needed elsewhere
export default app;
