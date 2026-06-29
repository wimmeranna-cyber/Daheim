// kochbuch.js
// Modul für die Rezepte-Verwaltung: Liste, Kategorien, Suche, Filter,
// Detail-Ansicht mit Foto und Zutaten-Auswahl für die Einkaufsliste.

window.KochbuchModul = (function () {
  "use strict";

  // ---------- Daten ----------

  // Die Kategorien sind jetzt editierbar und werden in Firestore gespeichert
  // (Collection "rezeptKategorien"). Diese Liste ist nur die Erstbefüllung,
  // falls noch keine Kategorien in der Datenbank existieren.
  var STANDARD_KATEGORIEN = [
    { id: "suppen-salate", label: "Suppen & Salate", reihenfolge: 0 },
    { id: "hauptgericht", label: "Hauptgericht", reihenfolge: 1 },
    { id: "dessert", label: "Dessert", reihenfolge: 2 },
    { id: "einkochen", label: "Einkochen", reihenfolge: 3 },
    { id: "getraenke", label: "Getränke", reihenfolge: 4 },
    { id: "bbq", label: "BBQ", reihenfolge: 5 },
    { id: "brote-gebaeck", label: "Brote & Gebäck", reihenfolge: 6 }
  ];

  // Wird zur Laufzeit mit den Kategorien aus Firestore befüllt (live-synchron).
  var KATEGORIEN = STANDARD_KATEGORIEN.slice();
  var kategorienCollection = null;

  var FARBEN = [
    { id: "terracotta", hex: "#c2884f" },
    { id: "salbei", hex: "#5e7a52" },
    { id: "beere", hex: "#a23b2e" },
    { id: "senf", hex: "#c4972f" },
    { id: "pflaume", hex: "#7d5a7a" },
    { id: "ozean", hex: "#4a7a82" }
  ];

  var EMOJI_OPTIONEN = ["🍲","🥣","🥗","🍝","🍞","🥖","🧁","🍮","🍰","🥧","🫙","🥒","🍓","🍋","🥤","🍹","🔥","🍖","🥩","🌽","🍳","🥞","🧀","🍅","🌿","🍯","🫐","🍂","❄️","✨"];

  var leereForm = function () {
    return {
      id: null, titel: "", kategorie: KATEGORIEN[0].id, vegetarisch: false,
      portionen: "", zeit: "", zutaten: "", zubereitung: "", notizen: "",
      farbe: FARBEN[0].hex, emoji: "", fotoUrl: "", fotoPfad: "", favorit: false
    };
  };

  // ---------- State ----------

  var state = {
    rezepte: [],
    ansicht: "liste",
    aktiveKategorie: null,
    suche: "",
    filterVeg: false,
    ausgewaehlteId: null,
    form: leereForm(),
    bearbeiteId: null,
    confirmDeleteId: null,
    storageFehler: false,
    einkaufZutatenAuswahl: {}, // { "rezeptId_zutatIndex": true }
    sortierung: "alphabetisch", // "alphabetisch" | "kochzeit" | "favoriten"
    aktuellePortionen: null // temporäre Portionsanzahl für die offene Detail-Ansicht (skaliert Mengen live, ohne das Rezept zu verändern)
  };

  var rezepteCollection = null;

  function init() {
    rezepteCollection = window.KochbuchDB.erstelleCollection("rezepte", function (liste) {
      state.rezepte = liste;
      state.storageFehler = false;
      render();
    });
    kategorienCollection = window.KochbuchDB.erstelleCollection("rezeptKategorien", function (liste) {
      if (liste.length === 0) {
        // Noch keine Kategorien in der Datenbank - einmalig mit den
        // Standard-Kategorien befüllen (Migration für bestehende Rezepte).
        STANDARD_KATEGORIEN.forEach(function (k) { kategorienCollection.speichern(k); });
        return; // die eigene Speicherung löst gleich erneut diesen Callback aus
      }
      KATEGORIEN = liste;
      render();
      // Falls das Kategorien-Verwaltungsfenster gerade offen ist, auch
      // dessen Liste aktualisieren - render() allein kümmert sich nur um
      // die Hauptansicht (Liste/Detail/Formular), nicht um dieses Overlay.
      if (document.getElementById("kat-list")) {
        renderKategorienListe();
      }
    });
    window.addEventListener("kochbuch-storage-error", function (e) {
      if (e.detail && e.detail.collection === "rezepte") {
        state.storageFehler = true;
        render();
      }
    });
  }

  // ---------- Helpers ----------

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---------- Portionsgröße: Mengen in Zutatenzeilen erkennen & skalieren ----------

  // Erkennt eine führende Zahl (inkl. Brüche wie "1/2" oder "1 1/2") am
  // Anfang einer Zutatenzeile, z.B. "500g Mehl" oder "1 1/2 TL Salz".
  var MENGEN_REGEX = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)(\s*)(.*)$/;

  function parseZutatMenge(zeile) {
    var match = String(zeile || "").match(MENGEN_REGEX);
    if (!match) return null;
    var zahlText = match[1];
    var zahl;
    if (zahlText.indexOf("/") !== -1) {
      var teile = zahlText.split(/\s+/);
      if (teile.length === 2) {
        // "1 1/2" -> 1 + 1/2
        var bruch = teile[1].split("/");
        zahl = parseInt(teile[0], 10) + (parseInt(bruch[0], 10) / parseInt(bruch[1], 10));
      } else {
        var b = zahlText.split("/");
        zahl = parseInt(b[0], 10) / parseInt(b[1], 10);
      }
    } else {
      zahl = parseFloat(zahlText.replace(",", "."));
    }
    return { zahl: zahl, rest: match[3], zwischenraum: match[2] || " " };
  }

  // Formatiert eine skalierte Zahl möglichst "natürlich": ganze Zahlen ohne
  // Nachkommastellen, sonst maximal 2 Nachkommastellen, Kommata statt Punkt.
  function formatiereSkalierteZahl(zahl) {
    var gerundet = Math.round(zahl * 100) / 100;
    if (Math.abs(gerundet - Math.round(gerundet)) < 0.001) {
      return String(Math.round(gerundet));
    }
    return String(gerundet).replace(".", ",");
  }

  // Skaliert eine einzelne Zutatenzeile auf den Faktor (z.B. 1.5 für
  // anderthalbfache Menge). Zeilen ohne erkennbare Zahl bleiben unverändert.
  function skaliereZutatZeile(zeile, faktor) {
    if (faktor === 1) return zeile;
    var geparst = parseZutatMenge(zeile);
    if (!geparst) return zeile;
    var neueZahl = geparst.zahl * faktor;
    return formatiereSkalierteZahl(neueZahl) + geparst.zwischenraum + geparst.rest;
  }

  // Rundet die Menge einer Zutatenzeile auf die nächste ganze Zahl auf -
  // praktisch beim Einkaufen, wo man ohnehin meist ganze Packungen/Stück kauft.
  function rundeZutatZeileAuf(zeile) {
    var geparst = parseZutatMenge(zeile);
    if (!geparst) return zeile;
    var aufgerundet = Math.ceil(geparst.zahl);
    if (aufgerundet === geparst.zahl) return zeile; // war schon eine ganze Zahl
    return String(aufgerundet) + geparst.zwischenraum + geparst.rest;
  }

  // Kombiniert beide Schritte: erst auf den gewünschten Portionen-Faktor
  // skalieren, danach auf eine ganze Zahl aufrunden. Wird vom Wochenplan-
  // Modul genutzt, um Zutaten mehrerer Rezepte für die Einkaufsliste
  // korrekt vorzubereiten.
  function skaliereUndRundeZutatZeile(zeile, faktor) {
    return rundeZutatZeileAuf(skaliereZutatZeile(zeile, faktor));
  }

  function kategorieLabel(id) {
    var k = KATEGORIEN.filter(function (x) { return x.id === id; })[0];
    return k ? k.label : id;
  }

  // Kategorien selbst haben keine Icons mehr. Wenn ein Rezept kein eigenes
  // Emoji hat, wird ein neutrales Buch-Symbol als Fallback angezeigt.
  function anzeigeIcon(r) { return r.emoji || "📖"; }
  function anzeigeFarbe(r) { return r.farbe || FARBEN[0].hex; }

  function zutatenAuswahlAnzahl(rezeptId) {
    var n = 0;
    for (var key in state.einkaufZutatenAuswahl) {
      if (state.einkaufZutatenAuswahl[key] && key.indexOf(rezeptId + "_") === 0) n++;
    }
    return n;
  }

  function gefilterteListe() {
    var liste = state.rezepte.slice();
    if (state.aktiveKategorie) {
      liste = liste.filter(function (r) { return r.kategorie === state.aktiveKategorie; });
    }
    if (state.filterVeg) liste = liste.filter(function (r) { return r.vegetarisch; });
    if (state.suche.trim()) {
      var q = state.suche.trim().toLowerCase();
      liste = liste.filter(function (r) {
        return (r.titel || "").toLowerCase().indexOf(q) !== -1 ||
               (r.zutaten || "").toLowerCase().indexOf(q) !== -1 ||
               (r.notizen || "").toLowerCase().indexOf(q) !== -1;
      });
    }
    liste.sort(function (a, b) {
      if (state.sortierung === "kochzeit") {
        var za = zeitInMinuten(a.zeit);
        var zb = zeitInMinuten(b.zeit);
        // Rezepte ohne Zeitangabe landen ans Ende
        if (za === null && zb === null) return (a.titel || "").localeCompare(b.titel || "", "de");
        if (za === null) return 1;
        if (zb === null) return -1;
        return za - zb;
      }
      if (state.sortierung === "favoriten") {
        if (!!a.favorit !== !!b.favorit) return a.favorit ? -1 : 1;
        return (a.titel || "").localeCompare(b.titel || "", "de");
      }
      // Standard: alphabetisch
      return (a.titel || "").localeCompare(b.titel || "", "de");
    });
    return liste;
  }

  // Versucht, eine Zeitangabe wie "30 Min", "1 Std", "1,5 Std", "45min" in
  // Minuten umzurechnen. Gibt null zurück, wenn nichts Sinnvolles erkannt wird.
  function zeitInMinuten(zeitText) {
    if (!zeitText) return null;
    var text = String(zeitText).toLowerCase().replace(",", ".");
    var stundenMatch = text.match(/(\d+(?:\.\d+)?)\s*(std|stunde|stunden|h)/);
    var minutenMatch = text.match(/(\d+(?:\.\d+)?)\s*(min|minute|minuten|m\b)/);
    var nurZahl = text.match(/^(\d+(?:\.\d+)?)$/);
    var summe = 0;
    var erkannt = false;
    if (stundenMatch) { summe += parseFloat(stundenMatch[1]) * 60; erkannt = true; }
    if (minutenMatch) { summe += parseFloat(minutenMatch[1]); erkannt = true; }
    if (!erkannt && nurZahl) { summe = parseFloat(nurZahl[1]); erkannt = true; } // z.B. nur "30" -> Minuten angenommen
    return erkannt ? summe : null;
  }

  function anzahlProKategorie(id) {
    return state.rezepte.filter(function (r) { return r.kategorie === id; }).length;
  }

  function findRezept(id) {
    return state.rezepte.filter(function (r) { return r.id === id; })[0] || null;
  }

  // ---------- Render: Liste ----------

  function renderListe() {
    document.getElementById("subtitle").textContent =
      state.rezepte.length + " " + (state.rezepte.length === 1 ? "Rezept" : "Rezepte") + " gesammelt";

    var alertArea = document.getElementById("alert-area");
    alertArea.innerHTML = state.storageFehler
      ? '<div class="alert error">Speichern oder Laden hat nicht geklappt. Bitte versuch es nochmal.</div>'
      : "";

    document.getElementById("chip-veg").className = "chip" + (state.filterVeg ? " active" : "");
    document.getElementById("chip-reset").classList.toggle("hidden", !state.filterVeg);

    Array.prototype.forEach.call(document.querySelectorAll(".sort-chip"), function (chip) {
      chip.classList.toggle("active", chip.dataset.sort === state.sortierung);
    });

    var showCatGrid = !state.aktiveKategorie && !state.suche;
    var catGrid = document.getElementById("cat-grid");
    catGrid.classList.toggle("hidden", !showCatGrid);
    if (showCatGrid) {
      var sortierteKategorien = KATEGORIEN.slice().sort(function (a, b) {
        return (a.reihenfolge || 0) - (b.reihenfolge || 0);
      });
      catGrid.innerHTML = sortierteKategorien.map(function (k) {
        var n = anzahlProKategorie(k.id);
        return '<button class="cat-card" data-cat="' + k.id + '">' +
          '<div class="label">' + escapeHtml(k.label) + '</div>' +
          '<div class="count">' + n + ' ' + (n === 1 ? "Rezept" : "Rezepte") + '</div>' +
          '</button>';
      }).join("");
      Array.prototype.forEach.call(catGrid.querySelectorAll(".cat-card"), function (btn) {
        btn.addEventListener("click", function () {
          state.aktiveKategorie = btn.dataset.cat;
          renderListe();
        });
      });
    }

    var showBackRow = !!(state.aktiveKategorie || state.suche);
    document.getElementById("back-row").classList.toggle("hidden", !showBackRow);
    document.getElementById("active-cat-label").textContent = state.aktiveKategorie
      ? kategorieLabel(state.aktiveKategorie)
      : "";

    var liste = gefilterteListe();
    var listEl = document.getElementById("recipe-list");
    if (liste.length === 0) {
      var hatRezepte = state.rezepte.length > 0;
      listEl.innerHTML = '<div class="empty">' +
        '<div class="emoji">' + (hatRezepte ? "🔎" : "🍽️") + '</div>' +
        '<div class="title">' + (hatRezepte ? "Kein Rezept gefunden" : "Noch keine Rezepte hier") + '</div>' +
        '<div class="desc">' + (hatRezepte ? "Versuch eine andere Suche oder andere Filter." : "Füge dein erstes Rezept hinzu und fang an zu sammeln.") + '</div>' +
        (hatRezepte ? "" : '<button id="empty-add-btn">Erstes Rezept hinzufügen</button>') +
        '</div>';
      if (!hatRezepte) {
        document.getElementById("empty-add-btn").addEventListener("click", function () { öffneNeuesFormular(); });
      }
    } else {
      listEl.innerHTML = liste.map(function (r) {
        var farbe = anzeigeFarbe(r);
        var tags = "";
        if (r.vegetarisch) tags += '<span title="Vegetarisch">🌿</span>';
        var badgeHtml = r.fotoUrl
          ? '<img src="' + r.fotoUrl + '" class="row-photo" alt="" />'
          : '<span class="badge" style="background:' + farbe + '22;border:1.5px solid ' + farbe + '55">' + anzeigeIcon(r) + '</span>';
        return '<div class="recipe-row-wrap">' +
          '<button class="recipe-row" data-id="' + r.id + '">' +
            badgeHtml +
            '<span class="info">' +
              '<div class="name">' + escapeHtml(r.titel) + '</div>' +
              '<div class="meta"><span>' + escapeHtml(kategorieLabel(r.kategorie)) + '</span>' +
              (r.zeit ? '<span>⏱ ' + escapeHtml(r.zeit) + '</span>' : "") + '</div>' +
            '</span>' +
            '<span class="tags">' + tags + '</span>' +
          '</button>' +
          '<button class="fav-toggle' + (r.favorit ? " active" : "") + '" data-fav-id="' + r.id + '" aria-label="Favorit">' + (r.favorit ? "❤️" : "🤍") + '</button>' +
        '</div>';
      }).join("");
      Array.prototype.forEach.call(listEl.querySelectorAll(".recipe-row"), function (btn) {
        btn.addEventListener("click", function () {
          state.ausgewaehlteId = btn.dataset.id;
          state.ansicht = "detail";
          state.aktuellePortionen = null;
          render();
        });
      });
      Array.prototype.forEach.call(listEl.querySelectorAll(".fav-toggle"), function (btn) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          schalteFavoritUm(btn.dataset.favId);
        });
      });
    }
  }

  function schalteFavoritUm(rezeptId) {
    var r = findRezept(rezeptId);
    if (!r) return;
    rezepteCollection.speichern(Object.assign({}, r, { favorit: !r.favorit }));
  }

  function formatiereRezeptAlsText(r) {
    var zutaten = (r.zutaten || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    var schritte = (r.zubereitung || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean);

    var teile = [];
    teile.push((r.emoji || "🍽️") + " " + r.titel);
    var metaZeile = [];
    if (r.portionen) metaZeile.push("👥 " + r.portionen);
    if (r.zeit) metaZeile.push("⏱ " + r.zeit);
    if (metaZeile.length) teile.push(metaZeile.join("  ·  "));
    if (r.vegetarisch) {
      teile.push("🌿 Vegetarisch");
    }
    teile.push("");

    if (zutaten.length) {
      teile.push("ZUTATEN");
      zutaten.forEach(function (z) { teile.push("• " + z); });
      teile.push("");
    }
    if (schritte.length) {
      teile.push("ZUBEREITUNG");
      schritte.forEach(function (s, i) { teile.push((i + 1) + ". " + s); });
      teile.push("");
    }
    if (r.notizen) {
      teile.push("NOTIZEN");
      teile.push(r.notizen);
    }
    return teile.join("\n").trim();
  }

  function teileRezept(r) {
    var text = formatiereRezeptAlsText(r);
    kopiereInZwischenablage(text).then(function (erfolgreich) {
      if (erfolgreich) {
        zeigeKurzMeldung("Rezept kopiert – einfügen z. B. in WhatsApp 📋");
      } else {
        zeigeKurzMeldung("Kopieren hat nicht geklappt 😕");
      }
    });
  }

  function kopiereInZwischenablage(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () {
        return kopiereInZwischenablageFallback(text);
      });
    }
    return Promise.resolve(kopiereInZwischenablageFallback(text));
  }

  function kopiereInZwischenablageFallback(text) {
    try {
      var textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      var erfolgreich = document.execCommand("copy");
      textarea.remove();
      return erfolgreich;
    } catch (err) {
      return false;
    }
  }

  // ---------- Zum Wochenplan hinzufügen ----------

  function oeffneWochenplanAuswahl(r) {
    var area = document.getElementById("lightbox-area");
    var heute = new Date();
    var tage = [];
    var wochentagsNamen = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
    for (var i = 0; i < 7; i++) {
      var d = new Date(heute);
      d.setDate(d.getDate() + i);
      var key = window.WochenplanModul.alsDatumKey(d);
      var label = i === 0 ? "Heute" : (i === 1 ? "Morgen" : wochentagsNamen[d.getDay()] + ", " + d.getDate() + "." + (d.getMonth() + 1) + ".");
      tage.push({ key: key, label: label });
    }

    var originalPortionen = parseInt(r.portionen, 10) || 4;

    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "week-pick-overlay";
    overlay.innerHTML = '<div class="modal-box">' +
      '<h2>Zum Wochenplan hinzufügen</h2>' +
      '<div class="field"><label>Für wie viele Portionen?<span class="hint">Skaliert die Mengen für die Einkaufsliste</span></label>' +
        '<div class="week-pick-portion-row">' +
          '<button type="button" class="portion-btn" id="week-pick-portion-minus">−</button>' +
          '<span class="meta-stat-value" id="week-pick-portion-value">' + originalPortionen + '</span>' +
          '<button type="button" class="portion-btn" id="week-pick-portion-plus">+</button>' +
        '</div>' +
      '</div>' +
      '<p>Für welchen Tag?</p>' +
      '<div class="week-day-pick-list">' +
        tage.map(function (t) {
          return '<button class="week-day-pick-btn" data-day-key="' + t.key + '">' + t.label + '</button>';
        }).join("") +
      '</div>' +
      '<div class="modal-actions" style="margin-top:14px;">' +
        '<button id="week-pick-cancel">Abbrechen</button>' +
      '</div>' +
    '</div>';
    area.appendChild(overlay);

    var gewaehltePortionen = originalPortionen;
    document.getElementById("week-pick-portion-minus").addEventListener("click", function () {
      if (gewaehltePortionen > 1) {
        gewaehltePortionen--;
        document.getElementById("week-pick-portion-value").textContent = gewaehltePortionen;
      }
    });
    document.getElementById("week-pick-portion-plus").addEventListener("click", function () {
      gewaehltePortionen++;
      document.getElementById("week-pick-portion-value").textContent = gewaehltePortionen;
    });

    function schließen() { overlay.remove(); }
    overlay.addEventListener("click", function (e) { if (e.target === overlay) schließen(); });
    document.getElementById("week-pick-cancel").addEventListener("click", schließen);

    Array.prototype.forEach.call(overlay.querySelectorAll(".week-day-pick-btn"), function (btn) {
      btn.addEventListener("click", function () {
        window.WochenplanModul.fuegeRezeptHinzu(r.id, r.titel, btn.dataset.dayKey, gewaehltePortionen).then(function () {
          zeigeKurzMeldung("Zum Wochenplan hinzugefügt 📅");
        });
        schließen();
      });
    });
  }

  // Wird vom Wochenplan-Modul aufgerufen (über App), um direkt ein
  // bestimmtes Rezept in der Detail-Ansicht zu öffnen.
  function oeffneRezeptDirekt(rezeptId) {
    var r = findRezept(rezeptId);
    if (!r) {
      zeigeKurzMeldung("Dieses Rezept wurde leider gelöscht.");
      return;
    }
    state.ausgewaehlteId = rezeptId;
    state.ansicht = "detail";
    state.aktuellePortionen = null;
    render();
  }

  // ---------- Render: Detail ----------

  function renderDetail() {
    var r = findRezept(state.ausgewaehlteId);
    var container = document.getElementById("view-detail");
    if (!r) { container.innerHTML = ""; return; }

    var zutaten = (r.zutaten || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    var schritte = (r.zubereitung || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    var farbe = anzeigeFarbe(r);

    var html = '<div class="detail-top">' +
      '<button class="back-btn" id="detail-back">‹ Zurück</button>' +
      '<span class="detail-actions">' +
        '<button class="icon-btn" id="detail-fav" aria-label="Favorit">' + (r.favorit ? "❤️" : "🤍") + '</button>' +
        '<button class="icon-btn" id="detail-share" aria-label="Teilen">📨</button>' +
        '<button class="icon-btn" id="detail-week" aria-label="Zum Wochenplan">📅</button>' +
        '<button class="icon-btn" id="detail-edit" aria-label="Bearbeiten">✏️</button>' +
        '<button class="icon-btn danger" id="detail-delete" aria-label="Löschen">🗑️</button>' +
      '</span>' +
      '</div>';

    if (r.fotoUrl) {
      html += '<div class="recipe-photo-wrap">' +
        '<img src="' + r.fotoUrl + '" class="recipe-photo" id="detail-foto" alt="Foto von ' + escapeHtml(r.titel) + '" />' +
        '<span class="zoom-hint">🔍 Vergrößern</span>' +
      '</div>';
    }

    var ausgangsPortionen = parseInt(r.portionen, 10) || null;
    var aktuellePortionen = state.aktuellePortionen || ausgangsPortionen;
    var skalierungsFaktor = (ausgangsPortionen && aktuellePortionen) ? (aktuellePortionen / ausgangsPortionen) : 1;

    html += '<div class="hero-badge" style="background:' + farbe + '22;border:2px solid ' + farbe + '66">' + anzeigeIcon(r) + '</div>' +
      '<h1 class="recipe-title">' + escapeHtml(r.titel) + '</h1>' +
      '<div class="recipe-meta-prominent">' +
        (r.zeit
          ? '<div class="meta-stat"><span class="meta-stat-icon">⏱</span><span class="meta-stat-value">' + escapeHtml(r.zeit) + '</span></div>'
          : '') +
        (ausgangsPortionen
          ? '<div class="meta-stat meta-stat-portionen">' +
              '<span class="meta-stat-icon">👥</span>' +
              '<button class="portion-btn" id="portion-minus" aria-label="Weniger Portionen">−</button>' +
              '<span class="meta-stat-value" id="portion-value">' + aktuellePortionen + '</span>' +
              '<button class="portion-btn" id="portion-plus" aria-label="Mehr Portionen">+</button>' +
            '</div>'
          : '') +
      '</div>' +
      '<div class="recipe-meta"><span>' + escapeHtml(kategorieLabel(r.kategorie)) + '</span></div>';

    if (r.vegetarisch) {
      html += '<div class="recipe-tags"><span class="tag veg">🌿 Vegetarisch</span></div>';
    }

    if (zutaten.length) {
      html += '<section class="block"><h2>Zutaten' +
        (skalierungsFaktor !== 1 ? '<span class="zutaten-skaliert-hinweis">für ' + aktuellePortionen + ' Portionen</span>' : '') +
        '</h2>' +
        zutaten.map(function (z, i) {
          var checked = !!state.einkaufZutatenAuswahl[r.id + "_" + i];
          var angezeigterText = skaliereZutatZeile(z, skalierungsFaktor);
          return '<div class="zutat-pick-row" data-zutat-index="' + i + '">' +
            '<span class="zutat-checkbox' + (checked ? " checked" : "") + '" data-zutat-check="' + i + '">' +
              (checked ? "✓" : "") +
            '</span>' +
            '<span>' + escapeHtml(angezeigterText) + '</span>' +
          '</div>';
        }).join("") +
      '<div class="add-to-list-bar' + (zutatenAuswahlAnzahl(r.id) > 0 ? '' : ' hidden') + '" id="add-to-list-bar">' +
        '<span id="add-to-list-count">' + zutatenAuswahlAnzahl(r.id) + ' ausgewählt</span>' +
        '<button id="add-to-list-btn">Zur Einkaufsliste</button>' +
      '</div>' +
      '</section>';
    }

    if (schritte.length) {
      html += '<section class="block"><h2>Zubereitung</h2><ol class="schritte-list">' +
        schritte.map(function (s, i) {
          return '<li><span class="num" style="color:' + farbe + '">' + (i + 1) + '.</span><span>' + escapeHtml(s) + '</span></li>';
        }).join("") + '</ol></section>';
    }

    if (r.notizen) {
      html += '<section class="block"><h2>Notizen</h2><p class="notes-text">' + escapeHtml(r.notizen) + '</p></section>';
    }

    container.innerHTML = html;

    document.getElementById("detail-back").addEventListener("click", function () {
      state.ansicht = "liste"; state.ausgewaehlteId = null; state.aktuellePortionen = null; render();
    });
    document.getElementById("detail-fav").addEventListener("click", function () {
      schalteFavoritUm(r.id);
    });
    document.getElementById("detail-share").addEventListener("click", function () {
      teileRezept(r);
    });
    document.getElementById("detail-week").addEventListener("click", function () {
      oeffneWochenplanAuswahl(r);
    });
    document.getElementById("detail-edit").addEventListener("click", function () {
      öffneBearbeiten(r);
    });
    document.getElementById("detail-delete").addEventListener("click", function () {
      state.confirmDeleteId = r.id; renderModal();
    });

    var detailFoto = document.getElementById("detail-foto");
    if (detailFoto) {
      detailFoto.addEventListener("click", function () {
        öffneLightbox(r.fotoUrl, r.titel);
      });
    }

    var portionMinus = document.getElementById("portion-minus");
    var portionPlus = document.getElementById("portion-plus");
    if (portionMinus && portionPlus) {
      portionMinus.addEventListener("click", function () {
        var aktuell = state.aktuellePortionen || (parseInt(r.portionen, 10) || 1);
        if (aktuell > 1) {
          state.aktuellePortionen = aktuell - 1;
          renderDetail();
        }
      });
      portionPlus.addEventListener("click", function () {
        var aktuell = state.aktuellePortionen || (parseInt(r.portionen, 10) || 1);
        state.aktuellePortionen = aktuell + 1;
        renderDetail();
      });
    }

    Array.prototype.forEach.call(container.querySelectorAll("[data-zutat-check]"), function (el) {
      el.addEventListener("click", function () {
        var idx = el.dataset.zutatCheck;
        var key = r.id + "_" + idx;
        state.einkaufZutatenAuswahl[key] = !state.einkaufZutatenAuswahl[key];
        renderDetail();
      });
    });

    var addToListBtn = document.getElementById("add-to-list-btn");
    if (addToListBtn) {
      addToListBtn.addEventListener("click", function () {
        var ausgewaehlteZutaten = [];
        zutaten.forEach(function (z, i) {
          var key = r.id + "_" + i;
          if (state.einkaufZutatenAuswahl[key]) {
            // Skalierte Menge (passend zur aktuell eingestellten Portionenzahl)
            // übernehmen, und dabei auf eine ganze Zahl aufrunden - das ist
            // praktischer beim Einkaufen (z.B. "1,3 Zwiebeln" -> "2 Zwiebeln").
            var skalierteZeile = skaliereZutatZeile(z, skalierungsFaktor);
            var aufgerundeteZeile = rundeZutatZeileAuf(skalierteZeile);
            ausgewaehlteZutaten.push(aufgerundeteZeile);
            delete state.einkaufZutatenAuswahl[key];
          }
        });
        if (window.EinkaufModul && ausgewaehlteZutaten.length) {
          window.EinkaufModul.fuegeZutatenAusRezeptHinzu(ausgewaehlteZutaten, r.titel);
        }
        renderDetail();
        zeigeKurzMeldung("Zur Einkaufsliste hinzugefügt 🛒");
      });
    }
  }

  function zeigeKurzMeldung(text) {
    var el = document.createElement("div");
    el.textContent = text;
    el.style.position = "fixed";
    el.style.bottom = "76px";
    el.style.left = "50%";
    el.style.transform = "translateX(-50%)";
    el.style.background = "#3a2d22";
    el.style.color = "white";
    el.style.padding = "10px 18px";
    el.style.borderRadius = "999px";
    el.style.fontSize = "14px";
    el.style.zIndex = "70";
    el.style.boxShadow = "0 4px 14px rgba(0,0,0,0.2)";
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2200);
  }

  // ---------- Lightbox (Foto-Vollbild) ----------

  function öffneLightbox(url, titel) {
    var area = document.getElementById("lightbox-area");
    var lightbox = document.createElement("div");
    lightbox.className = "lightbox-overlay";
    lightbox.id = "foto-lightbox";
    lightbox.innerHTML =
      '<button class="lightbox-close" id="lightbox-close-btn" aria-label="Schließen">✕</button>' +
      '<img src="' + url + '" alt="Foto von ' + escapeHtml(titel) + '" />';
    area.appendChild(lightbox);

    function schließen() { lightbox.remove(); }
    lightbox.addEventListener("click", schließen);
    document.getElementById("lightbox-close-btn").addEventListener("click", function (e) {
      e.stopPropagation();
      schließen();
    });
  }

  // ---------- Render: Formular ----------

  function renderFormular() {
    var f = state.form;
    var container = document.getElementById("view-formular");

    var html = '<div class="form-top">' +
      '<button class="back-btn" id="form-cancel">✕ Abbrechen</button>' +
      '<h1>' + (state.bearbeiteId ? "Rezept bearbeiten" : "Neues Rezept") + '</h1>' +
      '<span style="width:64px"></span>' +
      '</div>';

    if (state.storageFehler) {
      html += '<div class="alert error">Speichern hat nicht geklappt. Das Rezept bleibt aber für diese Sitzung erhalten.</div>';
    }

    html += '<div class="field"><label>Titel</label>' +
      '<input type="text" id="f-titel" placeholder="z. B. Omas Kürbissuppe" value="' + escapeHtml(f.titel) + '" /></div>';

    html += '<div class="field"><label>Kategorie</label><div class="cat-pick-grid">' +
      KATEGORIEN.slice().sort(function (a, b) { return (a.reihenfolge || 0) - (b.reihenfolge || 0); }).map(function (k) {
        return '<button type="button" class="cat-pick-btn' + (f.kategorie === k.id ? " active" : "") + '" data-cat="' + k.id + '">' +
          escapeHtml(k.label) + '</button>';
      }).join("") + '</div></div>';

    html += '<div class="form-row">' +
      '<div class="field"><label>Portionen</label><input type="text" id="f-portionen" placeholder="4" value="' + escapeHtml(f.portionen) + '" /></div>' +
      '<div class="field"><label>Zeit</label><input type="text" id="f-zeit" placeholder="30 Min" value="' + escapeHtml(f.zeit) + '" /></div>' +
      '</div>';

    html += '<div class="toggle-row">' +
      '<button type="button" class="toggle-btn" id="f-veg" style="' + (f.vegetarisch ? "background:#5e7a52;border-color:#5e7a52;color:white" : "") + '">🌿 Vegetarisch</button>' +
      '</div>';

    html += '<div class="field" id="foto-feld"><label>Foto<span class="hint">Optional - aus Galerie oder mit Kamera</span></label>' +
      (f.fotoUrl
        ? '<div class="foto-preview-wrap">' +
            '<img src="' + escapeHtml(f.fotoUrl) + '" class="foto-preview" alt="Rezeptfoto" />' +
            '<button type="button" class="foto-remove-btn" id="f-foto-entfernen">Foto entfernen</button>' +
          '</div>'
        : '<div class="foto-upload-buttons">' +
            '<label class="foto-upload-btn" for="f-foto-kamera">📷 Foto aufnehmen' +
              '<input type="file" accept="image/*" capture="environment" id="f-foto-kamera" class="hidden" />' +
            '</label>' +
            '<label class="foto-upload-btn" for="f-foto-galerie">🖼️ Aus Galerie wählen' +
              '<input type="file" accept="image/*" id="f-foto-galerie" class="hidden" />' +
            '</label>' +
          '</div>') +
      '<div id="foto-status"></div>' +
      '</div>';

    html += '<div class="field"><label>Farbe &amp; Icon<span class="hint">So erkennst du das Rezept auf einen Blick</span></label>' +
      '<div class="color-icon-preview">' +
        '<span class="preview-badge" id="f-preview" style="background:' + f.farbe + '22;border:2px solid ' + f.farbe + '66">' + (f.emoji || "📖") + '</span>' +
        '<div class="color-swatches">' +
          FARBEN.map(function (c) {
            return '<button type="button" class="swatch' + (f.farbe === c.hex ? " active" : "") + '" data-hex="' + c.hex + '" style="background:' + c.hex + '" aria-label="Farbe ' + c.id + '"></button>';
          }).join("") +
        '</div>' +
      '</div>' +
      '<div class="emoji-grid">' +
        EMOJI_OPTIONEN.map(function (e) {
          var active = f.emoji === e;
          return '<button type="button" class="emoji-btn' + (active ? " active" : "") + '" data-emoji="' + e + '" style="' +
            (active ? "background:" + f.farbe + "33;border-color:" + f.farbe + ";color:" + f.farbe : "") + '">' + e + '</button>';
        }).join("") +
      '</div></div>';

    html += '<div class="field"><label>Zutaten<span class="hint">Eine Zutat pro Zeile</span></label>' +
      '<textarea id="f-zutaten" rows="5" placeholder="500g Kürbis\n1 Zwiebel\n400ml Brühe">' + escapeHtml(f.zutaten) + '</textarea></div>';

    html += '<div class="field"><label>Zubereitung<span class="hint">Ein Schritt pro Zeile</span></label>' +
      '<textarea id="f-zubereitung" rows="6" placeholder="Zwiebel anbraten\nKürbis dazugeben und köcheln\nPürieren und abschmecken">' + escapeHtml(f.zubereitung) + '</textarea></div>';

    html += '<div class="field"><label>Notizen<span class="hint">Optional - Tipps, Varianten...</span></label>' +
      '<textarea id="f-notizen" rows="3" placeholder="Schmeckt auch gut mit etwas Ingwer...">' + escapeHtml(f.notizen) + '</textarea></div>';

    var titelLeer = !f.titel.trim();
    html += '<button class="save-btn" id="f-save"' + (titelLeer ? " disabled" : "") + '>👨‍🍳 ' +
      (state.bearbeiteId ? "Änderungen speichern" : "Rezept speichern") + '</button>';
    if (titelLeer) html += '<p class="save-hint">Titel eingeben, um speichern zu können</p>';

    container.innerHTML = html;

    document.getElementById("form-cancel").addEventListener("click", function () {
      state.ansicht = state.bearbeiteId ? "detail" : "liste";
      render();
    });

    document.getElementById("f-titel").addEventListener("input", function (e) {
      state.form.titel = e.target.value;
      document.getElementById("f-save").disabled = !state.form.titel.trim();
      var hintEl = container.querySelector(".save-hint");
      if (state.form.titel.trim() && hintEl) hintEl.remove();
      if (!state.form.titel.trim() && !hintEl) {
        var p = document.createElement("p");
        p.className = "save-hint";
        p.textContent = "Titel eingeben, um speichern zu können";
        document.getElementById("f-save").insertAdjacentElement("afterend", p);
      }
    });

    Array.prototype.forEach.call(container.querySelectorAll(".cat-pick-btn"), function (btn) {
      btn.addEventListener("click", function () {
        state.form.kategorie = btn.dataset.cat;
        renderFormular();
      });
    });

    document.getElementById("f-portionen").addEventListener("input", function (e) { state.form.portionen = e.target.value; });
    document.getElementById("f-zeit").addEventListener("input", function (e) { state.form.zeit = e.target.value; });
    document.getElementById("f-zutaten").addEventListener("input", function (e) { state.form.zutaten = e.target.value; });
    document.getElementById("f-zubereitung").addEventListener("input", function (e) { state.form.zubereitung = e.target.value; });
    document.getElementById("f-notizen").addEventListener("input", function (e) { state.form.notizen = e.target.value; });

    document.getElementById("f-veg").addEventListener("click", function () {
      state.form.vegetarisch = !state.form.vegetarisch; renderFormular();
    });

    Array.prototype.forEach.call(container.querySelectorAll(".swatch"), function (btn) {
      btn.addEventListener("click", function () {
        state.form.farbe = btn.dataset.hex; renderFormular();
      });
    });
    Array.prototype.forEach.call(container.querySelectorAll(".emoji-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var e = btn.dataset.emoji;
        state.form.emoji = (state.form.emoji === e) ? "" : e;
        renderFormular();
      });
    });

    document.getElementById("f-save").addEventListener("click", function () {
      speichereFormular();
    });

    var fotoKamera = document.getElementById("f-foto-kamera");
    var fotoGalerie = document.getElementById("f-foto-galerie");
    var fotoEntfernen = document.getElementById("f-foto-entfernen");

    if (fotoKamera) fotoKamera.addEventListener("change", function (e) { behandleFotoAuswahl(e.target.files[0]); });
    if (fotoGalerie) fotoGalerie.addEventListener("change", function (e) { behandleFotoAuswahl(e.target.files[0]); });
    if (fotoEntfernen) {
      fotoEntfernen.addEventListener("click", function () {
        state.form.fotoUrl = "";
        state.form.fotoPfad = "";
        zeigeFotoStatus("", false);
        renderFormular();
      });
    }
  }

  // Firestore erlaubt max. 1 MB pro Dokument. Wir zielen auf Base64-Fotos von
  // klar unter 700 KB, damit auch mit Titel/Zutaten/Text noch Luft bleibt.
  var FOTO_ZIEL_BYTES = 700 * 1024;

  function behandleFotoAuswahl(file) {
    if (!file) return;
    if (!file.type || file.type.indexOf("image/") !== 0) {
      zeigeFotoStatus("Das ist keine Bilddatei.", true);
      return;
    }
    var MAX_BYTES = 15 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      zeigeFotoStatus("Foto ist zu groß (max. 15 MB).", true);
      return;
    }
    zeigeFotoStatus("Foto wird verkleinert...", false);
    komprimiereBildAufZielgroesse(file).then(function (dataUrl) {
      state.form.fotoUrl = dataUrl;
      state.form.fotoPfad = "";
      renderFormular();
    }).catch(function (err) {
      console.error("Foto-Verarbeitung fehlgeschlagen:", err);
      zeigeFotoStatus("Das hat leider nicht geklappt. Bitte versuch ein anderes Foto.", true);
    });
  }

  function zeigeFotoStatus(text, istFehler) {
    var el = document.getElementById("foto-status");
    if (!el) return;
    el.textContent = text;
    el.style.color = istFehler ? "#a23b2e" : "#9c6b3e";
  }

  function komprimiereBildAufZielgroesse(file) {
    return ladeBildElement(file).then(function (img) {
      var versuche = [
        { breite: 900, qualitaet: 0.7 },
        { breite: 700, qualitaet: 0.6 },
        { breite: 550, qualitaet: 0.55 },
        { breite: 400, qualitaet: 0.5 },
        { breite: 300, qualitaet: 0.45 }
      ];
      return probiereKompression(img, versuche, 0);
    });
  }

  function probiereKompression(img, versuche, index) {
    if (index >= versuche.length) {
      return Promise.reject(new Error("Bild konnte nicht klein genug komprimiert werden"));
    }
    var v = versuche[index];
    return zeichneUndExportiere(img, v.breite, v.qualitaet).then(function (dataUrl) {
      if (dataUrl.length <= FOTO_ZIEL_BYTES || index === versuche.length - 1) {
        return dataUrl;
      }
      return probiereKompression(img, versuche, index + 1);
    });
  }

  function zeichneUndExportiere(img, maxBreite, qualitaet) {
    return new Promise(function (resolve) {
      var canvas = document.createElement("canvas");
      var skala = Math.min(1, maxBreite / img.width);
      canvas.width = Math.round(img.width * skala);
      canvas.height = Math.round(img.height * skala);
      var ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", qualitaet));
    });
  }

  function ladeBildElement(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var objectUrl = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(objectUrl);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Bild konnte nicht gelesen werden"));
      };
      img.src = objectUrl;
    });
  }

  // ---------- Render: Modal ----------

  function renderModal() {
    var area = document.getElementById("modal-area");
    if (!state.confirmDeleteId) { area.innerHTML = ""; return; }
    area.innerHTML = '<div class="modal-overlay">' +
      '<div class="modal-box">' +
        '<h2>Rezept löschen?</h2>' +
        '<p>Das kann nicht rückgängig gemacht werden.</p>' +
        '<div class="modal-actions">' +
          '<button id="modal-cancel">Abbrechen</button>' +
          '<button class="confirm" id="modal-confirm">Löschen</button>' +
        '</div>' +
      '</div>' +
      '</div>';
    document.getElementById("modal-cancel").addEventListener("click", function () {
      state.confirmDeleteId = null; renderModal();
    });
    document.getElementById("modal-confirm").addEventListener("click", function () {
      löscheRezept(state.confirmDeleteId);
    });
  }

  // ---------- Aktionen ----------

  function öffneNeuesFormular(kategorieVorgabe) {
    state.form = leereForm();
    state.form.kategorie = kategorieVorgabe || state.aktiveKategorie || KATEGORIEN[0].id;
    state.bearbeiteId = null;
    state.ansicht = "formular";
    render();
  }

  function öffneBearbeiten(r) {
    state.form = {
      id: r.id, titel: r.titel, kategorie: r.kategorie,
      vegetarisch: !!r.vegetarisch,
      portionen: r.portionen || "", zeit: r.zeit || "",
      zutaten: r.zutaten || "", zubereitung: r.zubereitung || "", notizen: r.notizen || "",
      farbe: r.farbe || FARBEN[0].hex, emoji: r.emoji || "",
      fotoUrl: r.fotoUrl || "", fotoPfad: r.fotoPfad || ""
    };
    state.bearbeiteId = r.id;
    state.ansicht = "formular";
    render();
  }

  function speichereFormular() {
    if (!state.form.titel.trim()) return;
    var rezeptId = state.bearbeiteId || window.KochbuchDB.neueId("r");
    var rezeptDaten = Object.assign({}, state.form, { id: rezeptId });

    var saveBtn = document.getElementById("f-save");
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Speichern..."; }

    rezepteCollection.speichern(rezeptDaten).then(function (ok) {
      if (ok) {
        state.ansicht = "liste";
        render();
      } else {
        state.storageFehler = true;
        renderFormular();
      }
    });
  }

  function löscheRezept(id) {
    rezepteCollection.loeschen(id).then(function (ok) {
      state.confirmDeleteId = null;
      if (ok && state.ausgewaehlteId === id) {
        state.ansicht = "liste";
        state.ausgewaehlteId = null;
      }
      render();
      renderModal();
    });
  }

  // ---------- Haupt-Render (vom App-Modul aufgerufen) ----------

  function render() {
    var kochbuchTabAktiv = !window.App || window.App.getAktiverTab() === "kochbuch";

    // Sichtbarkeit der drei Kochbuch-Views selbst steuern, damit das
    // korrekt funktioniert egal ob render() von hier intern oder von
    // App.render() aus aufgerufen wird (z.B. nach Tab-Wechsel oder
    // Live-Sync-Update im Hintergrund, während der Einkauf-Tab aktiv ist).
    document.getElementById("view-liste").classList.toggle("hidden", !(kochbuchTabAktiv && state.ansicht === "liste"));
    document.getElementById("view-detail").classList.toggle("hidden", !(kochbuchTabAktiv && state.ansicht === "detail"));
    document.getElementById("view-formular").classList.toggle("hidden", !(kochbuchTabAktiv && state.ansicht === "formular"));

    if (state.ansicht === "liste") renderListe();
    if (state.ansicht === "detail") renderDetail();
    if (state.ansicht === "formular") renderFormular();
    renderModal();
  }

  // ---------- Statische Event-Bindings ----------

  function bindeStatischeEvents() {
    document.getElementById("search-input").addEventListener("input", function (e) {
      state.suche = e.target.value; renderListe();
    });
    document.getElementById("chip-veg").addEventListener("click", function () {
      state.filterVeg = !state.filterVeg; renderListe();
    });
    document.getElementById("chip-reset").addEventListener("click", function () {
      state.filterVeg = false; renderListe();
    });
    document.getElementById("back-to-categories").addEventListener("click", function () {
      state.aktiveKategorie = null; state.suche = "";
      document.getElementById("search-input").value = "";
      renderListe();
    });
    document.getElementById("fab-add").addEventListener("click", function () {
      öffneNeuesFormular(state.aktiveKategorie);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".sort-chip"), function (chip) {
      chip.addEventListener("click", function () {
        state.sortierung = chip.dataset.sort;
        renderListe();
      });
    });
  }

  // ---------- Kategorien verwalten ----------

  function oeffneKategorienVerwaltung() {
    var area = document.getElementById("shop-edit-area");
    area.innerHTML = '<div class="modal-overlay" id="kat-overlay">' +
      '<div class="modal-box kat-manage-box">' +
        '<h2>Kategorien verwalten</h2>' +
        '<p>Ziehe die Kategorien, um die Reihenfolge zu ändern.</p>' +
        '<div id="kat-error-area"></div>' +
        '<div id="kat-list"></div>' +
        '<div class="shop-add-row" style="margin-top:14px;">' +
          '<input type="text" id="kat-neu-input" placeholder="Neue Kategorie..." />' +
          '<button id="kat-neu-btn">+ Hinzufügen</button>' +
        '</div>' +
        '<div class="modal-actions" style="margin-top:16px;">' +
          '<button id="kat-close-btn">Fertig</button>' +
        '</div>' +
      '</div>' +
    '</div>';

    function schließen() { area.innerHTML = ""; }
    document.getElementById("kat-overlay").addEventListener("click", function (e) {
      if (e.target.id === "kat-overlay") schließen();
    });
    document.getElementById("kat-close-btn").addEventListener("click", schließen);

    renderKategorienListe();

    document.getElementById("kat-neu-btn").addEventListener("click", function () {
      var input = document.getElementById("kat-neu-input");
      var label = input.value.trim();
      if (!label) return;
      var neu = {
        id: window.KochbuchDB.neueId("kat"),
        label: label,
        reihenfolge: KATEGORIEN.length
      };
      kategorienCollection.speichern(neu).then(function (ok) {
        zeigeKatFehler(ok ? "" : "Speichern hat nicht geklappt. Prüfe die Internetverbindung oder Firestore-Regeln.");
      });
      input.value = "";
      setTimeout(renderKategorienListe, 150); // kurz warten auf Live-Sync-Update
    });
    document.getElementById("kat-neu-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") document.getElementById("kat-neu-btn").click();
    });
  }

  function zeigeKatFehler(text) {
    var el = document.getElementById("kat-error-area");
    if (!el) return;
    el.innerHTML = text
      ? '<div class="alert error" style="margin-bottom:12px;">' + escapeHtml(text) + '</div>'
      : "";
  }

  function renderKategorienListe() {
    var listEl = document.getElementById("kat-list");
    if (!listEl) return; // Overlay wurde inzwischen geschlossen

    var sortiert = KATEGORIEN.slice().sort(function (a, b) { return (a.reihenfolge || 0) - (b.reihenfolge || 0); });
    listEl.innerHTML = sortiert.map(function (k, i) {
      return '<div class="kat-item" draggable="true" data-kat-id="' + k.id + '" data-index="' + i + '">' +
        '<span class="kat-drag-handle">⠿</span>' +
        '<input type="text" class="kat-label-input" data-kat-id="' + k.id + '" value="' + escapeHtml(k.label) + '" />' +
        '<button class="kat-delete-btn" data-kat-id="' + k.id + '" aria-label="Löschen">🗑️</button>' +
      '</div>';
    }).join("");

    // Label-Änderungen speichern (beim Verlassen des Feldes)
    Array.prototype.forEach.call(listEl.querySelectorAll(".kat-label-input"), function (input) {
      input.addEventListener("blur", function () {
        var neuesLabel = input.value.trim();
        if (!neuesLabel) { input.value = kategorieLabel(input.dataset.katId); return; }
        var k = KATEGORIEN.filter(function (x) { return x.id === input.dataset.katId; })[0];
        if (k && k.label !== neuesLabel) {
          kategorienCollection.speichern(Object.assign({}, k, { label: neuesLabel })).then(function (ok) {
            zeigeKatFehler(ok ? "" : "Speichern hat nicht geklappt. Prüfe die Internetverbindung oder Firestore-Regeln.");
          });
        }
      });
    });

    // Löschen (mit Rückfrage, da Rezepte in dieser Kategorie sonst "verwaist")
    Array.prototype.forEach.call(listEl.querySelectorAll(".kat-delete-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var katId = btn.dataset.katId;
        var anzahl = anzahlProKategorie(katId);
        var bestaetigt = anzahl === 0 || window.confirm(
          "Diese Kategorie wird bei " + anzahl + " Rezept" + (anzahl === 1 ? "" : "en") +
          " verwendet. Die Rezepte bleiben erhalten, gehören dann aber keiner Kategorie mehr an. Trotzdem löschen?"
        );
        if (!bestaetigt) return;
        kategorienCollection.loeschen(katId).then(function (ok) {
          zeigeKatFehler(ok ? "" : "Löschen hat nicht geklappt. Prüfe die Internetverbindung oder Firestore-Regeln.");
        });
        setTimeout(renderKategorienListe, 150);
      });
    });

    bindeKategorienDragDrop(listEl);
  }

  // Drag & Drop mit Pointer Events - funktioniert für Touch und Maus.
  function bindeKategorienDragDrop(listEl) {
    var dragSrc = null;

    Array.prototype.forEach.call(listEl.querySelectorAll(".kat-item"), function (item) {
      item.addEventListener("dragstart", function (e) {
        dragSrc = item;
        item.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", item.dataset.katId); } catch (err) {}
      });
      item.addEventListener("dragend", function () {
        item.classList.remove("dragging");
        dragSrc = null;
      });
      item.addEventListener("dragover", function (e) {
        e.preventDefault();
        if (!dragSrc || dragSrc === item) return;
        var rect = item.getBoundingClientRect();
        var mitteY = rect.top + rect.height / 2;
        if (e.clientY < mitteY) {
          listEl.insertBefore(dragSrc, item);
        } else {
          listEl.insertBefore(dragSrc, item.nextSibling);
        }
      });
      item.addEventListener("drop", function (e) {
        e.preventDefault();
        speichereNeueKategorienReihenfolge(listEl);
      });
    });

    // Touch-Geräte unterstützen natives HTML5-Drag&Drop oft nicht zuverlässig,
    // daher zusätzlich Pointer-Events als robuster Touch-Fallback.
    var pointerDragSrc = null;
    var pointerStartY = 0;

    Array.prototype.forEach.call(listEl.querySelectorAll(".kat-drag-handle"), function (handle) {
      handle.addEventListener("pointerdown", function (e) {
        pointerDragSrc = handle.closest(".kat-item");
        pointerStartY = e.clientY;
        pointerDragSrc.classList.add("dragging");
        pointerDragSrc.setPointerCapture && pointerDragSrc.setPointerCapture(e.pointerId);
      });
    });

    listEl.addEventListener("pointermove", function (e) {
      if (!pointerDragSrc) return;
      var elemUnter = document.elementFromPoint(e.clientX, e.clientY);
      var zielItem = elemUnter ? elemUnter.closest(".kat-item") : null;
      if (!zielItem || zielItem === pointerDragSrc) return;
      var rect = zielItem.getBoundingClientRect();
      var mitteY = rect.top + rect.height / 2;
      if (e.clientY < mitteY) {
        listEl.insertBefore(pointerDragSrc, zielItem);
      } else {
        listEl.insertBefore(pointerDragSrc, zielItem.nextSibling);
      }
    });

    listEl.addEventListener("pointerup", function () {
      if (!pointerDragSrc) return;
      pointerDragSrc.classList.remove("dragging");
      speichereNeueKategorienReihenfolge(listEl);
      pointerDragSrc = null;
    });
  }

  function speichereNeueKategorienReihenfolge(listEl) {
    var items = listEl.querySelectorAll(".kat-item");
    var aufgaben = [];
    Array.prototype.forEach.call(items, function (item, neueReihenfolge) {
      var katId = item.dataset.katId;
      var k = KATEGORIEN.filter(function (x) { return x.id === katId; })[0];
      if (k && k.reihenfolge !== neueReihenfolge) {
        aufgaben.push(kategorienCollection.speichern(Object.assign({}, k, { reihenfolge: neueReihenfolge })));
      }
    });
    if (aufgaben.length) {
      Promise.all(aufgaben).then(function (ergebnisse) {
        var alleOk = ergebnisse.every(function (ok) { return ok; });
        zeigeKatFehler(alleOk ? "" : "Reihenfolge speichern hat nicht geklappt. Prüfe die Internetverbindung oder Firestore-Regeln.");
      });
    }
  }

  return {
    init: init,
    bindeStatischeEvents: bindeStatischeEvents,
    render: render,
    oeffneKategorienVerwaltung: oeffneKategorienVerwaltung,
    oeffneRezeptDirekt: oeffneRezeptDirekt,
    rundeZutatZeileAuf: rundeZutatZeileAuf,
    skaliereUndRundeZutatZeile: skaliereUndRundeZutatZeile,
    getState: function () { return state; }
  };
})();
