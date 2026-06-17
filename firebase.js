import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    query, 
    where, 
    getDocs, 
    deleteDoc, 
    doc, 
    setDoc, 
    getDoc, 
    writeBatch 
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

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

export {
    auth,
    db,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    collection,
    addDoc,
    query,
    where,
    getDocs,
    deleteDoc,
    doc,
    setDoc,
    getDoc,
    writeBatch
};
