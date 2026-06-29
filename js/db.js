// db.js
// Generischer Helfer, der eine Firestore-Bridge (aus firebase-config.js)
// mit einem lokalen Array verbindet und automatisch synchron hält.
// Jedes Modul (Rezepte, Einkaufsliste, ...) bekommt darüber eine
// einfache "Collection" mit live-aktualisierter Liste + Speicherfunktionen.

window.KochbuchDB = (function () {
  "use strict";

  var bereitschaftListeners = [];
  var istBereit = false;

  function warteAufFirebase(callback) {
    if (window.__bridges) { callback(); return; }
    bereitschaftListeners.push(callback);
  }

  window.addEventListener("kochbuch-firebase-ready", function () {
    istBereit = true;
    bereitschaftListeners.forEach(function (cb) { cb(); });
    bereitschaftListeners = [];
  });

  // Erstellt eine live-synchronisierte Collection.
  // bridgeName: Schlüssel in window.__bridges (z.B. "rezepte")
  // onChange: Callback, der bei jeder Änderung mit der aktuellen Liste aufgerufen wird
  function erstelleCollection(bridgeName, onChange) {
    var liste = [];
    var bereit = false;
    var fehlerCallback = null;

    function starten() {
      var bridge = window.__bridges[bridgeName];
      if (!bridge) {
        console.error("Unbekannte Collection-Bridge:", bridgeName);
        return;
      }
      bridge.onSnapshot(function (snapshot) {
        var neueListe = [];
        snapshot.forEach(function (docSnap) {
          var data = docSnap.data();
          data.id = docSnap.id;
          neueListe.push(data);
        });
        liste = neueListe;
        bereit = true;
        onChange(liste);
      });
    }

    warteAufFirebase(starten);

    return {
      getListe: function () { return liste; },
      istBereit: function () { return bereit; },
      speichern: function (objekt) {
        if (!window.__bridges[bridgeName]) return Promise.resolve(false);
        return window.__bridges[bridgeName].setDoc(objekt.id, objekt)
          .then(function () { return true; })
          .catch(function (err) {
            console.error("Speichern fehlgeschlagen (" + bridgeName + "):", err);
            return false;
          });
      },
      loeschen: function (id) {
        if (!window.__bridges[bridgeName]) return Promise.resolve(false);
        return window.__bridges[bridgeName].deleteDoc(id)
          .then(function () { return true; })
          .catch(function (err) {
            console.error("Löschen fehlgeschlagen (" + bridgeName + "):", err);
            return false;
          });
      }
    };
  }

  function neueId(praefix) {
    return praefix + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  }

  return {
    erstelleCollection: erstelleCollection,
    warteAufFirebase: warteAufFirebase,
    neueId: neueId
  };
})();
