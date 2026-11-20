// Probe – Syntax-Highlighting für Code in Antworten und Musterlösungen (ohne Fremdbibliothek).
// Sprache je Prüfungs-App: JPad → Java, QPad → SQL. Weitere Sprachen: Eintrag in LANGS + Zuordnung in APP_LANG.

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const words = s => new Set(s.split(/\s+/).filter(Boolean));

const LANGS = {
  java: {
    re: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|(@[A-Za-z_]\w*)|(\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?[fFdDlL]?\b)|([A-Za-z_$][\w$]*)/g,
    kw: words(`abstract assert boolean break byte case catch char class const continue default do double else enum extends final
      finally float for goto if implements import instanceof int interface long native new package private protected public return
      short static strictfp super switch synchronized this throw throws transient try void volatile while var record yield
      true false null`),
    builtin: words('println print'),
    caseless: false,
  },
  sql: {
    re: /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:''|[^'])*'?|"(?:[^"])*"?)|(@[A-Za-z_]\w*)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][\w]*)/g,
    kw: words(`select from where and or not in is null like between as distinct order by group having limit offset join inner left
      right full outer cross on using union all intersect except insert into values update set delete create table drop alter
      add column primary key foreign references unique default check index view if exists case when then else end asc desc
      true false integer int varchar char text real float double decimal numeric date boolean autoincrement`),
    builtin: words('count sum avg min max upper lower length substr substring round abs coalesce ifnull now date strftime cast'),
    caseless: true,
  },
};
const APP_LANG = { jpad: 'java', qpad: 'sql' };
export const langOf = app => APP_LANG[app] || null;

/** Code als HTML mit <span class="hl-…">; unbekannte Sprache → nur escaped */
export function highlight(code, lang) {
  const L = LANGS[lang]; code = String(code ?? '');
  if (!L) return esc(code);
  let out = '', last = 0, m;
  L.re.lastIndex = 0;
  while ((m = L.re.exec(code))) {
    out += esc(code.slice(last, m.index)); last = L.re.lastIndex;
    const [tok, com, str, ann, num, id] = m;
    let cls = com ? 'c' : str ? 's' : ann ? 'a' : num ? 'n' : '';
    if (id) {
      const w = L.caseless ? id.toLowerCase() : id, next = code.slice(last).match(/^\s*\(/);
      cls = L.kw.has(w) ? 'k' : L.builtin.has(w) && next ? 'f' : !L.caseless && /^[A-Z]/.test(id) ? 't' : next ? 'f' : '';
    }
    out += cls ? `<span class="hl-${cls}">${esc(tok)}</span>` : esc(tok);
  }
  return out + esc(code.slice(last));
}

/**
 * Antwort einer Programmier-Aufgabe (Text aus pfsplit appText): Code mit Highlighting, Programmlauf als eigener Kasten.
 * cls: Klassen des Code-Kastens (Probe: „ans code“)
 */
export function codeAnswerHtml(text, app, cls = 'ans code') {
  const s = String(text ?? ''), i = s.indexOf('\n\n▶ ');
  const code = i >= 0 ? s.slice(0, i) : s, rest = i >= 0 ? s.slice(i + 2) : '';
  const lang = langOf(app);
  let html = `<div class="${cls} hl"${lang ? ` data-lang="${lang}"` : ''}>${highlight(code, lang)}</div>`;
  if (rest) {
    const nl = rest.indexOf('\n'), head = nl >= 0 ? rest.slice(0, nl) : rest, body = nl >= 0 ? rest.slice(nl + 1) : '';
    const warn = body.match(/\n?(⚠[^\n]*)$/);
    html += `<div class="run-out"><div class="run-head">${esc(head)}</div>${body.replace(/\n?⚠[^\n]*$/, '') ? `<pre>${esc(body.replace(/\n?⚠[^\n]*$/, ''))}</pre>` : ''}${warn ? `<div class="run-warn">${esc(warn[1])}</div>` : ''}</div>`;
  }
  return html;
}
