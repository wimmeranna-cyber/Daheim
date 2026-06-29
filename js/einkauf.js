// einkauf.js
// Modul für die Einkaufsliste: Einträge nach Kategorie gruppiert,
// abhakbar, mit manueller Eingabe (Name, Menge, Kategorie, Notiz),
// automatischem Hinzufügen ausgewählter Rezept-Zutaten, editierbaren
// Kategorien (inkl. Drag & Drop) und Zusammenführen doppelter Einträge.

window.EinkaufModul = (function () {
  "use strict";

  // Erstbefüllung für die Einkaufs-Kategorien, falls noch keine in der
  // Datenbank existieren. Danach sind sie frei editierbar/verschiebbar.
  var STANDARD_EINKAUF_KATEGORIEN = [
    { id: "obst-gemuese", label: "🥦 Obst & Gemüse", reihenfolge: 0 },
    { id: "milchprodukte", label: "🧀 Milchprodukte & Eier", reihenfolge: 1 },
    { id: "fleisch-fisch", label: "🥩 Fleisch & Fisch", reihenfolge: 2 },
    { id: "brot-backwaren", label: "🥖 Brot & Backwaren", reihenfolge: 3 },
    { id: "trockenwaren", label: "🌾 Trockenwaren & Konserven", reihenfolge: 4 },
    { id: "gewuerze", label: "🧂 Gewürze & Saucen", reihenfolge: 5 },
    { id: "tiefkuehl", label: "🧊 Tiefkühl", reihenfolge: 6 },
    { id: "getraenke-einkauf", label: "🥤 Getränke", reihenfolge: 7 },
    { id: "haushalt", label: "🧴 Haushalt & Sonstiges", reihenfolge: 8 }
  ];

  var EINKAUF_KATEGORIEN = STANDARD_EINKAUF_KATEGORIEN.slice();
  var einkaufKategorienCollection = null;

  function einkaufKategorieLabel(id) {
    var k = EINKAUF_KATEGORIEN.filter(function (x) { return x.id === id; })[0];
    return k ? k.label : "🧴 Sonstiges";
  }

  function sortierteEinkaufKategorien() {
    return EINKAUF_KATEGORIEN.slice().sort(function (a, b) { return (a.reihenfolge || 0) - (b.reihenfolge || 0); });
  }

  // Stichwörter zur automatischen Kategorie-Erkennung. Trifft auf die
  // mitgelieferten Standard-Kategorien zu - bei eigenen, umbenannten oder
  // neuen Kategorien greift die Erkennung entsprechend nicht mehr.
  var KATEGORIE_STICHWORTE = {
    "obst-gemuese": [
      "tomate", "gurke", "salat", "paprika", "zwiebel", "knoblauch", "kartoffel", "karotte", "möhre",
      "apfel", "banane", "zitrone", "limette", "orange", "birne", "beere", "erdbeere", "himbeere",
      "blaubeere", "brokkoli", "blumenkohl", "kohl", "spinat", "lauch", "porree", "pilz", "champignon",
      "avocado", "mango", "ananas", "kürbis", "zucchini", "aubergine", "sellerie", "radieschen",
      "rucola", "kräuter", "petersilie", "basilikum", "koriander", "minze", "dill", "schnittlauch",
      "ingwer", "chili", "frühlingszwiebel", "rote bete", "fenchel", "spargel", "mais", "erbsen",
      "bohnen", "trauben", "kiwi", "pfirsich", "aprikose", "pflaume", "melone", "rhabarber"
    ],
    "milchprodukte": [
      "milch", "käse", "joghurt", "quark", "butter", "sahne", "schmand", "ei", "eier", "mozzarella",
      "feta", "parmesan", "frischkäse", "buttermilch", "kefir", "creme fraiche", "ricotta", "mascarpone",
      "schlagsahne", "vanillepudding", "pudding", "skyr"
    ],
    "fleisch-fisch": [
      "fleisch", "hähnchen", "huhn", "pute", "rind", "schwein", "hack", "wurst", "speck", "schinken",
      "fisch", "lachs", "thunfisch", "garnele", "shrimp", "forelle", "kabeljau", "ente", "lamm",
      "salami", "leberkäse", "bacon", "filet", "steak", "geflügel", "meeresfrüchte"
    ],
    "brot-backwaren": [
      "brot", "brötchen", "toast", "baguette", "croissant", "mehl", "hefe", "backpulver", "brezel",
      "tortilla", "wrap", "fladenbrot", "knäckebrot", "zwieback", "kuchen", "gebäck"
    ],
    "trockenwaren": [
      "reis", "nudel", "pasta", "spaghetti", "linsen", "kichererbsen", "couscous", "bulgur", "quinoa",
      "konserve", "dose", "passierte tomate", "tomatenmark", "suppe", "brühe", "müsli", "haferflocken",
      "cornflakes", "nüsse", "mandel", "erdnuss", "rosine", "trockenfrucht", "honig", "marmelade",
      "nutella", "zucker", "salz", "mehl", "stärke", "gelatine", "kokosmilch"
    ],
    "gewuerze": [
      "pfeffer", "paprikapulver", "curry", "currypulver", "muskat", "zimt", "vanille", "oregano",
      "thymian", "rosmarin", "lorbeer", "kümmel", "essig", "öl", "olivenöl", "sojasauce", "ketchup",
      "senf", "mayo", "mayonnaise", "pesto", "sauce", "soße", "gewürz", "kräutermischung", "bouillon"
    ],
    "tiefkuehl": [
      "tiefkühl", "tk-", "eis", "pizza", "pommes", "fischstäbchen", "gefroren"
    ],
    "getraenke-einkauf": [
      "wasser", "saft", "limonade", "cola", "bier", "wein", "sekt", "kaffee", "tee", "smoothie",
      "energydrink", "schorle", "sprudel"
    ],
    "haushalt": [
      "klopapier", "toilettenpapier", "küchenrolle", "spülmittel", "waschmittel", "müllbeutel",
      "alufolie", "frischhaltefolie", "putzmittel", "batterien", "kerzen", "servietten", "schwamm"
    ]
  };

  // Versucht anhand des Produktnamens automatisch eine passende Kategorie
  // zu erkennen. Prüft zuerst, ob für genau dieses Produkt schon einmal eine
  // Kategorie GELERNT wurde (z.B. weil die Person sie manuell geändert hat) -
  // das hat Vorrang vor der allgemeinen Stichwortliste. Gibt null zurück,
  // wenn nichts gefunden wird (dann bleibt die zuletzt gewählte/Standard-Kategorie).
  function erkenneKategorieAutomatisch(name) {
    if (!name) return null;
    var text = name.toLowerCase().trim();

    var gelernt = state.haeufigGekauft.filter(function (h) { return h.id === text; })[0];
    if (gelernt && gelernt.kategorie && EINKAUF_KATEGORIEN.some(function (k) { return k.id === gelernt.kategorie; })) {
      return gelernt.kategorie;
    }

    var bekannteKategorieIds = EINKAUF_KATEGORIEN.map(function (k) { return k.id; });
    for (var katId in KATEGORIE_STICHWORTE) {
      if (bekannteKategorieIds.indexOf(katId) === -1) continue; // Kategorie wurde umbenannt/gelöscht
      var stichworte = KATEGORIE_STICHWORTE[katId];
      for (var i = 0; i < stichworte.length; i++) {
        if (text.indexOf(stichworte[i]) !== -1) return katId;
      }
    }
    return null;
  }

  var state = {
    einkaufsListe: [],
    haeufigGekauft: [],
    storageFehler: false
  };

  var einkaufCollection = null;
  var haeufigCollection = null;

  function init() {
    einkaufCollection = window.KochbuchDB.erstelleCollection("einkaufsliste", function (liste) {
      state.einkaufsListe = liste;
      state.storageFehler = false;
      render();
    });
    haeufigCollection = window.KochbuchDB.erstelleCollection("haeufigGekauft", function (liste) {
      state.haeufigGekauft = liste;
      if (document.getElementById("shop-list")) render();
    });
    einkaufKategorienCollection = window.KochbuchDB.erstelleCollection("einkaufKategorien", function (liste) {
      if (liste.length === 0) {
        STANDARD_EINKAUF_KATEGORIEN.forEach(function (k) { einkaufKategorienCollection.speichern(k); });
        return;
      }
      EINKAUF_KATEGORIEN = liste;
      render();
      if (document.getElementById("shop-kat-list")) {
        renderShopKategorienListe();
      }
      var kategorieSelect = document.getElementById("shop-kategorie-input");
      if (kategorieSelect) fuelleKategorieSelect(kategorieSelect, kategorieSelect.value);
    });
    window.addEventListener("kochbuch-storage-error", function (e) {
      if (e.detail && e.detail.collection === "einkaufsliste") {
        state.storageFehler = true;
        render();
      }
    });
    initialisiereProdukteDragDropEinmalig();
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fuelleKategorieSelect(selectEl, ausgewaehlt) {
    selectEl.innerHTML = sortierteEinkaufKategorien().map(function (k) {
      return '<option value="' + k.id + '"' + (k.id === ausgewaehlt ? " selected" : "") + '>' + escapeHtml(k.label) + '</option>';
    }).join("");
  }

  function fuegeEintragHinzu(name, menge, kategorie, notiz) {
    if (!name || !name.trim()) return;
    var finaleKategorie = kategorie || erkenneKategorieAutomatisch(name) || sortierteEinkaufKategorien()[0].id;
    var eintrag = {
      id: window.KochbuchDB.neueId("e"),
      name: name.trim(),
      menge: (menge || "").trim(),
      kategorie: finaleKategorie,
      notiz: (notiz || "").trim(),
      erledigt: false,
      hinzugefuegtAm: Date.now()
    };
    einkaufCollection.speichern(eintrag);
    aktualisiereHaeufigkeit(name.trim(), finaleKategorie);
  }

  // Zählt mit, wie oft ein Produkt schon hinzugefügt wurde - unabhängig
  // davon, ob der jeweilige Einkaufslisten-Eintrag später wieder gelöscht
  // wird. Daraus ergeben sich die "Häufig gekauft"-Vorschläge.
  function aktualisiereHaeufigkeit(name, kategorie) {
    var key = name.toLowerCase();
    var bestehender = state.haeufigGekauft.filter(function (h) { return h.id === key; })[0];
    var aktualisiert = {
      id: key,
      name: name, // zuletzt verwendete Schreibweise merken
      kategorie: kategorie,
      anzahl: (bestehender ? bestehender.anzahl : 0) + 1,
      zuletztAm: Date.now()
    };
    haeufigCollection.speichern(aktualisiert);
  }

  // Liefert die meistgekauften Produkte, die aktuell NICHT schon offen
  // (unerledigt) auf der Liste stehen - sortiert nach Häufigkeit.
  function haeufigsteVorschlaege(maxAnzahl) {
    var offeneNamen = state.einkaufsListe
      .filter(function (e) { return !e.erledigt; })
      .map(function (e) { return e.name.toLowerCase(); });

    return state.haeufigGekauft
      .filter(function (h) { return h.anzahl >= 2 && offeneNamen.indexOf(h.id) === -1; })
      .sort(function (a, b) { return b.anzahl - a.anzahl; })
      .slice(0, maxAnzahl);
  }

  function fuegeZutatenAusRezeptHinzu(zutatenListe, rezeptTitel) {
    zutatenListe.forEach(function (z) {
      var erkannteKategorie = erkenneKategorieAutomatisch(z) || sortierteEinkaufKategorien()[0].id;
      fuegeEintragHinzu(z, "", erkannteKategorie, "aus „" + rezeptTitel + "“");
    });
  }

  function findeDuplikatGruppen() {
    var gruppen = {};
    state.einkaufsListe.forEach(function (e) {
      if (e.erledigt) return;
      var key = (e.name || "").trim().toLowerCase();
      if (!key) return;
      if (!gruppen[key]) gruppen[key] = [];
      gruppen[key].push(e);
    });
    return Object.keys(gruppen).map(function (key) { return gruppen[key]; }).filter(function (g) { return g.length > 1; });
  }

  function fuehreDuplikateZusammen() {
    var gruppen = findeDuplikatGruppen();
    if (gruppen.length === 0) return Promise.resolve(0);

    var aufgaben = [];
    gruppen.forEach(function (gruppe) {
      var sortiert = gruppe.slice().sort(function (a, b) { return (a.hinzugefuegtAm || 0) - (b.hinzugefuegtAm || 0); });
      var basis = sortiert[0];
      var rest = sortiert.slice(1);

      var addierteMenge = addiereMengen(gruppe.map(function (e) { return e.menge; }));
      var notizen = gruppe.map(function (e) { return e.notiz; }).filter(Boolean);
      var eindeutigeNotizen = notizen.filter(function (n, i) { return notizen.indexOf(n) === i; });

      var aktualisiert = Object.assign({}, basis, {
        menge: addierteMenge,
        notiz: eindeutigeNotizen.join(" + ")
      });
      aufgaben.push(einkaufCollection.speichern(aktualisiert));
      rest.forEach(function (e) { aufgaben.push(einkaufCollection.loeschen(e.id)); });
    });

    return Promise.all(aufgaben).then(function () { return gruppen.length; });
  }

  function addiereMengen(mengenListe) {
    var geparst = mengenListe.map(parseMenge);
    var alleZahlen = geparst.every(function (m) { return m && m.zahl !== null; });
    var einheiten = geparst.map(function (m) { return m ? m.einheit : ""; });
    var gleicheEinheit = einheiten.every(function (e) { return e === einheiten[0]; });

    if (alleZahlen && gleicheEinheit) {
      var summe = geparst.reduce(function (acc, m) { return acc + m.zahl; }, 0);
      summe = Math.round(summe * 100) / 100;
      return summe + (einheiten[0] || "");
    }
    var eindeutig = mengenListe.filter(Boolean).filter(function (m, i, arr) { return arr.indexOf(m) === i; });
    return eindeutig.join(" + ");
  }

  function parseMenge(text) {
    if (!text) return { zahl: null, einheit: "" };
    var match = String(text).trim().replace(",", ".").match(/^(\d+(?:\.\d+)?)\s*([a-zA-Zäöü]*)$/);
    if (!match) return { zahl: null, einheit: "" };
    return { zahl: parseFloat(match[1]), einheit: (match[2] || "").toLowerCase() };
  }

  function renderEinkaufsliste() {
    var offen = state.einkaufsListe.filter(function (e) { return !e.erledigt; });
    var erledigt = state.einkaufsListe.filter(function (e) { return e.erledigt; });

    document.getElementById("shop-subtitle").textContent =
      offen.length + " " + (offen.length === 1 ? "Ding" : "Dinge") + " zu kaufen" +
      (erledigt.length ? " · " + erledigt.length + " erledigt" : "");

    var alertArea = document.getElementById("shop-alert-area");
    var duplikatAnzahl = findeDuplikatGruppen().length;
    var alertHtml = "";
    if (state.storageFehler) {
      alertHtml += '<div class="alert error">Speichern oder Laden hat nicht geklappt. Bitte versuch es nochmal.</div>';
    }
    if (duplikatAnzahl > 0) {
      alertHtml += '<div class="alert warn" style="display:flex;align-items:center;justify-content:space-between;gap:10px;">' +
        '<span>' + duplikatAnzahl + ' doppelte ' + (duplikatAnzahl === 1 ? 'Zutat' : 'Zutaten') + ' gefunden</span>' +
        '<button id="merge-duplicates-btn" style="background:var(--brown);color:white;border:none;border-radius:999px;padding:6px 14px;font-size:13px;cursor:pointer;white-space:nowrap;">Zusammenführen</button>' +
      '</div>';
    }
    alertArea.innerHTML = alertHtml;
    var mergeBtn = document.getElementById("merge-duplicates-btn");
    if (mergeBtn) {
      mergeBtn.addEventListener("click", function () {
        mergeBtn.disabled = true;
        mergeBtn.textContent = "...";
        fuehreDuplikateZusammen();
      });
    }

    var kategorieSelect = document.getElementById("shop-kategorie-input");
    fuelleKategorieSelect(kategorieSelect, kategorieSelect.value || sortierteEinkaufKategorien()[0].id);

    var vorschlaege = haeufigsteVorschlaege(8);
    var suggestionsEl = document.getElementById("shop-suggestions");
    if (vorschlaege.length > 0) {
      suggestionsEl.classList.remove("hidden");
      suggestionsEl.innerHTML = '<p class="shop-suggestions-label">Häufig gekauft</p>' +
        '<div class="shop-suggestions-chips">' +
          vorschlaege.map(function (v) {
            return '<button class="shop-suggestion-chip" data-suggest-name="' + escapeHtml(v.name) + '" data-suggest-kat="' + escapeHtml(v.kategorie) + '">+ ' + escapeHtml(v.name) + '</button>';
          }).join("") +
        '</div>';
      Array.prototype.forEach.call(suggestionsEl.querySelectorAll(".shop-suggestion-chip"), function (btn) {
        btn.addEventListener("click", function () {
          fuegeEintragHinzu(btn.dataset.suggestName, "", btn.dataset.suggestKat, "");
        });
      });
    } else {
      suggestionsEl.classList.add("hidden");
      suggestionsEl.innerHTML = "";
    }

    var listEl = document.getElementById("shop-list");

    if (state.einkaufsListe.length === 0) {
      listEl.innerHTML = '<div class="empty"><div class="emoji">🛒</div>' +
        '<div class="title">Einkaufsliste ist leer</div>' +
        '<div class="desc">Füge oben etwas hinzu oder wähle Zutaten direkt aus einem Rezept aus.</div></div>';
      document.getElementById("shop-clear-done-btn").classList.add("hidden");
      return;
    }

    var gruppen = {};
    state.einkaufsListe.forEach(function (e) {
      var kat = e.kategorie || sortierteEinkaufKategorien()[sortierteEinkaufKategorien().length - 1].id;
      if (!gruppen[kat]) gruppen[kat] = [];
      gruppen[kat].push(e);
    });

    var sortierteKategorieIds = sortierteEinkaufKategorien().map(function (k) { return k.id; })
      .filter(function (id) { return gruppen[id] && gruppen[id].length; });

    listEl.innerHTML = sortierteKategorieIds.map(function (katId) {
      var items = gruppen[katId].slice().sort(function (a, b) {
        if (!!a.erledigt !== !!b.erledigt) return a.erledigt ? 1 : -1;
        return (a.hinzugefuegtAm || 0) - (b.hinzugefuegtAm || 0);
      });
      return '<div class="shop-group" data-kat-group="' + katId + '">' +
        '<h3>' + einkaufKategorieLabel(katId) + '</h3>' +
        '<div class="shop-group-items" data-kat-id="' + katId + '">' +
        items.map(function (e) {
          var details = [e.menge, e.notiz].filter(Boolean).join(" · ");
          return '<div class="shop-item' + (e.erledigt ? " done" : "") + '" data-id="' + e.id + '">' +
            '<span class="shop-check' + (e.erledigt ? " checked" : "") + '" data-action="toggle" data-id="' + e.id + '">' +
              (e.erledigt ? "✓" : "") +
            '</span>' +
            '<span class="shop-text" data-action="edit" data-id="' + e.id + '">' + escapeHtml(e.name) + (details ? ' <span style="color:var(--brown);font-size:13px">(' + escapeHtml(details) + ')</span>' : '') + '</span>' +
            '<button class="shop-remove" data-action="remove" data-id="' + e.id + '" aria-label="Entfernen">✕</button>' +
          '</div>';
        }).join("") +
        '</div>' +
      '</div>';
    }).join("");

    document.getElementById("shop-clear-done-btn").classList.toggle("hidden", erledigt.length === 0);

    Array.prototype.forEach.call(listEl.querySelectorAll('[data-action="toggle"]'), function (el) {
      el.addEventListener("click", function () {
        var eintrag = state.einkaufsListe.filter(function (e) { return e.id === el.dataset.id; })[0];
        if (!eintrag) return;
        einkaufCollection.speichern(Object.assign({}, eintrag, { erledigt: !eintrag.erledigt }));
      });
    });
    Array.prototype.forEach.call(listEl.querySelectorAll('[data-action="remove"]'), function (el) {
      el.addEventListener("click", function () {
        einkaufCollection.loeschen(el.dataset.id);
      });
    });
    Array.prototype.forEach.call(listEl.querySelectorAll('[data-action="edit"]'), function (el) {
      el.addEventListener("click", function () {
        var eintrag = state.einkaufsListe.filter(function (e) { return e.id === el.dataset.id; })[0];
        if (eintrag) öffneBearbeiten(eintrag);
      });
    });

    initialisiereProdukteDragDropEinmalig();
  }

  // WICHTIG: Wird nur EINMAL aufgerufen (siehe init()), nicht bei jedem
  // renderEinkaufsliste(). Nutzt das gemeinsame Long-Press-Modul (dragdrop.js):
  // die ganze Karte gedrückt halten, statt nur einen schmalen Ziehgriff zu treffen.
  var produkteDragDropInitialisiert = false;

  function initialisiereProdukteDragDropEinmalig() {
    if (produkteDragDropInitialisiert) return;
    produkteDragDropInitialisiert = true;

    window.KochbuchDragDrop.registriere({
      cardSelector: ".shop-item",
      dropZoneSelector: ".shop-group-items",
      onDrop: function (karte) {
        var neueGruppe = karte.closest(".shop-group-items");
        var neueKatId = neueGruppe ? neueGruppe.dataset.katId : null;
        var eintrag = state.einkaufsListe.filter(function (e) { return e.id === karte.dataset.id; })[0];
        if (eintrag && neueKatId && eintrag.kategorie !== neueKatId) {
          einkaufCollection.speichern(Object.assign({}, eintrag, { kategorie: neueKatId }));
        }
      }
    });
  }

  function öffneBearbeiten(eintrag) {
    var area = document.getElementById("shop-edit-area");
    area.innerHTML = '<div class="modal-overlay" id="edit-shop-overlay">' +
      '<div class="modal-box">' +
        '<h2>Eintrag bearbeiten</h2>' +
        '<div class="field"><label>Name</label><input type="text" id="edit-shop-name" value="' + escapeHtml(eintrag.name) + '" /></div>' +
        '<div class="field"><label>Menge</label><input type="text" id="edit-shop-menge" value="' + escapeHtml(eintrag.menge || "") + '" /></div>' +
        '<div class="field"><label>Kategorie</label><select id="edit-shop-kategorie"></select></div>' +
        '<div class="field"><label>Notiz</label><input type="text" id="edit-shop-notiz" value="' + escapeHtml(eintrag.notiz || "") + '" /></div>' +
        '<div class="modal-actions">' +
          '<button id="edit-shop-cancel">Abbrechen</button>' +
          '<button class="confirm" id="edit-shop-save" style="background:var(--brown);border-color:var(--brown)">Speichern</button>' +
        '</div>' +
      '</div>' +
    '</div>';
    fuelleKategorieSelect(document.getElementById("edit-shop-kategorie"), eintrag.kategorie);

    function schließen() { area.innerHTML = ""; }
    document.getElementById("edit-shop-overlay").addEventListener("click", function (e) {
      if (e.target.id === "edit-shop-overlay") schließen();
    });
    document.getElementById("edit-shop-cancel").addEventListener("click", schließen);
    document.getElementById("edit-shop-save").addEventListener("click", function () {
      var neuerName = document.getElementById("edit-shop-name").value.trim() || eintrag.name;
      var neueKategorie = document.getElementById("edit-shop-kategorie").value;
      var aktualisiert = Object.assign({}, eintrag, {
        name: neuerName,
        menge: document.getElementById("edit-shop-menge").value.trim(),
        kategorie: neueKategorie,
        notiz: document.getElementById("edit-shop-notiz").value.trim()
      });
      einkaufCollection.speichern(aktualisiert);
      // Wenn die Kategorie hier manuell geändert wurde, merkt sich die App
      // das für dieses Produkt (überschreibt die automatische Erkennung
      // beim nächsten Mal).
      if (neueKategorie !== eintrag.kategorie) {
        aktualisiereHaeufigkeit(neuerName, neueKategorie);
      }
      schließen();
    });
  }

  function oeffneEinkaufKategorienVerwaltung() {
    var area = document.getElementById("shop-edit-area");
    area.innerHTML = '<div class="modal-overlay" id="shop-kat-overlay">' +
      '<div class="modal-box kat-manage-box">' +
        '<h2>Einkaufs-Kategorien verwalten</h2>' +
        '<p>Ziehe die Kategorien, um die Reihenfolge zu ändern.</p>' +
        '<div id="shop-kat-error-area"></div>' +
        '<div id="shop-kat-list"></div>' +
        '<div class="shop-add-row" style="margin-top:14px;">' +
          '<input type="text" id="shop-kat-neu-input" placeholder="Neue Kategorie..." />' +
          '<button id="shop-kat-neu-btn">+ Hinzufügen</button>' +
        '</div>' +
        '<div class="modal-actions" style="margin-top:16px;">' +
          '<button id="shop-kat-close-btn">Fertig</button>' +
        '</div>' +
      '</div>' +
    '</div>';

    function schließen() { area.innerHTML = ""; }
    document.getElementById("shop-kat-overlay").addEventListener("click", function (e) {
      if (e.target.id === "shop-kat-overlay") schließen();
    });
    document.getElementById("shop-kat-close-btn").addEventListener("click", schließen);

    renderShopKategorienListe();

    document.getElementById("shop-kat-neu-btn").addEventListener("click", function () {
      var input = document.getElementById("shop-kat-neu-input");
      var label = input.value.trim();
      if (!label) return;
      var neu = { id: window.KochbuchDB.neueId("ekat"), label: label, reihenfolge: EINKAUF_KATEGORIEN.length };
      einkaufKategorienCollection.speichern(neu).then(function (ok) {
        zeigeShopKatFehler(ok ? "" : "Speichern hat nicht geklappt. Prüfe die Internetverbindung oder Firestore-Regeln.");
      });
      input.value = "";
      setTimeout(renderShopKategorienListe, 150);
    });
    document.getElementById("shop-kat-neu-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") document.getElementById("shop-kat-neu-btn").click();
    });
  }

  function zeigeShopKatFehler(text) {
    var el = document.getElementById("shop-kat-error-area");
    if (!el) return;
    el.innerHTML = text ? '<div class="alert error" style="margin-bottom:12px;">' + escapeHtml(text) + '</div>' : "";
  }

  function renderShopKategorienListe() {
    var listEl = document.getElementById("shop-kat-list");
    if (!listEl) return;

    listEl.innerHTML = sortierteEinkaufKategorien().map(function (k) {
      return '<div class="kat-item" data-kat-id="' + k.id + '">' +
        '<span class="kat-drag-handle">⠿</span>' +
        '<input type="text" class="kat-label-input" data-kat-id="' + k.id + '" value="' + escapeHtml(k.label) + '" />' +
        '<button class="kat-delete-btn" data-kat-id="' + k.id + '" aria-label="Löschen">🗑️</button>' +
      '</div>';
    }).join("");

    Array.prototype.forEach.call(listEl.querySelectorAll(".kat-label-input"), function (input) {
      input.addEventListener("blur", function () {
        var neuesLabel = input.value.trim();
        if (!neuesLabel) { input.value = einkaufKategorieLabel(input.dataset.katId); return; }
        var k = EINKAUF_KATEGORIEN.filter(function (x) { return x.id === input.dataset.katId; })[0];
        if (k && k.label !== neuesLabel) {
          einkaufKategorienCollection.speichern(Object.assign({}, k, { label: neuesLabel })).then(function (ok) {
            zeigeShopKatFehler(ok ? "" : "Speichern hat nicht geklappt. Prüfe die Internetverbindung oder Firestore-Regeln.");
          });
        }
      });
    });

    Array.prototype.forEach.call(listEl.querySelectorAll(".kat-delete-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var katId = btn.dataset.katId;
        var anzahl = state.einkaufsListe.filter(function (e) { return e.kategorie === katId; }).length;
        var bestaetigt = anzahl === 0 || window.confirm(
          "Diese Kategorie wird bei " + anzahl + " Eintrag/Einträgen verwendet. Diese bleiben erhalten, gehören dann aber keiner Kategorie mehr an. Trotzdem löschen?"
        );
        if (!bestaetigt) return;
        einkaufKategorienCollection.loeschen(katId).then(function (ok) {
          zeigeShopKatFehler(ok ? "" : "Löschen hat nicht geklappt. Prüfe die Internetverbindung oder Firestore-Regeln.");
        });
        setTimeout(renderShopKategorienListe, 150);
      });
    });

    bindeShopKategorienDragDrop(listEl);
  }

  function bindeShopKategorienDragDrop(listEl) {
    var pointerDragSrc = null;

    Array.prototype.forEach.call(listEl.querySelectorAll(".kat-drag-handle"), function (handle) {
      handle.addEventListener("pointerdown", function (e) {
        pointerDragSrc = handle.closest(".kat-item");
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
      var items = listEl.querySelectorAll(".kat-item");
      var aufgaben = [];
      Array.prototype.forEach.call(items, function (item, neueReihenfolge) {
        var k = EINKAUF_KATEGORIEN.filter(function (x) { return x.id === item.dataset.katId; })[0];
        if (k && k.reihenfolge !== neueReihenfolge) {
          aufgaben.push(einkaufKategorienCollection.speichern(Object.assign({}, k, { reihenfolge: neueReihenfolge })));
        }
      });
      if (aufgaben.length) {
        Promise.all(aufgaben).then(function (ergebnisse) {
          var alleOk = ergebnisse.every(function (ok) { return ok; });
          zeigeShopKatFehler(alleOk ? "" : "Reihenfolge speichern hat nicht geklappt.");
        });
      }
      pointerDragSrc = null;
    });
  }

  function render() {
    renderEinkaufsliste();
  }

  function bindeStatischeEvents() {
    var kategorieManuellGewaehlt = false;

    document.getElementById("shop-add-btn").addEventListener("click", function () {
      var name = document.getElementById("shop-name-input").value;
      var menge = document.getElementById("shop-menge-input").value;
      var kategorie = document.getElementById("shop-kategorie-input").value;
      var notiz = document.getElementById("shop-notiz-input").value;
      if (!name.trim()) return;
      fuegeEintragHinzu(name, menge, kategorie, notiz);
      document.getElementById("shop-name-input").value = "";
      document.getElementById("shop-menge-input").value = "";
      document.getElementById("shop-notiz-input").value = "";
      document.getElementById("shop-name-input").focus();
      kategorieManuellGewaehlt = false;
    });

    document.getElementById("shop-name-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") document.getElementById("shop-add-btn").click();
    });

    // Während der Eingabe automatisch eine passende Kategorie vorschlagen -
    // aber nur, solange die Person das Dropdown nicht selbst manuell geändert hat.
    document.getElementById("shop-name-input").addEventListener("input", function (e) {
      if (kategorieManuellGewaehlt) return;
      var erkannt = erkenneKategorieAutomatisch(e.target.value);
      if (erkannt) {
        document.getElementById("shop-kategorie-input").value = erkannt;
      }
    });
    document.getElementById("shop-kategorie-input").addEventListener("change", function () {
      kategorieManuellGewaehlt = true;
    });

    document.getElementById("shop-clear-done-btn").addEventListener("click", function () {
      var erledigt = state.einkaufsListe.filter(function (e) { return e.erledigt; });
      erledigt.forEach(function (e) { einkaufCollection.loeschen(e.id); });
    });

    var shopSettingsBtn = document.getElementById("shop-settings-btn");
    if (shopSettingsBtn) {
      shopSettingsBtn.addEventListener("click", oeffneEinkaufKategorienVerwaltung);
    }
  }

  return {
    init: init,
    bindeStatischeEvents: bindeStatischeEvents,
    render: render,
    fuegeZutatenAusRezeptHinzu: fuegeZutatenAusRezeptHinzu,
    getState: function () { return state; }
  };
})();
