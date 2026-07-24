import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAN5l0n4JR5uUmbP2OBdEhoVwEq8Ar9jRs",
  authDomain: "michatapp-cf340.firebaseapp.com",
  projectId: "michatapp-cf340",
  storageBucket: "michatapp-cf340.firebasestorage.app",
  messagingSenderId: "816566488230",
  appId: "1:816566488230:web:8c643ce9e52ee12ffe3867"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);