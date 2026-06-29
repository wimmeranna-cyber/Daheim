// dragdrop.js
// Gemeinsames Long-Press-Drag&Drop-System: die ganze Karte wird gedrückt
// gehalten (statt nur ein kleiner Ziehgriff), nach kurzer Verzögerung hebt
// sie sich sichtbar ab und kann verschoben werden. Wird von Wochenplan und
// Einkaufsliste genutzt, damit das Verhalten überall konsistent und
// zuverlässig ist.

window.KochbuchDragDrop = (function () {
  "use strict";

  var LONG_PRESS_MS = 350; // Schwelle, ab der aus "Antippen" ein "Aufheben" wird
  var BEWEGUNGS_TOLERANZ_PX = 18; // Toleranz VOR dem Anheben (Finger zittert beim Halten leicht)

  // Registriert Long-Press-Drag für eine Gruppe von Karten.
  //
  // config = {
  //   cardSelector: ".week-item",          // CSS-Selektor für die ziehbaren Karten
  //   dropZoneSelector: ".week-day-items", // CSS-Selektor für gültige Zielzonen
  //   onDrop: function(cardEl) {...}       // Aufruf nach erfolgreichem Ablegen
  // }
  function registriere(config) {
    var aktiveKarte = null;
    var longPressTimer = null;
    var touchActionTimer = null;
    var startX = 0, startY = 0;
    var istAmHeben = false;
    var startTarget = null;

    function aufraeumen() {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      if (touchActionTimer) { clearTimeout(touchActionTimer); touchActionTimer = null; }
      if (aktiveKarte) {
        aktiveKarte.classList.remove("dragging", "drag-pending");
        aktiveKarte.style.touchAction = "";
      }
      Array.prototype.forEach.call(document.querySelectorAll(config.dropZoneSelector + ".drop-zone-active"), function (z) {
        z.classList.remove("drop-zone-active");
      });
      Array.prototype.forEach.call(document.querySelectorAll(config.dropZoneSelector + ".drop-zone-visible"), function (z) {
        z.classList.remove("drop-zone-visible");
      });
      aktiveKarte = null;
      istAmHeben = false;
      startTarget = null;
    }

    // Buttons (Löschen etc.) sollen weiterhin sofort reagieren, ohne
    // Long-Press-Verzögerung - nur diese werden komplett ausgenommen.
    // Bereiche mit [data-action] (Checkbox, Text zum Öffnen/Bearbeiten)
    // bekommen stattdessen Long-Press UND Klick: hält man kurz, löst der
    // ursprüngliche Klick aus; hält man länger, beginnt das Ziehen.
    document.addEventListener("pointerdown", function (e) {
      var karte = e.target.closest(config.cardSelector);
      if (!karte) return;
      if (e.target.closest("button, input, select, textarea, a")) return;

      // Für Elemente mit data-action (Checkbox, Text zum Öffnen) den
      // nativen Klick unterbinden, da wir ihn bei kurzem Antippen selbst
      // simulieren - sonst würde die Aktion doppelt ausgelöst.
      if (e.target.closest("[data-action]")) {
        e.preventDefault();
      }

      aktiveKarte = karte;
      startTarget = e.target;
      startX = e.clientX;
      startY = e.clientY;
      istAmHeben = false;
      karte.classList.add("drag-pending");

      // Kurze Schonzeit (Scrollen bleibt zunächst möglich), danach wird
      // touch-action blockiert, damit der Browser eine winzige Bewegung
      // während des restlichen Wartens nicht als Scroll-Geste interpretiert
      // und den Pointer dadurch abbricht (pointercancel).
      touchActionTimer = setTimeout(function () {
        if (aktiveKarte === karte) karte.style.touchAction = "none";
      }, 80);

      longPressTimer = setTimeout(function () {
        clearTimeout(touchActionTimer);
        if (!aktiveKarte) return;
        istAmHeben = true;
        aktiveKarte.style.touchAction = "none";
        aktiveKarte.classList.remove("drag-pending");
        aktiveKarte.classList.add("dragging");
        if (navigator.vibrate) { try { navigator.vibrate(12); } catch (err) {} }
        Array.prototype.forEach.call(document.querySelectorAll(config.dropZoneSelector), function (zone) {
          zone.classList.add("drop-zone-visible");
        });
      }, LONG_PRESS_MS);
    });

    document.addEventListener("pointermove", function (e) {
      if (!aktiveKarte) return;

      var dx = Math.abs(e.clientX - startX);
      var dy = Math.abs(e.clientY - startY);

      if (!istAmHeben) {
        if (dx > BEWEGUNGS_TOLERANZ_PX || dy > BEWEGUNGS_TOLERANZ_PX) {
          aufraeumen();
        }
        return;
      }

      e.preventDefault();
      var elemUnter = document.elementFromPoint(e.clientX, e.clientY);
      var zielKarte = elemUnter ? elemUnter.closest(config.cardSelector) : null;
      var zielZone = elemUnter ? elemUnter.closest(config.dropZoneSelector) : null;

      Array.prototype.forEach.call(document.querySelectorAll(config.dropZoneSelector + ".drop-zone-active"), function (z) {
        z.classList.remove("drop-zone-active");
      });
      var aktiveZone = zielZone || (zielKarte ? zielKarte.closest(config.dropZoneSelector) : null);
      if (aktiveZone) aktiveZone.classList.add("drop-zone-active");

      if (zielKarte && zielKarte !== aktiveKarte) {
        var rect = zielKarte.getBoundingClientRect();
        var mitteY = rect.top + rect.height / 2;
        var elternContainer = zielKarte.parentElement;
        if (e.clientY < mitteY) {
          elternContainer.insertBefore(aktiveKarte, zielKarte);
        } else {
          elternContainer.insertBefore(aktiveKarte, zielKarte.nextSibling);
        }
      } else if (zielZone && !zielZone.contains(aktiveKarte)) {
        zielZone.appendChild(aktiveKarte);
      }
    }, { passive: false });

    document.addEventListener("pointerup", function (e) {
      if (!aktiveKarte) return;
      var karte = aktiveKarte;
      var warAmHeben = istAmHeben;
      var ursprungsZiel = startTarget;
      aufraeumen();
      if (warAmHeben && config.onDrop) {
        config.onDrop(karte);
      } else if (!warAmHeben && ursprungsZiel) {
        // Kurzer Antipp ohne Ziehen: ursprünglichen Klick auf das Element
        // simulieren, da pointerdown keinen nativen "click" mehr auslöst,
        // sobald wir e.preventDefault() in pointermove genutzt haben.
        var aktionsElement = ursprungsZiel.closest("[data-action]");
        if (aktionsElement) {
          aktionsElement.click();
        }
      }
    });

    document.addEventListener("pointercancel", aufraeumen);
  }

  return { registriere: registriere };
})();
