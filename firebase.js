// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD6eUkcF1DR5Tj_oMNmJGHDm06XzKLGBg4",
  authDomain: "expense-tracker-5c250.firebaseapp.com",
  projectId: "expense-tracker-5c250",
  storageBucket: "expense-tracker-5c250.firebasestorage.app",
  messagingSenderId: "770528221263",
  appId: "1:770528221263:web:d85908f947ff233a07f23a",
  measurementId: "G-NGR7KC6ESL",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Keep users logged in after refresh
setPersistence(auth, browserLocalPersistence).catch((e) =>
  console.error("Persistence error:", e)
);

export {
  auth,
  db,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  writeBatch,
  serverTimestamp,
};
