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

/** Startpasswort für neue Konten: gut lesbar, 12 Zeichen */
export function startPassword() {
  const A = 'abcdefghjkmnpqrstuvwxyz23456789', r = crypto.getRandomValues(new Uint8Array(12));
  let s = ''; for (let i = 0; i < 12; i++) s += A[r[i] % A.length];
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8);
}
