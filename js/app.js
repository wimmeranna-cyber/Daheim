// app.js
// Zentrales Steuermodul: verbindet die einzelnen Module (Kochbuch,
// Einkaufsliste, ...) über die Tab-Navigation und übernimmt das
// Bootstrapping der App sowie die Backup-Funktionen in den Einstellungen.

window.App = (function () {
  "use strict";

  var aktiverTab = "kochbuch"; // "kochbuch" | "wochenplan" | "einkauf" | "todos"

  function getAktiverTab() { return aktiverTab; }

  function render() {
    var zeigeKochbuch = aktiverTab === "kochbuch";
    document.getElementById("view-wochenplan").classList.toggle("hidden", aktiverTab !== "wochenplan");
    document.getElementById("view-einkauf").classList.toggle("hidden", aktiverTab !== "einkauf");
    document.getElementById("view-todos").classList.toggle("hidden", aktiverTab !== "todos");

    document.getElementById("tab-kochbuch").classList.toggle("active", zeigeKochbuch);
    document.getElementById("tab-wochenplan").classList.toggle("active", aktiverTab === "wochenplan");
    document.getElementById("tab-einkauf").classList.toggle("active", aktiverTab === "einkauf");
    document.getElementById("tab-todos").classList.toggle("active", aktiverTab === "todos");

    // Alle Module rendern lassen, damit beim Tab-Wechsel sowohl die
    // Sichtbarkeit als auch der Inhalt sofort korrekt aktualisiert wird.
    window.KochbuchModul.render();
    window.WochenplanModul.render();
    window.EinkaufModul.render();
    window.TodosModul.render();
  }

  function wechsleTab(tab) {
    aktiverTab = tab;
    render();
  }

  function bindeTabEvents() {
    document.getElementById("tab-kochbuch").addEventListener("click", function () { wechsleTab("kochbuch"); });
    document.getElementById("tab-wochenplan").addEventListener("click", function () { wechsleTab("wochenplan"); });
    document.getElementById("tab-einkauf").addEventListener("click", function () { wechsleTab("einkauf"); });
    document.getElementById("tab-todos").addEventListener("click", function () { wechsleTab("todos"); });
  }

  // Wird vom Wochenplan-Modul aufgerufen, wenn ein verknüpftes Rezept
  // angetippt wird - wechselt zum Kochbuch-Tab und öffnet das Rezept direkt.
  function oeffneRezeptAusWochenplan(rezeptId) {
    aktiverTab = "kochbuch";
    window.KochbuchModul.oeffneRezeptDirekt(rezeptId);
    render();
  }

  // ---------- Backup-Einstellungen (über Zahnrad-Symbol erreichbar) ----------

  function oeffneBackupMenu() {
    var area = document.getElementById("shop-edit-area");
    area.innerHTML = '<div class="modal-overlay" id="backup-overlay">' +
      '<div class="modal-box">' +
        '<h2>Daten sichern</h2>' +
        '<p>Lade eine Sicherungskopie aller Rezepte und Listen herunter, oder spiele eine zuvor gesicherte Datei wieder ein.</p>' +
        '<div id="backup-status" style="font-size:13px;color:var(--brown);margin-bottom:14px;"></div>' +
        '<div class="modal-actions" style="margin-bottom:10px;">' +
          '<button id="backup-download-btn" class="confirm" style="background:var(--brown);border-color:var(--brown)">⬇️ Backup herunterladen</button>' +
        '</div>' +
        '<label class="foto-upload-btn" for="backup-upload-input" style="display:block;text-align:center;margin-bottom:14px;">' +
          '⬆️ Backup wiederherstellen' +
          '<input type="file" accept="application/json" id="backup-upload-input" class="hidden" />' +
        '</label>' +
        '<div class="modal-actions">' +
          '<button id="backup-close-btn">Schließen</button>' +
        '</div>' +
        '<button id="open-kategorien-btn" style="width:100%;margin-top:14px;background:none;border:none;color:var(--brown);text-decoration:underline;font-size:13px;cursor:pointer;">📂 Kategorien verwalten</button>' +
      '</div>' +
    '</div>';

    function schließen() { area.innerHTML = ""; }
    document.getElementById("backup-overlay").addEventListener("click", function (e) {
      if (e.target.id === "backup-overlay") schließen();
    });
    document.getElementById("backup-close-btn").addEventListener("click", schließen);
    document.getElementById("open-kategorien-btn").addEventListener("click", function () {
      schließen();
      window.KochbuchModul.oeffneKategorienVerwaltung();
    });

    document.getElementById("backup-download-btn").addEventListener("click", function () {
      var statusEl = document.getElementById("backup-status");
      statusEl.textContent = "Backup wird erstellt...";
      window.KochbuchBackup.ladeBackupAlsDatei().then(function () {
        statusEl.textContent = "Backup wurde heruntergeladen ✓";
      }).catch(function (err) {
        console.error(err);
        statusEl.textContent = "Das hat leider nicht geklappt.";
      });
    });

    document.getElementById("backup-upload-input").addEventListener("change", function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var statusEl = document.getElementById("backup-status");
      statusEl.textContent = "Backup wird eingelesen...";
      window.KochbuchBackup.leseBackupDatei(file).then(function (backup) {
        statusEl.textContent = "Backup wird wiederhergestellt...";
        return window.KochbuchBackup.spieleBackupEin(backup, "zusammenfuehren");
      }).then(function () {
        statusEl.textContent = "Wiederherstellung abgeschlossen ✓";
      }).catch(function (err) {
        console.error(err);
        statusEl.textContent = "Das hat nicht geklappt: " + err.message;
      });
    });
  }

  // ---------- Start ----------

  function init() {
    bindeTabEvents();

    var settingsBtn = document.getElementById("settings-btn");
    if (settingsBtn) settingsBtn.addEventListener("click", oeffneBackupMenu);

    window.KochbuchModul.init();
    window.KochbuchModul.bindeStatischeEvents();
    window.WochenplanModul.init();
    window.WochenplanModul.bindeStatischeEvents();
    window.EinkaufModul.init();
    window.EinkaufModul.bindeStatischeEvents();
    window.TodosModul.init();
    window.TodosModul.bindeStatischeEvents();

    render();

    // Automatisches Backup einmal täglich im Hintergrund (siehe backup.js)
    window.KochbuchDB.warteAufFirebase(function () {
      setTimeout(function () {
        window.KochbuchBackup.pruefeUndErstelleAutoBackup();
      }, 5000); // kurze Verzögerung, damit das nicht den Start verlangsamt
    });
  }

  return {
    init: init,
    render: render,
    getAktiverTab: getAktiverTab,
    wechsleTab: wechsleTab,
    oeffneBackupMenu: oeffneBackupMenu,
    oeffneRezeptAusWochenplan: oeffneRezeptAusWochenplan
  };
})();

document.addEventListener("DOMContentLoaded", function () {
  window.App.init();
});
