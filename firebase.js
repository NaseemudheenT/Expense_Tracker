// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD6eUkcF1DR5Tj_oMNmJGHDm06XzKLGBg4",
  authDomain: "expense-tracker-5c250.firebaseapp.com",
  projectId: "expense-tracker-5c250",
  storageBucket: "expense-tracker-5c250.firebasestorage.app",
  messagingSenderId: "770528221263",
  appId: "1:770528221263:web:d85908f947ff233a07f23a",
  measurementId: "G-NGR7KC6ESL"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Keep user logged in after page refresh
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Auth persistence error:", err);
});

export { auth, db };
