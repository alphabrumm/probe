// Probe – Verschlüsselung im Browser (WebCrypto, keine Bibliothek).
// Jede Lehrkraft hat ein Schlüsselpaar (ECDH P-256). Der private Schlüssel liegt auf dem Server nur verschlüsselt:
// einmal mit einem Schlüssel aus dem Passwort, einmal mit einem aus dem Wiederherstellungscode.
// Aus dem Passwort entstehen zwei getrennte Werte: der Login-Wert (geht an den Server) und der Passwort-Schlüssel (bleibt hier).

const te = new TextEncoder(), td = new TextDecoder();
const C = crypto.subtle;
export const PBKDF2_ROUNDS = 600000;
const REC_ROUNDS = 200000;

export const b64 = u8 => { let s = ''; const a = new Uint8Array(u8); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
export const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hex = u8 => [...new Uint8Array(u8)].map(x => x.toString(16).padStart(2, '0')).join('');
export const randomSalt = () => b64(crypto.getRandomValues(new Uint8Array(16)));

async function pbkdf2(secret, saltB64, rounds, bits) {
  const base = await C.importKey('raw', te.encode(secret.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await C.deriveBits({ name: 'PBKDF2', salt: unb64(saltB64), iterations: rounds, hash: 'SHA-256' }, base, bits));
}
const aesKey = raw => C.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

/** Passwort → { auth: Login-Wert (hex, für den Server), key: Passwort-Schlüssel (AES, bleibt im Browser) } */
export async function fromPassword(pw, saltB64) {
  const bits = await pbkdf2(pw, saltB64, PBKDF2_ROUNDS, 512);
  return { auth: hex(bits.slice(0, 32)), key: await aesKey(bits.slice(32)) };
}
/** Wiederherstellungscode → AES-Schlüssel */
export async function fromRecovery(code, saltB64) {
  return aesKey(await pbkdf2(normCode(code), saltB64, REC_ROUNDS, 256));
}
export const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
/** Wiederherstellungscode: 20 Zeichen (100 Bit), in Fünfergruppen */
export function newRecoveryCode() {
  const A = '0123456789ABCDEFGHJKMNPQRSTUVWXYZ'.replace(/[ILO]/g, ''), r = crypto.getRandomValues(new Uint8Array(20));
  let s = ''; for (let i = 0; i < 20; i++) s += A[r[i] % 32];
  return s.match(/.{4}/g).join('-');
}

async function aesSeal(key, bytes) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await C.encrypt({ name: 'AES-GCM', iv }, key, bytes)); const o = new Uint8Array(12 + ct.length); o.set(iv); o.set(ct, 12); return b64(o); }
async function aesOpen(key, s) { const u = unb64(s); return new Uint8Array(await C.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, key, u.slice(12))); }

