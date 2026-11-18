// Notfall-Reset: erzeugt den Inhalt für data/notfall.txt.
// Aufruf: node tools/notfall.mjs [Kürzel|*] [Startpasswort]  – ohne Startpasswort wird eines erzeugt (steht dann auf stderr).
import * as K from '../app/crypto.js';
const kuerzel = process.argv[2] || '*', pw = process.argv[3] || K.startPassword();
if (!/^(\*|[\p{L}0-9._-]{2,20})$/u.test(kuerzel)) { console.error('Ungültiges Kürzel'); process.exit(1); }
const salt = K.randomSalt(), { auth } = await K.fromPassword(pw, salt);
if (!process.argv[3]) console.error('Startpasswort: ' + pw);
console.log(`${kuerzel} ${salt} ${auth}`);
