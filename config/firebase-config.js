const { initializeApp } = require('firebase/app');
const { getAuth } = require('firebase/auth');
const { getFirestore } = require('firebase/firestore');

const firebaseConfig = {
    apiKey: "AIzaSyDbQ-C5EjwMDiwWw73bIX_sZriSCkTDOzg",
    authDomain: "freelancehub-fe2b7.firebaseapp.com",
    projectId: "freelancehub-fe2b7",
    storageBucket: "freelancehub-fe2b7.firebasestorage.app",
    messagingSenderId: "485258332798",
    appId: "1:485258332798:web:a358ea2f14bbac5b54262f",
    measurementId: "G-Z9XKW2LZED"
  };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

module.exports = { auth, db };