/** neues Schlüsselpaar: { pub (Base64, SPKI), priv (CryptoKey) } */
export async function newKeyPair() {
  const kp = await C.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
  return { pub: b64(await C.exportKey('spki', kp.publicKey)), priv: kp.privateKey };
}
export async function wrapPriv(priv, key) { return aesSeal(key, new Uint8Array(await C.exportKey('pkcs8', priv))); }
export async function unwrapPriv(s, key) { return C.importKey('pkcs8', await aesOpen(key, s), { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']); }
const importPub = pubB64 => C.importKey('spki', unb64(pubB64), { name: 'ECDH', namedCurve: 'P-256' }, false, []);

/** Daten für den Besitzer eines öffentlichen Schlüssels verschlüsseln (Einmal-Schlüssel + ECDH + AES-GCM) */
export async function seal(pubB64, data) {
  const eph = await C.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
  const k = await C.deriveKey({ name: 'ECDH', public: await importPub(pubB64) }, eph.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  return JSON.stringify({ v: 1, e: b64(await C.exportKey('spki', eph.publicKey)), d: await aesSeal(k, te.encode(JSON.stringify(data))) });
}
/** …und mit dem privaten Schlüssel wieder öffnen */
export async function open(priv, sealed) {
  const o = JSON.parse(sealed);
  const k = await C.deriveKey({ name: 'ECDH', public: await importPub(o.e) }, priv, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  return JSON.parse(td.decode(await aesOpen(k, o.d)));
}

/* ---------- Ergebniscode der Schüler ---------- */
// 12 Zeichen (60 Bit) – erzeugt auf dem Schüler-iPad. Daraus entstehen die Bericht-ID (für den Server) und der Berichtsschlüssel.
export function resultCode() {
  const A = '23456789ABCDEFGHJKMNPQRSTUVWXYZ', r = crypto.getRandomValues(new Uint8Array(12));
  let s = ''; for (let i = 0; i < 12; i++) s += A[r[i] % A.length];
  return s.match(/.{4}/g).join('-');
}
export const normResult = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
export async function reportKeys(code) {
  const n = normResult(code);
  const rid = hex(new Uint8Array(await C.digest('SHA-256', te.encode('probe-bericht|' + n)))).slice(0, 40);
  const key = await aesKey(new Uint8Array(await C.digest('SHA-256', te.encode('probe-schluessel|' + n))));
  return { rid, key };
}
export const sealSym = async (key, data) => aesSeal(key, te.encode(JSON.stringify(data)));
/* ---------- Prüfungsschlüssel: verschlüsselt die Schülerfassung. Den Server erreicht er nie im Klartext – die Schüler bekommen ihn
   über den QR-Code bzw. Link (Teil hinter „#“, der nicht an den Server geht), die Lehrkraft hat ihn für sich verschlüsselt. ---------- */
const b64u = u8 => b64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => unb64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
/** Prüfsumme der Bewertung (zeigt an, ob sie sich seit dem Archivieren geändert hat) */
export async function gradingHash(g) { const h = new Uint8Array(await C.digest('SHA-256', te.encode(JSON.stringify(g ?? null)))); return [...h.slice(0, 16)].map(x => x.toString(16).padStart(2, '0')).join(''); }
export const EXAM_KEY_RE = /^[A-Za-z0-9_-]{22}$/;
export const newExamKey = () => b64u(crypto.getRandomValues(new Uint8Array(16)));
export async function sealExamDoc(k, doc) { if (!EXAM_KEY_RE.test(k || '')) throw new Error('Prüfungsschlüssel ungültig'); return sealSym(await aesKey(unb64u(k)), doc); }
export async function openExamDoc(k, s) { if (!EXAM_KEY_RE.test(k || '')) throw new Error('Prüfungsschlüssel fehlt'); return openSym(await aesKey(unb64u(k)), s); }
export const openSym = async (key, s) => JSON.parse(td.decode(await aesOpen(key, s)));

/** Startpasswort für neue Konten: gut lesbar, 12 Zeichen */
export function startPassword() {
  const A = 'abcdefghjkmnpqrstuvwxyz23456789', r = crypto.getRandomValues(new Uint8Array(12));
  let s = ''; for (let i = 0; i < 12; i++) s += A[r[i] % A.length];
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8);
}

/* ---------- Archive (Respizienz) ----------
   Inhalt mit einem zufälligen Archivschlüssel (AES-256-GCM) verschlüsselt. Den Archivschlüssel gibt es mehrfach:
   für die Fachleitung (ihr Schlüsselpaar), für jeden Admin (Rückfallweg) und optional mit einer Passphrase (z. B. für die Nachfolge). */
export async function archiveSeal(data, { users = [], passphrase = '', info = {}, school = null } = {}) {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const body = await aesSeal(await aesKey(raw), te.encode(JSON.stringify(data)));
  const rec = [];
  for (const u of users) rec.push({ t: 'key', role: u.role, kuerzel: u.kuerzel, name: u.name || '', pub: u.pub_key, k: await seal(u.pub_key, { k: b64(raw) }) });
  // Schul-Wiederherstellungsschlüssel: der private Teil liegt (mit der Schul-Passphrase verschlüsselt) im Archiv selbst – öffnen geht dann auch ohne Server
  if (school?.pub) rec.push({ t: 'school', kid: school.kid, pub: school.pub, salt: school.salt, rounds: school.rounds, priv: school.priv_enc, k: await seal(school.pub, { k: b64(raw) }) });
  if (passphrase) { const salt = randomSalt(); rec.push({ t: 'pass', salt, rounds: PBKDF2_ROUNDS, k: await aesSeal(await aesKey(await pbkdf2(passphrase, salt, PBKDF2_ROUNDS, 256)), raw) }); }
  return { probe: 'archiv', v: 1, created: Date.now(), info, rec, body };
}
/* ---------- Schul-Wiederherstellungsschlüssel (Notfallweg, Blatt im Tresor der Schulleitung) ----------
   Schlüsselpaar wie bei den Lehrkräften; der private Schlüssel ist mit der Schul-Passphrase verschlüsselt (PBKDF2, 600 000 Runden).
   Die Passphrase hat 120 Bit (24 Zeichen) und steht nur auf dem ausgedruckten Blatt – nie auf dem Server. */
export function newSchoolPass() {
  const A = '0123456789ABCDEFGHJKMNPQRSTUVWXYZ'.replace(/[ILO]/g, ''), r = crypto.getRandomValues(new Uint8Array(24));
  let s = ''; for (let i = 0; i < 24; i++) s += A[r[i] % 32];
  return s.match(/.{4}/g).join('-');
}
export async function keyId(pubB64) { const h = new Uint8Array(await C.digest('SHA-256', unb64(pubB64))); return [...h.slice(0, 8)].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase().match(/.{4}/g).join('-'); }
export async function newSchoolKey(pass) {
  const kp = await newKeyPair(), salt = randomSalt();
  const priv_enc = await wrapPriv(kp.priv, await aesKey(await pbkdf2(normCode(pass), salt, PBKDF2_ROUNDS, 256)));
  return { kid: await keyId(kp.pub), pub: kp.pub, priv_enc, salt, rounds: PBKDF2_ROUNDS };
}
/** privaten Schulschlüssel mit der Passphrase öffnen (wirft, wenn sie nicht passt) */
export async function openSchoolKey(sk, pass) { return unwrapPriv(sk.priv_enc || sk.priv, await aesKey(await pbkdf2(normCode(pass), sk.salt, sk.rounds || PBKDF2_ROUNDS, 256))); }
/** öffnet ein Archiv mit dem eigenen Schlüssel (priv + pub) oder der Passphrase; null, wenn keins passt */
export async function archiveOpen(A, { priv, pub, passphrase } = {}) {
  if (A?.probe !== 'archiv' || !Array.isArray(A.rec)) throw new Error('Das ist kein Probe-Archiv.');
  let raw = null;
  if (priv && pub) for (const r of A.rec.filter(r => r.t === 'key' && r.pub === pub)) { try { raw = unb64((await open(priv, r.k)).k); break; } catch (e) { } }
  if (!raw && passphrase) for (const r of A.rec.filter(r => r.t === 'pass')) { try { raw = await aesOpen(await aesKey(await pbkdf2(passphrase, r.salt, r.rounds, 256)), r.k); break; } catch (e) { } }
  if (!raw && passphrase) for (const r of A.rec.filter(r => r.t === 'school')) { try { raw = unb64((await open(await openSchoolKey(r, passphrase), r.k)).k); break; } catch (e) { } }
  if (!raw) return null;
  return JSON.parse(td.decode(await aesOpen(await aesKey(raw), A.body)));
}
