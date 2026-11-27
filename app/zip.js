// Probe – kleines ZIP ohne Bibliothek: schreiben ohne Kompression (die Archive sind ohnehin verschlüsselt, also nicht komprimierbar),
// lesen ohne Kompression und mit „deflate“ (über DecompressionStream, falls die Datei mit einem anderen Programm neu gepackt wurde).

const te = new TextEncoder(), td = new TextDecoder();
let T = null;
function crc32(u8) {
  if (!T) { T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; } }
  let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0;
}
const dosTime = d => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
const dosDate = d => (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;

/** files: [{ name: 'Ordner/Datei.json', data: Uint8Array | string }] → Blob (application/zip) */
export function zipBlob(files) {
  const parts = [], central = [], now = new Date(); let off = 0;
  for (const f of files) {
    const name = te.encode(f.name), data = typeof f.data === 'string' ? te.encode(f.data) : f.data, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); // UTF-8-Namen, ohne Kompression
    h.setUint16(10, dosTime(now), true); h.setUint16(12, dosDate(now), true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
    h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(h.buffer, name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, dosTime(now), true); c.setUint16(14, dosDate(now), true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(c.buffer, name);
    off += 30 + name.length + data.length;
  }
  const csize = central.reduce((s, x) => s + x.byteLength, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, e.buffer], { type: 'application/zip' });
}

/** ZIP lesen (über das zentrale Verzeichnis) → [{ name, text() }] */
export async function unzip(buf) {
  const u8 = new Uint8Array(buf), v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let e = u8.length - 22; while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Die Datei ist kein gültiges ZIP-Archiv.');
  const n = v.getUint16(e + 10, true); let p = v.getUint32(e + 16, true); const out = [];
  for (let i = 0; i < n; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP-Verzeichnis beschädigt');
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), lo = v.getUint32(p + 42, true);
    const name = td.decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
    if (name.endsWith('/')) continue;
    const start = lo + 30 + v.getUint16(lo + 26, true) + v.getUint16(lo + 28, true), raw = u8.subarray(start, start + size);
    out.push({ name, text: async () => {
      if (method === 0) return td.decode(raw);
      if (method === 8 && typeof DecompressionStream !== 'undefined') return new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
      throw new Error(`„${name}“ ist mit einem nicht unterstützten Verfahren gepackt.`);
    } });
  }
  return out;
}
