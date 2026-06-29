// backup.js
// Erlaubt es, alle Daten (Rezepte, Einkaufsliste, Kategorien, etc.) als
// eine einzige JSON-Datei herunterzuladen und später wieder einzuspielen.
// Das ist die Versicherung gegen Datenverlust: Die Datei liegt komplett
// unabhängig von Firebase und der App selbst auf dem Gerät der Person.

window.KochbuchBackup = (function () {
  "use strict";

  // Welche Bridges beim Backup berücksichtigt werden.
  var BACKUP_COLLECTIONS = [
    "rezepte", "einkaufsliste", "einkaufKategorien", "rezeptKategorien",
    "wochenplan", "todos", "todoKategorien", "haeufigGekauft"
  ];

  function ladeAlleDokumente(bridgeName) {
    return new Promise(function (resolve) {
      var bridge = window.__bridges[bridgeName];
      if (!bridge) { resolve([]); return; }
      // Wir nutzen einen einmaligen Snapshot statt eines Live-Listeners,
      // damit das Backup den aktuellen Stand exakt einmal einliest.
      var unsubscribe = bridge.onSnapshot(function (snapshot) {
        var liste = [];
        snapshot.forEach(function (docSnap) {
          var data = docSnap.data();
          data.id = docSnap.id;
          liste.push(data);
        });
        if (typeof unsubscribe === "function") unsubscribe();
        resolve(liste);
      });
    });
  }

  function erstelleBackup() {
    var aufgaben = BACKUP_COLLECTIONS.map(function (name) {
      return ladeAlleDokumente(name).then(function (liste) {
        return [name, liste];
      });
    });
    return Promise.all(aufgaben).then(function (ergebnisse) {
      var backup = {
        erstelltAm: new Date().toISOString(),
        version: 1,
        daten: {}
      };
      ergebnisse.forEach(function (paar) {
        backup.daten[paar[0]] = paar[1];
      });
      return backup;
    });
  }

  function ladeBackupAlsDatei() {
    return erstelleBackup().then(function (backup) {
      var json = JSON.stringify(backup, null, 2);
      var blob = new Blob([json], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      var datum = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = "kochbuch-backup-" + datum + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      return backup;
    });
  }

  // Spielt ein zuvor exportiertes Backup wieder ein.
  // modus: "ersetzen" (alles vorher löschen) oder "zusammenfuehren" (nur hinzufügen/überschreiben)
  function spieleBackupEin(backupObjekt, modus) {
    if (!backupObjekt || !backupObjekt.daten) {
      return Promise.reject(new Error("Ungültige Backup-Datei"));
    }
    var collectionNamen = Object.keys(backupObjekt.daten);
    var aufgaben = collectionNamen.map(function (name) {
      var bridge = window.__bridges[name];
      if (!bridge) return Promise.resolve();
      var dokumente = backupObjekt.daten[name] || [];
      var schreibAufgaben = dokumente.map(function (dok) {
        return bridge.setDoc(dok.id, dok);
      });
      return Promise.all(schreibAufgaben);
    });
    return Promise.all(aufgaben);
  }

  function leseBackupDatei(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var backup = JSON.parse(reader.result);
          resolve(backup);
        } catch (err) {
          reject(new Error("Datei konnte nicht gelesen werden - ist es eine gültige Backup-Datei?"));
        }
      };
      reader.onerror = function () { reject(new Error("Datei konnte nicht gelesen werden")); };
      reader.readAsText(file);
    });
  }

  // Automatisches Backup: legt einmal pro Tag eine Kopie aller Daten in der
  // separaten Collection "autoBackups" ab (max. 7 Versionen, älteste wird
  // automatisch entfernt). Das ist eine zusätzliche Absicherung, falls z.B.
  // versehentlich etwas gelöscht wird - unabhängig vom manuellen Download.
  var AUTO_BACKUP_KEY = "kochbuch_letztes_autobackup";
  var AUTO_BACKUP_INTERVALL_MS = 24 * 60 * 60 * 1000; // 1 Tag

  function pruefeUndErstelleAutoBackup() {
    var letztesBackup = localStorage.getItem(AUTO_BACKUP_KEY);
    var jetzt = Date.now();
    if (letztesBackup && (jetzt - parseInt(letztesBackup, 10)) < AUTO_BACKUP_INTERVALL_MS) {
      return Promise.resolve(false); // noch nicht nötig
    }
    return erstelleBackup().then(function (backup) {
      var bridge = window.__bridges.autoBackups;
      if (!bridge) return false;
      var id = "auto_" + jetzt;
      return bridge.setDoc(id, backup).then(function () {
        localStorage.setItem(AUTO_BACKUP_KEY, String(jetzt));
        return raeumeAlteAutoBackupsAuf();
      });
    });
  }

  function raeumeAlteAutoBackupsAuf() {
    return new Promise(function (resolve) {
      var bridge = window.__bridges.autoBackups;
      if (!bridge) { resolve(); return; }
      var unsubscribe = bridge.onSnapshot(function (snapshot) {
        var alle = [];
        snapshot.forEach(function (docSnap) { alle.push(docSnap.id); });
        if (typeof unsubscribe === "function") unsubscribe();
        alle.sort(); // IDs enthalten Timestamp, daher chronologisch sortierbar
        var MAX_BACKUPS = 7;
        if (alle.length > MAX_BACKUPS) {
          var zuLoeschen = alle.slice(0, alle.length - MAX_BACKUPS);
          Promise.all(zuLoeschen.map(function (id) { return bridge.deleteDoc(id); })).then(resolve);
        } else {
          resolve();
        }
      });
    });
  }

  return {
    ladeBackupAlsDatei: ladeBackupAlsDatei,
    leseBackupDatei: leseBackupDatei,
    spieleBackupEin: spieleBackupEin,
    pruefeUndErstelleAutoBackup: pruefeUndErstelleAutoBackup
  };
})();
