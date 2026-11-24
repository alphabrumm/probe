// Probe – kleiner IndexedDB-Speicher für Zwischenstände, die noch nicht beim Server angekommen sind.
// Hier liegt nie Klartext: Einträge sind vorher mit dem öffentlichen Schlüssel der Lehrkraft verschlüsselt.
const DB = 'probe', VER = 1, STORE = 'pending';
let dbp = null;
const open = () => dbp || (dbp = new Promise((res, rej) => {
  const r = indexedDB.open(DB, VER);
  r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'k' }); };
  r.onsuccess = () => res(r.result); r.onerror = () => { dbp = null; rej(r.error); };
}));
async function tx(mode, fn) {
  const d = await open();
  return new Promise((res, rej) => { const t = d.transaction(STORE, mode), q = fn(t.objectStore(STORE)); t.oncomplete = () => res(q?.result); t.onerror = t.onabort = () => rej(t.error); });
}
export const idbPut = v => tx('readwrite', s => s.put(v));
export const idbDel = k => tx('readwrite', s => s.delete(k));
export const idbAll = () => tx('readonly', s => s.getAll());
