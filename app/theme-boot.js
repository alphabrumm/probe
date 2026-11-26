// Probe – gewähltes Farbschema sofort anwenden (vor dem ersten Bild, ohne Aufflackern). Die Auswahl selbst liegt am Konto
// (prefs.theme); hier nur der zuletzt benutzte Name auf diesem Gerät, kein Inhalt.
(function () {
  var t = null; try { t = localStorage.getItem('probe.theme'); } catch (e) { }
  if (!/^(nacht|blau|weiss|gold|gelb|sepia)$/.test(t || '')) return;
  var l = document.createElement('link'); l.rel = 'stylesheet'; l.id = 'themecss'; l.href = 'app/themes/' + t + '.css'; document.head.appendChild(l);
  document.documentElement.dataset.theme = t;
  var f = document.querySelector('link[rel=icon][type="image/svg+xml"]'); if (f) f.href = 'app/themes/' + t + '.svg';
})();
