// firebase-config.js
// Verbindet die App mit Firebase/Firestore und stellt generische
// Lese-/Schreib-Funktionen ("Bridges") für jede Collection bereit.
// Fotos werden als Base64-Text direkt in den Dokumenten gespeichert -
// kein Firebase Storage nötig, bleibt komplett im kostenlosen Spark-Plan.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyApst_obrY3n4MabeXdIJXoiHw6nyzya_U",
  authDomain: "kochbuch-48a3f.firebaseapp.com",
  projectId: "kochbuch-48a3f",
  storageBucket: "kochbuch-48a3f.firebasestorage.app",
  messagingSenderId: "962212943114",
  appId: "1:962212943114:web:ff2d6e9345ebef3771d6f3"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// Erzeugt ein Bridge-Objekt für eine bestimmte Firestore-Collection.
// Jedes Modul (Rezepte, Einkaufsliste, Wochenplan, Todos, Kategorien)
// bekommt so seine eigene, unabhängige Bridge.
function macheBridge(collectionName) {
  return {
    name: collectionName,
    setDoc: function (id, data) { return setDoc(doc(db, collectionName, id), data); },
    deleteDoc: function (id) { return deleteDoc(doc(db, collectionName, id)); },
    onSnapshot: function (callback) {
      return onSnapshot(collection(db, collectionName), callback, function (err) {
        console.error("Firestore Snapshot-Fehler (" + collectionName + "):", err);
        window.dispatchEvent(new CustomEvent("kochbuch-storage-error", { detail: { collection: collectionName, error: err } }));
      });
    }
  };
}

// Globale Bridges, die alle Module nutzen können.
window.__bridges = {
  rezepte: macheBridge("rezepte"),
  einkaufsliste: macheBridge("einkaufsliste"),
  einkaufKategorien: macheBridge("einkaufKategorien"),
  rezeptKategorien: macheBridge("rezeptKategorien"),
  wochenplan: macheBridge("wochenplan"),
  todos: macheBridge("todos"),
  todoKategorien: macheBridge("todoKategorien"),
  haeufigGekauft: macheBridge("haeufigGekauft"),
  autoBackups: macheBridge("autoBackups")
};

window.dispatchEvent(new CustomEvent("kochbuch-firebase-ready"));
