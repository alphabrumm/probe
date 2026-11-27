// Probe – Schul-Wiederherstellungsschlüssel (Admin → Schulschlüssel).
// Notfallweg für Prüfungsarchive: Verlässt eine Lehrkraft die Schule oder verliert sie ihren Schlüssel, öffnet die Schul-Passphrase
// vom ausgedruckten Blatt (Tresor der Schulleitung) ihre Archive. Der Admin allein kann nichts lesen: Die Passphrase steht nie auf
// dem Server, dort liegt nur der öffentliche Schlüssel und der private – mit der Passphrase verschlüsselt.
// Gilt nur für Prüfungsarchive – nie für Coaching, Gesprächsnotizen oder Fragebögen.
import { Pdf, PAGE_W, fit, wrap } from './pdf.js';

const INK = '#1F2340', GREY = '#6B7085', ACC = '#3B4FC4', RED = '#B3261E';
const when = t => new Date(t * 1000).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });

/** Druckblatt für den Tresor */
export function sheetPdf({ kid, pass, url, von, created = Date.now() }) {
  const pdf = new Pdf('Probe – Schul-Wiederherstellungsschlüssel'), M = 56, W = PAGE_W - 2 * M;
  let y = M + 10;
  pdf.text('VERTRAULICH – IM TRESOR AUFBEWAHREN', M, y, 10, { bold: true, col: RED }); y += 30;
  pdf.text('Probe – Schul-Wiederherstellungsschlüssel', M, y, 20, { bold: true, col: INK }); y += 34;
  const row = (k, v, size = 11, bold = false) => { pdf.text(k, M, y, 9.5, { col: GREY }); pdf.text(fit(v, size, bold, W - 130), M + 130, y, size, { bold, col: INK }); y += size + 12; };
  row('Adresse', url.replace(/^https?:\/\//, '').replace(/\/$/, ''));
  row('Kennung', kid, 12, true);
  row('Erstellt', new Date(created).toLocaleString('de-DE', { dateStyle: 'long', timeStyle: 'short' }) + (von ? ` von ${von}` : ''));
  y += 14;
  pdf.text('Schul-Passphrase', M, y, 10, { bold: true, col: ACC }); y += 12;
  pdf.rect(M, y, W, 64, '#F3F5FB', '#3B4FC4', 1.2);
  pdf.text(pass, M + W / 2, y + 40, 21, { bold: true, col: INK, align: 'center' }); y += 92;
  const para = (t, size = 10, col = INK, bold = false) => { for (const l of wrap(t, size, bold, W)) { pdf.text(l, M, y, size, { col, bold }); y += size + 4.5; } y += 7; };
  para('Wozu dient dieses Blatt?', 11, INK, true);
  para('Mit dieser Passphrase lassen sich Prüfungsarchive aus Probe öffnen, wenn die Lehrkraft es selbst nicht mehr kann – etwa weil sie die Schule verlassen oder ihr Passwort und ihren Wiederherstellungscode verloren hat. Sie gilt nur für Prüfungen, nie für Coaching, Gesprächsnotizen oder Fragebögen.');
  para('Wie wird sie verwendet?', 11, INK, true);
  para('In Probe das Archiv öffnen („Archiv öffnen“) und, wenn danach gefragt wird, diese Passphrase eingeben. Groß- und Kleinschreibung sowie Bindestriche spielen keine Rolle. Das Archiv wird nur im Browser entschlüsselt.');
  para('Sicherheit', 11, INK, true);
  para('Die Passphrase steht nur auf diesem Blatt – nicht auf dem Server und nicht beim Admin. Wer Archiv und Blatt zusammen hat, kann die Prüfungen lesen. Darum: nur im Tresor der Schulleitung aufbewahren, nicht kopieren oder abfotografieren, Entnahme nach dem Vier-Augen-Prinzip dokumentieren.');
  para('Wird ein neuer Schulschlüssel erzeugt, bleibt dieses Blatt für alle bis dahin erstellten Archive nötig (Kennung siehe oben). Nicht vernichten, solange es solche Archive gibt.', 9.5, GREY);
  y += 10; pdf.line(M, y, M + 220, y, '#999999'); pdf.line(M + W - 220, y, M + W, y, '#999999'); y += 12;
  pdf.text('Hinterlegt am / Unterschrift', M, y, 8.5, { col: GREY }); pdf.text('Schulleitung', M + W - 220, y, 8.5, { col: GREY });
  return pdf.bytes();
}

/** Inhalt des Admin-Reiters */
export async function schoolKeyTab(box, H) {
  const { api, K, S, dialog, toast, esc, withBusy, showPdf } = H;
  let L; try { L = (await api('sk_list')).keys; } catch (e) { box.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  const act = L.find(k => +k.active);
  box.innerHTML = `<p>Der <b>Schul-Wiederherstellungsschlüssel</b> ist der Notfallweg für Prüfungsarchive: Kann eine Lehrkraft ihre Archive nicht mehr
      öffnen (z. B. weil sie die Schule verlassen hat), öffnet sie die Schul-Passphrase. Die Passphrase wird nur einmal angezeigt und gehört
      <b>ausgedruckt in den Tresor der Schulleitung</b>. Probe speichert sie nicht – auch der Admin kann damit allein nichts entschlüsseln.
      Coaching, Gesprächsnotizen und Fragebögen sind davon nie betroffen.</p>
    ${act ? `<p><span class="chip good">aktiv</span> Kennung <b>${esc(act.kid)}</b> · erstellt am ${esc(when(act.created))}${act.von ? ` von ${esc(act.von)}` : ''}</p>`
      : '<p><span class="chip warn">noch keiner</span> Archive lassen sich bisher nur mit dem Schlüssel der Lehrkraft (und der Fachleitung bzw. der Admins bei Respizienz-Archiven) öffnen.</p>'}
    <div class="btns"><button class="btn ${act ? '' : 'pri'}" id="skNew">${act ? 'Neuen Schulschlüssel erzeugen' : 'Schulschlüssel erzeugen'}</button>${act ? '<button class="btn" id="skTest">Passphrase vom Blatt prüfen</button>' : ''}</div>
    ${L.length > 1 ? `<h3>Frühere Schulschlüssel</h3><p class="help">Archive, die damit erstellt wurden, brauchen weiterhin das jeweilige Blatt.</p>
      <table class="t"><tr><th>Kennung</th><th>erstellt</th><th>von</th></tr>${L.filter(k => !+k.active).map(k => `<tr><td>${esc(k.kid)}</td><td>${esc(when(k.created))}</td><td>${esc(k.von || '')}</td></tr>`).join('')}</table>` : ''}`;
  box.querySelector('#skNew').onclick = () => create(!!act);
  box.querySelector('#skTest') && (box.querySelector('#skTest').onclick = test);

  function create(replace) {
    const pass = K.newSchoolPass(), url = new URL('.', location.href).href;
    let made = null;
    const d = dialog('🔐 Schul-Wiederherstellungsschlüssel', `${replace ? '<p class="warnbox">Der bisherige Schulschlüssel wird ersetzt. Für schon erstellte Archive bleibt sein Blatt nötig – bitte nicht vernichten.</p>' : ''}
      <p>Diese Passphrase wird <b>nur jetzt</b> angezeigt:</p><div class="codebox" style="font-size:1.35em;letter-spacing:.04em;text-align:center">${esc(pass)}</div>
      <ol class="help"><li>Blatt als PDF laden und ausdrucken.</li><li>Blatt in den Tresor der Schulleitung legen (nicht abfotografieren, nicht digital speichern).</li><li>Bestätigen – erst dann wird der Schlüssel aktiv.</li></ol>
      <div class="btns"><button class="btn" id="pdf">⇩ Blatt als PDF</button></div>
      <label class="check"><input type="checkbox" id="ok" disabled> Das Blatt ist ausgedruckt und liegt sicher verwahrt.</label>
      <div class="err" id="err"></div><div class="btns"><button class="btn pri" id="go" disabled>Schulschlüssel aktivieren</button></div>`);
    const $ = s => d.el.querySelector(s);
    const prep = withBusy('Schlüssel wird erzeugt …', async () => { made = await K.newSchoolKey(pass); });
    $('#pdf').onclick = async () => { await prep; showPdf(sheetPdf({ kid: made.kid, pass, url, von: S.user.kuerzel }), `Probe-Schulschluessel_${made.kid}.pdf`); $('#ok').disabled = false; };
    $('#ok').onchange = () => { $('#go').disabled = !$('#ok').checked; };
    $('#go').onclick = async () => {
      $('#go').disabled = true;
      try { await prep; await api('sk_create', made); d.close(); toast(`✓ Schulschlüssel ${made.kid} ist aktiv`, 5000); schoolKeyTab(box, H); }
      catch (e) { $('#err').textContent = e.message; $('#go').disabled = false; }
    };
  }
  async function test() {
    const d = dialog('Passphrase prüfen', `<p class="help">Zum Beispiel bei der jährlichen Kontrolle des Tresors: passt das Blatt zum aktiven Schulschlüssel?</p>
      <label class="f">Schul-Passphrase<input type="text" id="pp" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"></label>
      <div class="err" id="err"></div><div class="btns"><button class="btn pri" id="go">Prüfen</button></div>`);
    const $ = s => d.el.querySelector(s);
    $('#go').onclick = async () => {
      $('#err').textContent = ''; $('#go').disabled = true;
      try { const { key } = await api('school_key'); await withBusy('wird geprüft …', () => K.openSchoolKey(key, $('#pp').value)); d.close(); toast(`✓ Die Passphrase passt zum Schulschlüssel ${key.kid}`, 5000); }
      catch (e) { $('#err').textContent = 'Die Passphrase passt nicht zum aktiven Schulschlüssel.'; $('#go').disabled = false; }
    };
  }
}
