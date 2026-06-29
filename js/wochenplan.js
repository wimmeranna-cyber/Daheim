// wochenplan.js
// Modul für den Wochenplan: zeigt die aktuelle Woche (Mo-So) mit freien
// Einträgen pro Tag (Rezept-Verweis oder Freitext), erlaubt Navigation zu
// anderen Wochen, Drag & Drop zwischen Tagen, und kann aus den verwendeten
// Rezepten automatisch eine Einkaufsliste vorschlagen.

window.WochenplanModul = (function () {
  "use strict";

  var WOCHENTAGE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

  var state = {
    eintraege: [], // alle Wochenplan-Einträge aus Firestore (über alle Wochen)
    angezeigteWoche: montagDieserWoche(new Date()), // Date-Objekt, Montag 00:00 der angezeigten Woche
    storageFehler: false
  };

  var wochenplanCollection = null;

  function init() {
    wochenplanCollection = window.KochbuchDB.erstelleCollection("wochenplan", function (liste) {
      state.eintraege = liste;
      state.storageFehler = false;
      render();
    });
    window.addEventListener("kochbuch-storage-error", function (e) {
      if (e.detail && e.detail.collection === "wochenplan") {
        state.storageFehler = true;
        render();
      }
    });
    initialisiereDragDropEinmalig();
  }

  // ---------- Datum-Helfer ----------

  function montagDieserWoche(datum) {
    var d = new Date(datum);
    d.setHours(0, 0, 0, 0);
    var wochentagIndex = (d.getDay() + 6) % 7; // Montag = 0 ... Sonntag = 6
    d.setDate(d.getDate() - wochentagIndex);
    return d;
  }

  function tagPlusX(datum, x) {
    var d = new Date(datum);
    d.setDate(d.getDate() + x);
    return d;
  }

  function alsDatumKey(datum) {
    // YYYY-MM-DD, unabhängig von Zeitzone konsistent
    var jahr = datum.getFullYear();
    var monat = String(datum.getMonth() + 1).padStart(2, "0");
    var tag = String(datum.getDate()).padStart(2, "0");
    return jahr + "-" + monat + "-" + tag;
  }

  function formatiereTagKurz(datum) {
    return datum.getDate() + "." + (datum.getMonth() + 1) + ".";
  }

  function istHeute(datum) {
    var heute = new Date();
    return alsDatumKey(datum) === alsDatumKey(heute);
  }

  function formatiereWochenSpanne(montag) {
    var sonntag = tagPlusX(montag, 6);
    var gleicherMonat = montag.getMonth() === sonntag.getMonth();
    if (gleicherMonat) {
      return montag.getDate() + ". – " + sonntag.getDate() + ". " + monatsName(sonntag.getMonth()) + " " + sonntag.getFullYear();
    }
    return montag.getDate() + ". " + monatsName(montag.getMonth()) + " – " + sonntag.getDate() + ". " + monatsName(sonntag.getMonth()) + " " + sonntag.getFullYear();
  }

  function monatsName(index) {
    var namen = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
    return namen[index];
  }

  // ---------- Helpers ----------

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function eintraegeFuerTag(datumKey) {
    return state.eintraege
      .filter(function (e) { return e.datum === datumKey; })
      .sort(function (a, b) { return (a.reihenfolge || 0) - (b.reihenfolge || 0); });
  }

  // Wird von außen (Kochbuch-Modul, "Hinzufügen"-Button bei einem Rezept)
  // aufgerufen, um ein Rezept für einen bestimmten Tag einzuplanen.
  // portionen: gewünschte Portionenzahl für DIESEN Wochenplan-Eintrag
  // (unabhängig von der Originalportion des Rezepts) - wird später beim
  // Erstellen der Einkaufsliste zum Skalieren der Mengen genutzt.
  function fuegeRezeptHinzu(rezeptId, rezeptTitel, datumKey, portionen) {
    var ziel = datumKey || alsDatumKey(new Date());
    var bestehende = eintraegeFuerTag(ziel);
    var eintrag = {
      id: window.KochbuchDB.neueId("wp"),
      datum: ziel,
      typ: "rezept",
      rezeptId: rezeptId,
      text: rezeptTitel, // Kopie des Titels, damit der Eintrag auch sichtbar bleibt falls Rezept später gelöscht wird
      portionen: portionen || null,
      reihenfolge: bestehende.length
    };
    return wochenplanCollection.speichern(eintrag);
  }

  function fuegeFreitextHinzu(text, datumKey) {
    if (!text || !text.trim()) return Promise.resolve(false);
    var bestehende = eintraegeFuerTag(datumKey);
    var eintrag = {
      id: window.KochbuchDB.neueId("wp"),
      datum: datumKey,
      typ: "text",
      text: text.trim(),
      reihenfolge: bestehende.length
    };
    return wochenplanCollection.speichern(eintrag);
  }

  // ---------- Render ----------

  function render() {
    var montag = state.angezeigteWoche;
    document.getElementById("week-subtitle").textContent = formatiereWochenSpanne(montag);

    var alertArea = document.getElementById("week-alert-area");
    alertArea.innerHTML = state.storageFehler
      ? '<div class="alert error">Speichern oder Laden hat nicht geklappt. Bitte versuch es nochmal.</div>'
      : "";

    var tageHtml = "";
    for (var i = 0; i < 7; i++) {
      var tagDatum = tagPlusX(montag, i);
      var datumKey = alsDatumKey(tagDatum);
      var einträgeTag = eintraegeFuerTag(datumKey);

      tageHtml += '<div class="week-day' + (istHeute(tagDatum) ? " today" : "") + '" data-datum="' + datumKey + '">' +
        '<div class="week-day-header">' +
          '<span class="week-day-name">' + WOCHENTAGE[i] + '</span>' +
          '<span class="week-day-date">' + formatiereTagKurz(tagDatum) + '</span>' +
        '</div>' +
        '<div class="week-day-items" data-datum="' + datumKey + '">' +
          einträgeTag.map(function (e) { return renderEintrag(e); }).join("") +
        '</div>' +
        '<div class="week-day-add-row">' +
          '<input type="text" class="week-text-input" data-datum="' + datumKey + '" placeholder="Notiz hinzufügen..." />' +
          '<button class="week-add-recipe-btn" data-datum="' + datumKey + '" aria-label="Rezept hinzufügen">🍽️</button>' +
        '</div>' +
      '</div>';
    }
    document.getElementById("week-days").innerHTML = tageHtml;

    bindeTagEvents();
  }

  function renderEintrag(e) {
    var icon = e.typ === "rezept" ? "🍽️" : "📝";
    return '<div class="week-item' + (e.typ === "rezept" ? " is-recipe" : "") + '" data-id="' + e.id + '">' +
      '<span class="week-item-icon">' + icon + '</span>' +
      '<span class="week-item-text" data-action="' + (e.typ === "rezept" ? "open-recipe" : "noop") + '" data-id="' + e.id + '">' + escapeHtml(e.text) + '</span>' +
      '<button class="week-item-remove" data-action="remove" data-id="' + e.id + '" aria-label="Entfernen">✕</button>' +
    '</div>';
  }

  function bindeTagEvents() {
    Array.prototype.forEach.call(document.querySelectorAll(".week-text-input"), function (input) {
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && input.value.trim()) {
          fuegeFreitextHinzu(input.value, input.dataset.datum);
          input.value = "";
        }
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll(".week-add-recipe-btn"), function (btn) {
      btn.addEventListener("click", function () {
        oeffneRezeptAuswahl(btn.dataset.datum);
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-action="remove"]'), function (btn) {
      btn.addEventListener("click", function () {
        wochenplanCollection.loeschen(btn.dataset.id);
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-action="open-recipe"]'), function (el) {
      el.addEventListener("click", function () {
        var eintrag = state.eintraege.filter(function (x) { return x.id === el.dataset.id; })[0];
        if (eintrag && eintrag.rezeptId && window.App) {
          window.App.oeffneRezeptAusWochenplan(eintrag.rezeptId);
        }
      });
    });
  }

  // Drag & Drop zwischen Tagen (und Umsortieren innerhalb eines Tages),
  // per Pointer Events für zuverlässiges Verhalten auf Touch-Geräten.
  // Drag & Drop zwischen Tagen (und Umsortieren innerhalb eines Tages),
  // per Pointer Events für zuverlässiges Verhalten auf Touch-Geräten.
  // WICHTIG: Diese Funktion wird nur EINMAL aufgerufen (siehe init()), nicht
  // bei jedem render() - sonst würden sich bei jedem Re-Render zusätzliche,
  // Drag & Drop zwischen Tagen nutzt das gemeinsame Long-Press-Modul
  // (dragdrop.js): die ganze Karte gedrückt halten, statt nur einen
  // schmalen Ziehgriff zu treffen. Wird nur EINMAL initialisiert (siehe
  // init()), nicht bei jedem render().
  var dragDropInitialisiert = false;

  function initialisiereDragDropEinmalig() {
    if (dragDropInitialisiert) return;
    dragDropInitialisiert = true;

    window.KochbuchDragDrop.registriere({
      cardSelector: ".week-item",
      dropZoneSelector: ".week-day-items",
      onDrop: speichereNeueTagZuordnung
    });
  }

  function speichereNeueTagZuordnung(item) {
    var neuerTagContainer = item.closest(".week-day-items");
    if (!neuerTagContainer) return;
    var neuesDatum = neuerTagContainer.dataset.datum;
    var eintrag = state.eintraege.filter(function (e) { return e.id === item.dataset.id; })[0];
    if (!eintrag) return;

    // Neue Reihenfolge für ALLE Items in diesem Tag-Container speichern
    var items = neuerTagContainer.querySelectorAll(".week-item");
    var aufgaben = [];
    Array.prototype.forEach.call(items, function (el, index) {
      var e = state.eintraege.filter(function (x) { return x.id === el.dataset.id; })[0];
      if (!e) return;
      if (e.datum !== neuesDatum || e.reihenfolge !== index) {
        aufgaben.push(wochenplanCollection.speichern(Object.assign({}, e, { datum: neuesDatum, reihenfolge: index })));
      }
    });
    Promise.all(aufgaben);
  }

  // ---------- Wochen-Navigation ----------

  function vorherigeWoche() {
    state.angezeigteWoche = tagPlusX(state.angezeigteWoche, -7);
    render();
  }
  function naechsteWoche() {
    state.angezeigteWoche = tagPlusX(state.angezeigteWoche, 7);
    render();
  }
  function zuHeute() {
    state.angezeigteWoche = montagDieserWoche(new Date());
    render();
  }

  // ---------- Einkaufsliste aus Wochenplan generieren ----------

  function oeffneEinkaufslisteGenerieren() {
    var montag = state.angezeigteWoche;
    var alleRezepte = (window.KochbuchModul && window.KochbuchModul.getState().rezepte) || [];

    // Jeden Wochenplan-Eintrag (nicht nur jedes Rezept einmalig) einzeln
    // sammeln, da jeder Eintrag seine eigene Portionenzahl haben kann -
    // z.B. wenn dasselbe Rezept an zwei Tagen mit unterschiedlicher
    // Portionenzahl eingeplant wurde.
    var rezeptEintraegeInWoche = [];
    for (var i = 0; i < 7; i++) {
      var key = alsDatumKey(tagPlusX(montag, i));
      eintraegeFuerTag(key).forEach(function (e) {
        if (e.typ === "rezept" && e.rezeptId) rezeptEintraegeInWoche.push(e);
      });
    }

    if (rezeptEintraegeInWoche.length === 0) {
      zeigeKurzMeldung("Diese Woche sind noch keine Rezepte eingeplant.");
      return;
    }

    // Alle Zutaten aller eingeplanten Rezepte sammeln, mit Quelle (Rezepttitel)
    // - vorerst alle vorausgewählt, die Person kann vor dem Hinzufügen abwählen.
    // Mengen werden anhand der am Wochenplan-Eintrag gewählten Portionenzahl
    // skaliert, und anschließend auf ganze Zahlen aufgerundet (praktischer
    // zum Einkaufen).
    var zutatenZeilen = [];
    rezeptEintraegeInWoche.forEach(function (eintrag) {
      var r = alleRezepte.filter(function (x) { return x.id === eintrag.rezeptId; })[0];
      if (!r) return; // Rezept wurde inzwischen gelöscht

      var originalPortionen = parseInt(r.portionen, 10) || null;
      var gewaehltePortionen = eintrag.portionen || originalPortionen;
      var faktor = (originalPortionen && gewaehltePortionen) ? (gewaehltePortionen / originalPortionen) : 1;

      var zutaten = (r.zutaten || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
      zutaten.forEach(function (z) {
        var skaliert = window.KochbuchModul.skaliereUndRundeZutatZeile(z, faktor);
        zutatenZeilen.push({ text: skaliert, rezeptTitel: r.titel, ausgewaehlt: true });
      });
    });

    zeigeEinkaufslisteVorschau(zutatenZeilen, formatiereWochenSpanne(montag));
  }

  function zeigeEinkaufslisteVorschau(zutatenZeilen, wochenLabel) {
    var area = document.getElementById("week-edit-area");
    area.innerHTML = '<div class="modal-overlay" id="week-gen-overlay">' +
      '<div class="modal-box" style="max-width:460px;">' +
        '<h2>Einkaufsliste für ' + escapeHtml(wochenLabel) + '</h2>' +
        '<p>Wähle aus, was zur Einkaufsliste hinzugefügt werden soll. Du kannst die Texte vorher noch anpassen.</p>' +
        '<div id="week-gen-list" style="max-height:45vh;overflow-y:auto;margin-bottom:14px;"></div>' +
        '<div class="modal-actions">' +
          '<button id="week-gen-cancel">Abbrechen</button>' +
          '<button class="confirm" id="week-gen-confirm" style="background:var(--brown);border-color:var(--brown)">Zur Einkaufsliste hinzufügen</button>' +
        '</div>' +
      '</div>' +
    '</div>';

    var listEl = document.getElementById("week-gen-list");
    listEl.innerHTML = zutatenZeilen.map(function (z, i) {
      return '<div class="zutat-pick-row">' +
        '<span class="zutat-checkbox' + (z.ausgewaehlt ? " checked" : "") + '" data-gen-toggle="' + i + '">' +
          (z.ausgewaehlt ? "✓" : "") +
        '</span>' +
        '<input type="text" class="week-gen-input" data-gen-index="' + i + '" value="' + escapeHtml(z.text) + '" />' +
      '</div>';
    }).join("");

    Array.prototype.forEach.call(listEl.querySelectorAll("[data-gen-toggle]"), function (el) {
      el.addEventListener("click", function () {
        var idx = parseInt(el.dataset.genToggle, 10);
        zutatenZeilen[idx].ausgewaehlt = !zutatenZeilen[idx].ausgewaehlt;
        el.classList.toggle("checked");
        el.textContent = zutatenZeilen[idx].ausgewaehlt ? "✓" : "";
      });
    });
    Array.prototype.forEach.call(listEl.querySelectorAll(".week-gen-input"), function (input) {
      input.addEventListener("input", function () {
        zutatenZeilen[parseInt(input.dataset.genIndex, 10)].text = input.value;
      });
    });

    function schließen() { area.innerHTML = ""; }
    document.getElementById("week-gen-overlay").addEventListener("click", function (e) {
      if (e.target.id === "week-gen-overlay") schließen();
    });
    document.getElementById("week-gen-cancel").addEventListener("click", schließen);
    document.getElementById("week-gen-confirm").addEventListener("click", function () {
      var ausgewaehlte = zutatenZeilen.filter(function (z) { return z.ausgewaehlt && z.text.trim(); });
      if (window.EinkaufModul) {
        var gruppenNachRezept = {};
        ausgewaehlte.forEach(function (z) {
          if (!gruppenNachRezept[z.rezeptTitel]) gruppenNachRezept[z.rezeptTitel] = [];
          gruppenNachRezept[z.rezeptTitel].push(z.text);
        });
        Object.keys(gruppenNachRezept).forEach(function (titel) {
          window.EinkaufModul.fuegeZutatenAusRezeptHinzu(gruppenNachRezept[titel], titel);
        });
      }
      schließen();
      zeigeKurzMeldung(ausgewaehlte.length + " Zutaten zur Einkaufsliste hinzugefügt 🛒");
    });
  }

  // ---------- Rezept-Auswahl (Hinzufügen-Button im Wochenplan) ----------

  function oeffneRezeptAuswahl(datumKey) {
    var alleRezepte = (window.KochbuchModul && window.KochbuchModul.getState().rezepte) || [];
    var area = document.getElementById("week-edit-area");

    function rendereListe(suchtext) {
      var gefiltert = alleRezepte.filter(function (r) {
        return !suchtext || r.titel.toLowerCase().indexOf(suchtext.toLowerCase()) !== -1;
      }).sort(function (a, b) { return a.titel.localeCompare(b.titel, "de"); });

      var listHtml = gefiltert.length === 0
        ? '<p style="text-align:center;color:var(--brown);padding:20px 0;">Kein Rezept gefunden.</p>'
        : gefiltert.map(function (r) {
            return '<button class="week-recipe-pick-btn" data-rezept-id="' + r.id + '" data-rezept-titel="' + escapeHtml(r.titel) + '">' + escapeHtml(r.titel) + '</button>';
          }).join("");
      document.getElementById("week-recipe-pick-list").innerHTML = listHtml;

      Array.prototype.forEach.call(document.querySelectorAll(".week-recipe-pick-btn"), function (btn) {
        btn.addEventListener("click", function () {
          var rezept = alleRezepte.filter(function (r) { return r.id === btn.dataset.rezeptId; })[0];
          schließen();
          oeffnePortionenAbfrage(rezept, btn.dataset.rezeptId, btn.dataset.rezeptTitel, datumKey);
        });
      });
    }

    function oeffnePortionenAbfrage(rezept, rezeptId, rezeptTitel, zielDatum) {
      var originalPortionen = (rezept && parseInt(rezept.portionen, 10)) || 4;
      var gewaehltePortionen = originalPortionen;
      var portArea = document.getElementById("week-edit-area");

      portArea.innerHTML = '<div class="modal-overlay" id="week-portion-overlay">' +
        '<div class="modal-box">' +
          '<h2>' + escapeHtml(rezeptTitel) + '</h2>' +
          '<div class="field"><label>Für wie viele Portionen?<span class="hint">Skaliert die Mengen für die Einkaufsliste</span></label>' +
            '<div class="week-pick-portion-row">' +
              '<button type="button" class="portion-btn" id="week-portion-minus">−</button>' +
              '<span class="meta-stat-value" id="week-portion-value">' + originalPortionen + '</span>' +
              '<button type="button" class="portion-btn" id="week-portion-plus">+</button>' +
            '</div>' +
          '</div>' +
          '<div class="modal-actions" style="margin-top:14px;">' +
            '<button id="week-portion-cancel">Abbrechen</button>' +
            '<button class="confirm" id="week-portion-confirm" style="background:var(--brown);border-color:var(--brown)">Hinzufügen</button>' +
          '</div>' +
        '</div>' +
      '</div>';

      function portSchließen() { portArea.innerHTML = ""; }
      document.getElementById("week-portion-overlay").addEventListener("click", function (e) {
        if (e.target.id === "week-portion-overlay") portSchließen();
      });
      document.getElementById("week-portion-cancel").addEventListener("click", portSchließen);
      document.getElementById("week-portion-minus").addEventListener("click", function () {
        if (gewaehltePortionen > 1) {
          gewaehltePortionen--;
          document.getElementById("week-portion-value").textContent = gewaehltePortionen;
        }
      });
      document.getElementById("week-portion-plus").addEventListener("click", function () {
        gewaehltePortionen++;
        document.getElementById("week-portion-value").textContent = gewaehltePortionen;
      });
      document.getElementById("week-portion-confirm").addEventListener("click", function () {
        fuegeRezeptHinzu(rezeptId, rezeptTitel, zielDatum, gewaehltePortionen);
        portSchließen();
      });
    }

    area.innerHTML = '<div class="modal-overlay" id="week-recipe-pick-overlay">' +
      '<div class="modal-box" style="max-width:420px;">' +
        '<h2>Rezept hinzufügen</h2>' +
        '<input type="text" id="week-recipe-pick-search" placeholder="Rezept suchen..." style="margin-bottom:14px;" />' +
        '<div id="week-recipe-pick-list" style="max-height:45vh;overflow-y:auto;"></div>' +
        '<div class="modal-actions" style="margin-top:14px;">' +
          '<button id="week-recipe-pick-cancel">Abbrechen</button>' +
        '</div>' +
      '</div>' +
    '</div>';

    function schließen() { area.innerHTML = ""; }
    document.getElementById("week-recipe-pick-overlay").addEventListener("click", function (e) {
      if (e.target.id === "week-recipe-pick-overlay") schließen();
    });
    document.getElementById("week-recipe-pick-cancel").addEventListener("click", schließen);
    document.getElementById("week-recipe-pick-search").addEventListener("input", function (e) {
      rendereListe(e.target.value);
    });

    rendereListe("");
  }

  function zeigeKurzMeldung(text) {
    var el = document.createElement("div");
    el.textContent = text;
    el.style.position = "fixed";
    el.style.bottom = "84px";
    el.style.left = "50%";
    el.style.transform = "translateX(-50%)";
    el.style.background = "#3a2d22";
    el.style.color = "white";
    el.style.padding = "10px 18px";
    el.style.borderRadius = "999px";
    el.style.fontSize = "14px";
    el.style.zIndex = "70";
    el.style.boxShadow = "0 4px 14px rgba(0,0,0,0.2)";
    el.style.textAlign = "center";
    el.style.maxWidth = "85vw";
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2600);
  }

  function bindeStatischeEvents() {
    document.getElementById("week-prev-btn").addEventListener("click", vorherigeWoche);
    document.getElementById("week-next-btn").addEventListener("click", naechsteWoche);
    document.getElementById("week-today-btn").addEventListener("click", zuHeute);
    document.getElementById("week-generate-list-btn").addEventListener("click", oeffneEinkaufslisteGenerieren);
  }

  // Springt zu einer bestimmten Woche (für "Hinzufügen"-Button in Rezepten,
  // damit die Person direkt sieht, wo das Rezept eingeplant wurde)
  function zeigeWocheVon(datumKey) {
    var datum = new Date(datumKey + "T00:00:00");
    state.angezeigteWoche = montagDieserWoche(datum);
    render();
  }

  return {
    init: init,
    bindeStatischeEvents: bindeStatischeEvents,
    render: render,
    fuegeRezeptHinzu: fuegeRezeptHinzu,
    zeigeWocheVon: zeigeWocheVon,
    alsDatumKey: alsDatumKey,
    getState: function () { return state; }
  };
})();
