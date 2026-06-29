// todos.js
// Modul für den Todo-Tab: farbige Karten ("Themen"), jede mit eigenen
// Unteraufgaben (abhakbar, durchgestrichen wenn erledigt), benannten
// Kategorien (zusätzlich zur Farbe), Filter nach Farbe und Drag & Drop
// zum Umsortieren.

window.TodosModul = (function () {
  "use strict";

  var FARBEN = [
    { id: "terracotta", hex: "#c2884f" },
    { id: "salbei", hex: "#5e7a52" },
    { id: "beere", hex: "#a23b2e" },
    { id: "senf", hex: "#c4972f" },
    { id: "pflaume", hex: "#7d5a7a" },
    { id: "ozean", hex: "#4a7a82" }
  ];

  var STANDARD_TODO_KATEGORIEN = [
    { id: "haushalt", label: "Haushalt", reihenfolge: 0 },
    { id: "arbeit", label: "Arbeit", reihenfolge: 1 },
    { id: "persoenlich", label: "Persönlich", reihenfolge: 2 }
  ];

  var TODO_KATEGORIEN = STANDARD_TODO_KATEGORIEN.slice();
  var todoKategorienCollection = null;

  function todoKategorieLabel(id) {
    var k = TODO_KATEGORIEN.filter(function (x) { return x.id === id; })[0];
    return k ? k.label : "";
  }

  function sortierteTodoKategorien() {
    return TODO_KATEGORIEN.slice().sort(function (a, b) { return (a.reihenfolge || 0) - (b.reihenfolge || 0); });
  }

  var leereForm = function () {
    return {
      id: null, titel: "", farbe: FARBEN[0].hex, kategorie: "", unteraufgaben: []
    };
  };

  var state = {
    todos: [],
    filterFarbe: null, // null = alle anzeigen
    storageFehler: false
  };

  var todosCollection = null;

  function init() {
    todosCollection = window.KochbuchDB.erstelleCollection("todos", function (liste) {
      state.todos = liste;
      state.storageFehler = false;
      render();
    });
    todoKategorienCollection = window.KochbuchDB.erstelleCollection("todoKategorien", function (liste) {
      if (liste.length === 0) {
        STANDARD_TODO_KATEGORIEN.forEach(function (k) { todoKategorienCollection.speichern(k); });
        return;
      }
      TODO_KATEGORIEN = liste;
      render();
      if (document.getElementById("todo-kat-list")) {
        renderTodoKategorienListe();
      }
    });
    window.addEventListener("kochbuch-storage-error", function (e) {
      if (e.detail && e.detail.collection === "todos") {
        state.storageFehler = true;
        render();
      }
    });
    initialisiereDragDropEinmalig();
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function neueUnteraufgabe(text) {
    return { id: window.KochbuchDB.neueId("ua"), text: text, erledigt: false };
  }

  function fortschritt(todo) {
    var liste = todo.unteraufgaben || [];
    if (liste.length === 0) return null;
    var erledigt = liste.filter(function (u) { return u.erledigt; }).length;
    return { erledigt: erledigt, gesamt: liste.length };
  }

  function gefilterteListe() {
    var liste = state.todos.slice();
    if (state.filterFarbe) {
      liste = liste.filter(function (t) { return t.farbe === state.filterFarbe; });
    }
    liste.sort(function (a, b) { return (a.reihenfolge || 0) - (b.reihenfolge || 0); });
    return liste;
  }

  function render() {
    var vorhandeneFarben = state.todos.map(function (t) { return t.farbe; })
      .filter(function (f, i, arr) { return f && arr.indexOf(f) === i; });

    var chipsEl = document.getElementById("todo-filter-chips");
    if (vorhandeneFarben.length > 1) {
      chipsEl.classList.remove("hidden");
      chipsEl.innerHTML = '<button class="todo-filter-chip' + (!state.filterFarbe ? " active" : "") + '" data-filter-farbe="">Alle</button>' +
        vorhandeneFarben.map(function (f) {
          return '<button class="todo-filter-chip' + (state.filterFarbe === f ? " active" : "") + '" data-filter-farbe="' + f + '">' +
            '<span class="todo-filter-dot" style="background:' + f + '"></span></button>';
        }).join("");
      Array.prototype.forEach.call(chipsEl.querySelectorAll(".todo-filter-chip"), function (btn) {
        btn.addEventListener("click", function () {
          state.filterFarbe = btn.dataset.filterFarbe || null;
          render();
        });
      });
    } else {
      chipsEl.classList.add("hidden");
      chipsEl.innerHTML = "";
    }

    var alertArea = document.getElementById("todo-alert-area");
    alertArea.innerHTML = state.storageFehler
      ? '<div class="alert error">Speichern oder Laden hat nicht geklappt. Bitte versuch es nochmal.</div>'
      : "";

    var anzahlOffen = state.todos.filter(function (t) {
      var f = fortschritt(t);
      return !f || f.erledigt < f.gesamt;
    }).length;
    document.getElementById("todo-subtitle").textContent =
      anzahlOffen + " " + (anzahlOffen === 1 ? "offenes Thema" : "offene Themen");

    var liste = gefilterteListe();
    var listEl = document.getElementById("todo-list");

    if (liste.length === 0) {
      listEl.innerHTML = '<div class="empty"><div class="emoji">✅</div>' +
        '<div class="title">' + (state.todos.length === 0 ? "Noch keine Todos" : "Nichts in dieser Farbe") + '</div>' +
        '<div class="desc">' + (state.todos.length === 0 ? "Tippe auf das Plus, um dein erstes Thema anzulegen." : "Wähle eine andere Farbe oder \"Alle\".") + '</div></div>';
      return;
    }

    listEl.innerHTML = liste.map(function (t) { return renderTodoKarte(t); }).join("");
    bindeTodoEvents(listEl);
  }

  function renderTodoKarte(t) {
    var f = fortschritt(t);
    var fortschrittHtml = f ? '<span class="todo-progress">' + f.erledigt + '/' + f.gesamt + '</span>' : "";
    var kategorieHtml = t.kategorie ? '<span class="todo-kat-label">' + escapeHtml(todoKategorieLabel(t.kategorie)) + '</span>' : "";

    var unteraufgabenHtml = (t.unteraufgaben || []).map(function (u) {
      return '<div class="todo-subtask' + (u.erledigt ? " done" : "") + '">' +
        '<span class="todo-subtask-check' + (u.erledigt ? " checked" : "") + '" data-action="toggle-sub" data-todo-id="' + t.id + '" data-sub-id="' + u.id + '">' +
          (u.erledigt ? "✓" : "") +
        '</span>' +
        '<span class="todo-subtask-text">' + escapeHtml(u.text) + '</span>' +
        '<button class="todo-subtask-remove" data-action="remove-sub" data-todo-id="' + t.id + '" data-sub-id="' + u.id + '" aria-label="Entfernen">✕</button>' +
      '</div>';
    }).join("");

    return '<div class="todo-card" data-id="' + t.id + '" style="border-left:5px solid ' + t.farbe + '">' +
      '<div class="todo-card-header">' +
        '<span class="todo-card-title" data-action="edit-title" data-id="' + t.id + '">' + escapeHtml(t.titel) + '</span>' +
        fortschrittHtml +
        '<button class="todo-card-delete" data-action="delete-todo" data-id="' + t.id + '" aria-label="Löschen">🗑️</button>' +
      '</div>' +
      (kategorieHtml ? '<div class="todo-card-meta">' + kategorieHtml + '</div>' : "") +
      '<div class="todo-subtasks">' + unteraufgabenHtml + '</div>' +
      '<div class="todo-subtask-add-row">' +
        '<input type="text" class="todo-subtask-input" data-todo-id="' + t.id + '" placeholder="Unteraufgabe hinzufügen..." />' +
      '</div>' +
    '</div>';
  }

  function bindeTodoEvents(listEl) {
    Array.prototype.forEach.call(listEl.querySelectorAll('[data-action="toggle-sub"]'), function (el) {
      el.addEventListener("click", function () {
        schalteUnteraufgabeUm(el.dataset.todoId, el.dataset.subId);
      });
    });
    Array.prototype.forEach.call(listEl.querySelectorAll('[data-action="remove-sub"]'), function (el) {
      el.addEventListener("click", function () {
        entferneUnteraufgabe(el.dataset.todoId, el.dataset.subId);
      });
    });
    Array.prototype.forEach.call(listEl.querySelectorAll('[data-action="delete-todo"]'), function (el) {
      el.addEventListener("click", function () {
        zeigeLoeschBestaetigung(el.dataset.id);
      });
    });
    Array.prototype.forEach.call(listEl.querySelectorAll('[data-action="edit-title"]'), function (el) {
      el.addEventListener("click", function () {
        oeffneTodoFormular(findTodo(el.dataset.id));
      });
    });
    Array.prototype.forEach.call(listEl.querySelectorAll(".todo-subtask-input"), function (input) {
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && input.value.trim()) {
          fuegeUnteraufgabeHinzu(input.dataset.todoId, input.value);
          input.value = "";
        }
      });
    });
  }

  function findTodo(id) {
    return state.todos.filter(function (t) { return t.id === id; })[0] || null;
  }

  function schalteUnteraufgabeUm(todoId, subId) {
    var t = findTodo(todoId);
    if (!t) return;
    var neueListe = (t.unteraufgaben || []).map(function (u) {
      return u.id === subId ? Object.assign({}, u, { erledigt: !u.erledigt }) : u;
    });
    todosCollection.speichern(Object.assign({}, t, { unteraufgaben: neueListe }));
  }

  function entferneUnteraufgabe(todoId, subId) {
    var t = findTodo(todoId);
    if (!t) return;
    var neueListe = (t.unteraufgaben || []).filter(function (u) { return u.id !== subId; });
    todosCollection.speichern(Object.assign({}, t, { unteraufgaben: neueListe }));
  }

  function fuegeUnteraufgabeHinzu(todoId, text) {
    var t = findTodo(todoId);
    if (!t || !text.trim()) return;
    var neueListe = (t.unteraufgaben || []).concat([neueUnteraufgabe(text.trim())]);
    todosCollection.speichern(Object.assign({}, t, { unteraufgaben: neueListe }));
  }

  function zeigeLoeschBestaetigung(todoId) {
    var t = findTodo(todoId);
    if (!t) return;
    var area = document.getElementById("todo-edit-area");
    area.innerHTML = '<div class="modal-overlay" id="todo-delete-overlay">' +
      '<div class="modal-box">' +
        '<h2>„' + escapeHtml(t.titel) + '“ löschen?</h2>' +
        '<p>Das kann nicht rückgängig gemacht werden.</p>' +
        '<div class="modal-actions">' +
          '<button id="todo-delete-cancel">Abbrechen</button>' +
          '<button class="confirm" id="todo-delete-confirm">Löschen</button>' +
        '</div>' +
      '</div>' +
    '</div>';
    function schließen() { area.innerHTML = ""; }
    document.getElementById("todo-delete-overlay").addEventListener("click", function (e) {
      if (e.target.id === "todo-delete-overlay") schließen();
    });
    document.getElementById("todo-delete-cancel").addEventListener("click", schließen);
    document.getElementById("todo-delete-confirm").addEventListener("click", function () {
      todosCollection.loeschen(todoId);
      schließen();
    });
  }

  function oeffneTodoFormular(bestehendesTodo) {
    var form = bestehendesTodo
      ? { id: bestehendesTodo.id, titel: bestehendesTodo.titel, farbe: bestehendesTodo.farbe, kategorie: bestehendesTodo.kategorie || "", unteraufgaben: bestehendesTodo.unteraufgaben || [] }
      : leereForm();

    var area = document.getElementById("todo-edit-area");
    area.innerHTML = '<div class="modal-overlay" id="todo-form-overlay">' +
      '<div class="modal-box">' +
        '<h2>' + (bestehendesTodo ? "Thema bearbeiten" : "Neues Thema") + '</h2>' +
        '<div class="field"><label>Titel</label><input type="text" id="todo-form-titel" placeholder="z. B. Garten" value="' + escapeHtml(form.titel) + '" /></div>' +
        '<div class="field"><label>Kategorie<span class="hint">Optional</span></label><select id="todo-form-kategorie"><option value="">Keine</option></select></div>' +
        '<div class="field"><label>Farbe</label><div class="color-swatches" id="todo-form-farben">' +
          FARBEN.map(function (c) {
            return '<button type="button" class="swatch' + (form.farbe === c.hex ? " active" : "") + '" data-hex="' + c.hex + '" style="background:' + c.hex + '" aria-label="Farbe ' + c.id + '"></button>';
          }).join("") +
        '</div></div>' +
        '<div class="modal-actions">' +
          '<button id="todo-form-cancel">Abbrechen</button>' +
          '<button class="confirm" id="todo-form-save" style="background:var(--brown);border-color:var(--brown)">Speichern</button>' +
        '</div>' +
      '</div>' +
    '</div>';

    var kategorieSelect = document.getElementById("todo-form-kategorie");
    sortierteTodoKategorien().forEach(function (k) {
      var opt = document.createElement("option");
      opt.value = k.id;
      opt.textContent = k.label;
      if (k.id === form.kategorie) opt.selected = true;
      kategorieSelect.appendChild(opt);
    });

    function schließen() { area.innerHTML = ""; }
    document.getElementById("todo-form-overlay").addEventListener("click", function (e) {
      if (e.target.id === "todo-form-overlay") schließen();
    });
    document.getElementById("todo-form-cancel").addEventListener("click", schließen);

    Array.prototype.forEach.call(document.querySelectorAll("#todo-form-farben .swatch"), function (btn) {
      btn.addEventListener("click", function () {
        form.farbe = btn.dataset.hex;
        Array.prototype.forEach.call(document.querySelectorAll("#todo-form-farben .swatch"), function (b) {
          b.classList.toggle("active", b === btn);
        });
      });
    });

    document.getElementById("todo-form-save").addEventListener("click", function () {
      var titel = document.getElementById("todo-form-titel").value.trim();
      if (!titel) return;
      var kategorie = document.getElementById("todo-form-kategorie").value;
      var neuesTodo = {
        id: form.id || window.KochbuchDB.neueId("todo"),
        titel: titel,
        farbe: form.farbe,
        kategorie: kategorie,
        unteraufgaben: form.unteraufgaben,
        reihenfolge: form.id ? bestehendesTodo.reihenfolge : state.todos.length
      };
      todosCollection.speichern(neuesTodo);
      schließen();
    });
  }

  function oeffneTodoKategorienVerwaltung() {
    var area = document.getElementById("todo-edit-area");
    area.innerHTML = '<div class="modal-overlay" id="todo-kat-overlay">' +
      '<div class="modal-box kat-manage-box">' +
        '<h2>Kategorien verwalten</h2>' +
        '<div id="todo-kat-error-area"></div>' +
        '<div id="todo-kat-list"></div>' +
        '<div class="shop-add-row" style="margin-top:14px;">' +
          '<input type="text" id="todo-kat-neu-input" placeholder="Neue Kategorie..." />' +
          '<button id="todo-kat-neu-btn">+ Hinzufügen</button>' +
        '</div>' +
        '<div class="modal-actions" style="margin-top:16px;">' +
          '<button id="todo-kat-close-btn">Fertig</button>' +
        '</div>' +
      '</div>' +
    '</div>';

    function schließen() { area.innerHTML = ""; }
    document.getElementById("todo-kat-overlay").addEventListener("click", function (e) {
      if (e.target.id === "todo-kat-overlay") schließen();
    });
    document.getElementById("todo-kat-close-btn").addEventListener("click", schließen);

    renderTodoKategorienListe();

    document.getElementById("todo-kat-neu-btn").addEventListener("click", function () {
      var input = document.getElementById("todo-kat-neu-input");
      var label = input.value.trim();
      if (!label) return;
      var neu = { id: window.KochbuchDB.neueId("tkat"), label: label, reihenfolge: TODO_KATEGORIEN.length };
      todoKategorienCollection.speichern(neu).then(function (ok) {
        zeigeTodoKatFehler(ok ? "" : "Speichern hat nicht geklappt. Prüfe die Internetverbindung oder Firestore-Regeln.");
      });
      input.value = "";
      setTimeout(renderTodoKategorienListe, 150);
    });
    document.getElementById("todo-kat-neu-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") document.getElementById("todo-kat-neu-btn").click();
    });
  }

  function zeigeTodoKatFehler(text) {
    var el = document.getElementById("todo-kat-error-area");
    if (!el) return;
    el.innerHTML = text ? '<div class="alert error" style="margin-bottom:12px;">' + escapeHtml(text) + '</div>' : "";
  }

  function renderTodoKategorienListe() {
    var listEl = document.getElementById("todo-kat-list");
    if (!listEl) return;

    listEl.innerHTML = sortierteTodoKategorien().map(function (k) {
      return '<div class="kat-item" data-kat-id="' + k.id + '">' +
        '<span class="kat-drag-handle">⠿</span>' +
        '<input type="text" class="kat-label-input" data-kat-id="' + k.id + '" value="' + escapeHtml(k.label) + '" />' +
        '<button class="kat-delete-btn" data-kat-id="' + k.id + '" aria-label="Löschen">🗑️</button>' +
      '</div>';
    }).join("");

    Array.prototype.forEach.call(listEl.querySelectorAll(".kat-label-input"), function (input) {
      input.addEventListener("blur", function () {
        var neuesLabel = input.value.trim();
        if (!neuesLabel) { input.value = todoKategorieLabel(input.dataset.katId); return; }
        var k = TODO_KATEGORIEN.filter(function (x) { return x.id === input.dataset.katId; })[0];
        if (k && k.label !== neuesLabel) {
          todoKategorienCollection.speichern(Object.assign({}, k, { label: neuesLabel })).then(function (ok) {
            zeigeTodoKatFehler(ok ? "" : "Speichern hat nicht geklappt.");
          });
        }
      });
    });

    Array.prototype.forEach.call(listEl.querySelectorAll(".kat-delete-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var katId = btn.dataset.katId;
        var anzahl = state.todos.filter(function (t) { return t.kategorie === katId; }).length;
        var bestaetigt = anzahl === 0 || window.confirm(
          "Diese Kategorie wird bei " + anzahl + " Thema/Themen verwendet. Diese bleiben erhalten, gehören dann aber keiner Kategorie mehr an. Trotzdem löschen?"
        );
        if (!bestaetigt) return;
        todoKategorienCollection.loeschen(katId).then(function (ok) {
          zeigeTodoKatFehler(ok ? "" : "Löschen hat nicht geklappt.");
        });
        setTimeout(renderTodoKategorienListe, 150);
      });
    });

    bindeTodoKategorienDragDrop(listEl);
  }

  function bindeTodoKategorienDragDrop(listEl) {
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
        var k = TODO_KATEGORIEN.filter(function (x) { return x.id === item.dataset.katId; })[0];
        if (k && k.reihenfolge !== neueReihenfolge) {
          aufgaben.push(todoKategorienCollection.speichern(Object.assign({}, k, { reihenfolge: neueReihenfolge })));
        }
      });
      if (aufgaben.length) {
        Promise.all(aufgaben).then(function (ergebnisse) {
          var alleOk = ergebnisse.every(function (ok) { return ok; });
          zeigeTodoKatFehler(alleOk ? "" : "Reihenfolge speichern hat nicht geklappt.");
        });
      }
      pointerDragSrc = null;
    });
  }

  var dragDropInitialisiert = false;

  function initialisiereDragDropEinmalig() {
    if (dragDropInitialisiert) return;
    dragDropInitialisiert = true;

    window.KochbuchDragDrop.registriere({
      cardSelector: ".todo-card",
      dropZoneSelector: "#todo-list",
      onDrop: function () {
        var items = document.getElementById("todo-list").querySelectorAll(".todo-card");
        var aufgaben = [];
        Array.prototype.forEach.call(items, function (el, index) {
          var t = findTodo(el.dataset.id);
          if (t && t.reihenfolge !== index) {
            aufgaben.push(todosCollection.speichern(Object.assign({}, t, { reihenfolge: index })));
          }
        });
        Promise.all(aufgaben);
      }
    });
  }

  function bindeStatischeEvents() {
    document.getElementById("todo-fab-add").addEventListener("click", function () {
      oeffneTodoFormular(null);
    });
    document.getElementById("todo-settings-btn").addEventListener("click", oeffneTodoKategorienVerwaltung);
  }

  return {
    init: init,
    bindeStatischeEvents: bindeStatischeEvents,
    render: render,
    getState: function () { return state; }
  };
})();
