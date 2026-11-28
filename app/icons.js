// Probe – Icons (Stil „Linie“: 2 px, abgerundet, Farbe = Textfarbe, passt dadurch zu jedem Farbschema, hell und dunkel).
// ic(name) liefert das SVG als Text. Außerdem ersetzt dieses Modul Emojis in der Oberfläche (Knöpfe, Chips, Überschriften, Hinweise)
// automatisch durch die passenden Icons – auch in später eingefügtem Inhalt. Nicht angefasst werden Lernpfad-Inhalte (.lp), Eingabefelder,
// Auswahllisten (<option> kann kein SVG), Code und alles mit class="no-ic"; Texte in alert()/confirm() bleiben ohnehin Text.
const SVGNS = 'http://www.w3.org/2000/svg';
export const PATHS = {
  eye: "M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0z",
  comment: "M5.5 4.5h13a2.5 2.5 0 0 1 2.5 2.5v7.5a2.5 2.5 0 0 1-2.5 2.5h-6l-4.5 3.5v-3.5H5.5A2.5 2.5 0 0 1 3 14.5V7a2.5 2.5 0 0 1 2.5-2.5zM8 9.5h8M8 12.5h5",
  apps: "M6 4h3a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-3a2 2 0 0 1 -2 -2v-3a2 2 0 0 1 2 -2zM15 13h3a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-3a2 2 0 0 1 -2 -2v-3a2 2 0 0 1 2 -2zM15 4h3a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-3a2 2 0 0 1 -2 -2v-3a2 2 0 0 1 2 -2zM6 13h3a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-3a2 2 0 0 1 -2 -2v-3a2 2 0 0 1 2 -2z",
  inbox: "M4 13h4.5l1.5 2.5h4l1.5-2.5H20v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM12 7.5v3.5M10.3 9.6L12 11.3l1.7-1.7M4 13l2.3-7.3A1.5 1.5 0 0 1 7.7 4.7h8.6a1.5 1.5 0 0 1 1.4 1L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z",
  send: "M20.5 3.5l-6.3 17-3.7-7.2-7.2-3.7zM20.5 3.5l-10 10",
  edit: "M4 20l1-4.5L15.8 4.7a2.3 2.3 0 0 1 3.3 0l.2.2a2.3 2.3 0 0 1 0 3.3L8.5 19zM4 20l4.5-1-3.5-3.5zM14 6.5l3.5 3.5",
  copy: "M11 8.5h6.5a2.5 2.5 0 0 1 2.5 2.5v6.5a2.5 2.5 0 0 1 -2.5 2.5h-6.5a2.5 2.5 0 0 1 -2.5 -2.5v-6.5a2.5 2.5 0 0 1 2.5 -2.5zM14.25 11.5v5.5M11.5 14.25h5.5M15.5 8.5V6.5a2.5 2.5 0 0 0-2.5-2.5H6.5A2.5 2.5 0 0 0 4 6.5V13a2.5 2.5 0 0 0 2.5 2.5h2",
  trash: "M6 7.5l1 11.5a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8l1-11.5zM4 7.5h16M9.5 7.5V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2.5M10 11v6M14 11v6",
  lock: "M7.5 10.5h9a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1 -2.5 2.5h-9a2.5 2.5 0 0 1 -2.5 -2.5v-5a2.5 2.5 0 0 1 2.5 -2.5zM10.7 15.5a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0zM8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3",
  download: "M4.5 15.5v2.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.5M12 4v10.5M7.5 10L12 14.5 16.5 10",
  jpad: "M5 9.5h11.5v4.5a5 5 0 0 1-5 5h-1.5a5 5 0 0 1-5-5zM9 3.8c-.9 1 .9 2.1 0 3.2M12.5 3.8c-.9 1 .9 2.1 0 3.2M16.5 11h1.3a2.3 2.3 0 0 1 0 4.6h-1.6",
  qr: "M8.8 8h1.6a0.8 0.8 0 0 1 0.8 0.8v1.6a0.8 0.8 0 0 1 -0.8 0.8h-1.6a0.8 0.8 0 0 1 -0.8 -0.8v-1.6a0.8 0.8 0 0 1 0.8 -0.8zM13.600000000000001 8h1.6a0.8 0.8 0 0 1 0.8 0.8v1.6a0.8 0.8 0 0 1 -0.8 0.8h-1.6a0.8 0.8 0 0 1 -0.8 -0.8v-1.6a0.8 0.8 0 0 1 0.8 -0.8zM8.8 12.8h1.6a0.8 0.8 0 0 1 0.8 0.8v1.6a0.8 0.8 0 0 1 -0.8 0.8h-1.6a0.8 0.8 0 0 1 -0.8 -0.8v-1.6a0.8 0.8 0 0 1 0.8 -0.8zM12.8 12.8h3.2v3.2M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5",
  pin: "M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 0 1 13 0c0 5.2-6.5 11-6.5 11zM9.7 10a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0 -4.6 0z",
  trophy: "M8 4h8v5.5a4 4 0 0 1-8 0zM8 6H5.5a2.5 2.5 0 0 0 2.8 3.8M16 6h2.5a2.5 2.5 0 0 1-2.8 3.8M12 13.5V17M8.5 20.5h7M9.5 17h5v3.5h-5z",
  play: "M8 5.5v13l10.5-6.5z",
  stop: "M9 6.5h6a2.5 2.5 0 0 1 2.5 2.5v6a2.5 2.5 0 0 1 -2.5 2.5h-6a2.5 2.5 0 0 1 -2.5 -2.5v-6a2.5 2.5 0 0 1 2.5 -2.5z",
  plus: "M12 5v14M5 12h14",
  check: "M5 12.5l4.5 4.5L19 7.5",
  warn: "M10.3 4.9a2 2 0 0 1 3.4 0l7 12.1a2 2 0 0 1-1.7 3H5a2 2 0 0 1-1.7-3zM11.4 16.9a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0zM12 9.5v4.5",
  back: "M14.5 5.5L8 12l6.5 6.5",
  swap: "M5 8h13.5M15 4.5L18.5 8 15 11.5M19 16H5.5M9 12.5L5.5 16 9 19.5",
  undo: "M9 6.5L4.5 11 9 15.5M4.5 11H15a4.5 4.5 0 0 1 0 9h-2.5",
  key: "M4 15a4 4 0 1 0 8 0a4 4 0 1 0 -8 0zM6.8 15a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0zM11 12l8.5-8.5M15.5 7.5L18 10M13.5 9.5l2 2",
  book: "M12 6.5C10.5 5 8 4.5 4 4.5v13.5c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2V4.5c-4 0-6.5.5-8 2zM12 6.5V20",
  bolt: "M13.5 3L5 13.5h6.5L10.5 21 19 10.5h-6.5z",
  print: "M6 9h12a2 2 0 0 1 2 2v3.5a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-3.5a2 2 0 0 1 2 -2zM7 9V4.5h10V9M8 13.5h8a1 1 0 0 1 1 1v4.5a1 1 0 0 1 -1 1h-8a1 1 0 0 1 -1 -1v-4.5a1 1 0 0 1 1 -1z",
  clip: "M8.5 5h7a2.5 2.5 0 0 1 2.5 2.5v11a2.5 2.5 0 0 1 -2.5 2.5h-7a2.5 2.5 0 0 1 -2.5 -2.5v-11a2.5 2.5 0 0 1 2.5 -2.5zM10.2 3h3.6a1.2 1.2 0 0 1 1.2 1.2v1.1a1.2 1.2 0 0 1 -1.2 1.2h-3.6a1.2 1.2 0 0 1 -1.2 -1.2v-1.1a1.2 1.2 0 0 1 1.2 -1.2zM9 11h6M9 14.5h4",
  x: "M6.5 6.5l11 11M17.5 6.5l-11 11",
  file: "M6.5 3.5h7l5 5v10.5a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2v-13.5a2 2 0 0 1 2-2zM13.5 3.5v5h5",
  share: "M4.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0zM14.5 6.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0zM14.5 17.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0zM9.2 10.8l5.6-3.1M9.2 13.2l5.6 3.1",
  folder: "M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z",
  box: "M4 7.5l8-4 8 4v9l-8 4-8-4zM4 7.5l8 4 8-4M12 11.5v9M8 5.5l8 4",
  chart: "M5.5 11h1.5a1 1 0 0 1 1 1v7a1 1 0 0 1 -1 1h-1.5a1 1 0 0 1 -1 -1v-7a1 1 0 0 1 1 -1zM11.25 5h1.5a1 1 0 0 1 1 1v13a1 1 0 0 1 -1 1h-1.5a1 1 0 0 1 -1 -1v-13a1 1 0 0 1 1 -1zM17 13h1.5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-1.5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1z",
  pause: "M7.5 5.5h1.5a1 1 0 0 1 1 1v11a1 1 0 0 1 -1 1h-1.5a1 1 0 0 1 -1 -1v-11a1 1 0 0 1 1 -1zM15 5.5h1.5a1 1 0 0 1 1 1v11a1 1 0 0 1 -1 1h-1.5a1 1 0 0 1 -1 -1v-11a1 1 0 0 1 1 -1z",
  alarm: "M5 13a7 7 0 1 0 14 0a7 7 0 1 0 -14 0zM12 9.5V13l2.5 2M5 4.5L3 6.5M19 4.5l2 2",
  redo: "M15 6.5l4.5 4.5L15 15.5M19.5 11H9a4.5 4.5 0 0 0 0 9h2.5",
  shield: "M12 3.5l7 2.8v5.2c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6.3zM8.8 12.2l2.2 2.2 4.2-4.4",
  note: "M14 3.5H6.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V10M8.5 13.5h3M8.5 17h6M13 12l1.8-.4 6.2-6.2a1.3 1.3 0 0 0-1.8-1.8L13 9.8z",
  down: "M6 9.5l6 6 6-6",
  up: "M6 14.5l6-6 6 6",
  unlock: "M7.5 10.5h9a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1 -2.5 2.5h-9a2.5 2.5 0 0 1 -2.5 -2.5v-5a2.5 2.5 0 0 1 2.5 -2.5zM8.5 10.5V7.5a3.5 3.5 0 0 1 6.8-1.2",
  mail: "M6 5.5h12a2.5 2.5 0 0 1 2.5 2.5v8a2.5 2.5 0 0 1 -2.5 2.5h-12a2.5 2.5 0 0 1 -2.5 -2.5v-8a2.5 2.5 0 0 1 2.5 -2.5zM4 7.5l8 6 8-6",
  hourglass: "M7 3.5h10M7 20.5h10M8 3.5v3a4 4 0 0 0 8 0v-3M8 20.5v-3a4 4 0 0 1 8 0v3",
  timer: "M5 13.5a7 7 0 1 0 14 0a7 7 0 1 0 -14 0zM12 10.5v3.5M10 3.5h4M12 3.5v3M18.5 7L20 5.5",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  user: "M8.2 8.5a3.8 3.8 0 1 0 7.6 0a3.8 3.8 0 1 0 -7.6 0zM4.5 20a7.5 7.5 0 0 1 15 0",
  users: "M5.7 8.5a3.3 3.3 0 1 0 6.6 0a3.3 3.3 0 1 0 -6.6 0zM3 19.5a6 6 0 0 1 12 0M15.5 5.5a3.3 3.3 0 0 1 0 6.3M17.5 14a6 6 0 0 1 3.5 5.5",
  full: "M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15",
  board: "M5.5 4h13a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-13a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2zM12 16v4.5M8.5 20.5h7",
  db: "M5 6.5c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3zM5 6.5v11c0 1.7 3.1 3 7 3s7-1.3 7-3v-11M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3",
  search: "M4.5 10.5a6 6 0 1 0 12 0a6 6 0 1 0 -12 0zM15 15l5 5",
  flow: "M5.5 3.5h4a1.5 1.5 0 0 1 1.5 1.5v2a1.5 1.5 0 0 1 -1.5 1.5h-4a1.5 1.5 0 0 1 -1.5 -1.5v-2a1.5 1.5 0 0 1 1.5 -1.5zM14.5 15.5h4a1.5 1.5 0 0 1 1.5 1.5v2a1.5 1.5 0 0 1 -1.5 1.5h-4a1.5 1.5 0 0 1 -1.5 -1.5v-2a1.5 1.5 0 0 1 1.5 -1.5zM7.5 8.5V16a2 2 0 0 0 2 2H13",
  camera: "M6 7h12a2.5 2.5 0 0 1 2.5 2.5v7.5a2.5 2.5 0 0 1 -2.5 2.5h-12a2.5 2.5 0 0 1 -2.5 -2.5v-7.5a2.5 2.5 0 0 1 2.5 -2.5zM8.5 7l1.5-2.5h4L15.5 7M8.7 13.2a3.3 3.3 0 1 0 6.6 0a3.3 3.3 0 1 0 -6.6 0z",
  phone: "M9.5 3h5a2.5 2.5 0 0 1 2.5 2.5v13a2.5 2.5 0 0 1 -2.5 2.5h-5a2.5 2.5 0 0 1 -2.5 -2.5v-13a2.5 2.5 0 0 1 2.5 -2.5zM11 17.5h2",
  hand: "M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11.5V5a1.5 1.5 0 0 1 3 0v6.5M14 11.5V6.5a1.5 1.5 0 0 1 3 0V14a6.5 6.5 0 0 1-6.5 6.5h-.3a6 6 0 0 1-4.8-2.4L3.2 14.5a1.5 1.5 0 0 1 2.3-1.9L8 15",
  ticket: "M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4zM14 6v12",
  cap: "M2.5 9.5L12 5l9.5 4.5L12 14zM6.5 11.5V16c3 2.5 8 2.5 11 0v-4.5M21.5 9.5V14",
  sliders: "M4 7h9M17 7h3M4 17h3M11 17h9M13 7a2 2 0 1 0 4 0a2 2 0 1 0 -4 0zM7 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0z",
  menu: "M4 7h16M4 12h16M4 17h16",
  checkbox: "M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1 -3 3h-10a3 3 0 0 1 -3 -3v-10a3 3 0 0 1 3 -3zM8 12.5l3 3 5-6",
  refresh: "M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4",
  upload: "M12 20V9.5M7.5 14L12 9.5 16.5 14M5 4.5h14",
  info: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0zM12 11v5.5M12 7.8v.1",
  link2: "M4 12h16M7.5 8.5L4 12l3.5 3.5M16.5 8.5L20 12l-3.5 3.5",
  rotate: "M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4"
};
/** Status: Farbe UND Form (Kreis, Quadrat, Raute), damit sie auch ohne Farbsehen unterscheidbar sind */
const STATUS = {
  live: '<circle cx="12" cy="12" r="9" fill="none" stroke="#2f8a5b" stroke-width="2" opacity=".4"/><circle cx="12" cy="12" r="5.5" fill="#2f8a5b" stroke="none"/>',
  ended: '<rect x="5" y="5" width="14" height="14" rx="3.5" fill="#c0392b" stroke="none"/>',
  copy: '<path d="M12 3.5l8.5 8.5-8.5 8.5L3.5 12z" fill="#e0a21b" stroke="none"/>',
};
export const LABEL = { eye: 'Ansehen', comment: 'Kommentar', apps: 'Apps', inbox: 'Anfragen', send: 'Schicken', edit: 'Bearbeiten', copy: 'Kopie', trash: 'Löschen',
  lock: 'Gesperrt', unlock: 'Entsperrt', download: 'Herunterladen', jpad: 'JPad', qr: 'QR-Code', pin: 'Station', trophy: 'Beste', play: 'Starten', stop: 'Beenden',
  plus: 'Neu', check: 'Erledigt', warn: 'Achtung', back: 'Zurück', swap: 'Zuordnen', undo: 'Rückgängig', redo: 'Wiederholen', key: 'Schlüssel', book: 'Lernpfad',
  bolt: 'Challenge', print: 'Drucken', clip: 'Kopieren', x: 'Schließen', file: 'Datei', share: 'Teilen', folder: 'Öffnen', box: 'Archiv', chart: 'Statistik',
  pause: 'Pause', alarm: 'Zeit', shield: 'Geschützt', note: 'Notiz', down: 'Aufklappen', up: 'Zuklappen', mail: 'Nachricht', hourglass: 'Warten', timer: 'Zeit',
  link: 'Link', user: 'Person', users: 'Personen', full: 'Vollbild', board: 'Tafel', db: 'Datenbank', search: 'Suchen', flow: 'Flussdiagramm', camera: 'Foto',
  phone: 'Gerät', hand: 'Hallo', ticket: 'Zugang', cap: 'Schule', sliders: 'Einstellungen', menu: 'Menü', checkbox: 'Auswahl', refresh: 'Neu laden', rotate: 'Drehen', upload: 'Hochladen', info: 'Info', link2: 'Zuordnen',
  live: 'läuft', ended: 'beendet', copy_: 'private Kopie' };
/** Icon als SVG-Text; label = Bezeichnung für Screenreader (sonst nur Schmuck) */
export function ic(name, label = '') {
  const inner = STATUS[name] || (PATHS[name] ? `<path d="${PATHS[name]}"/>` : ''); if (!inner) return '';
  return `<svg class="ic ic-${name}" viewBox="0 0 24 24" ${label ? `role="img" aria-label="${String(label).replace(/"/g, '')}"` : 'aria-hidden="true"'}>${inner}</svg>`;
}
/** Emoji → Icon */
export const EMOJI = {
  '⚠': 'warn', '✓': 'check', '✔': 'check', '＋': 'plus', '💬': 'comment', '⇩': 'download', '🗑': 'trash', '✎': 'edit', '✏': 'edit', '🔒': 'lock', '👁': 'eye',
  '▶': 'play', '▦': 'qr', '🧩': 'apps', '🖨': 'print', '📂': 'folder', '📁': 'folder', '☕': 'jpad', '📤': 'send', '✕': 'x', '✗': 'x', '↩': 'undo', '↶': 'undo',
  '🟢': 'live', '🔴': 'ended', '🟡': 'copy_', '📦': 'box', '⇄': 'swap', '📊': 'chart', '⏸': 'pause', '⏰': 'alarm', '↪': 'redo', '↷': 'redo', '📄': 'file',
  '■': 'stop', '🔐': 'shield', '📥': 'inbox', '📝': 'note', '📋': 'clip', '▼': 'down', '▾': 'down', '▲': 'up', '🔓': 'unlock', '🔑': 'key', '📨': 'mail',
  '📘': 'book', '📍': 'pin', '⏳': 'hourglass', '⏱': 'timer', '🔗': 'link', '👤': 'user', '🧑': 'user', '✍': 'edit', '⛶': 'full', '▣': 'board', '🗄': 'db',
  '🔎': 'search', '🔍': 'search', '🔀': 'flow', '📸': 'camera', '📷': 'camera', '📲': 'phone', '👪': 'users', '👥': 'users', '👋': 'hand', '🏆': 'trophy',
  '🎟': 'ticket', '🎓': 'cap', '⚡': 'bolt', '⚙': 'sliders', '☰': 'menu', '☑': 'checkbox', '↻': 'refresh', '↺': 'rotate', '⤒': 'upload', '⤓': 'download', 'ℹ': 'info', '↔': 'link2',
};
STATUS.copy_ = STATUS.copy; delete STATUS.copy;
const RX = new RegExp('(' + Object.keys(EMOJI).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\uFE0F?', 'g');
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'OPTION', 'OPTGROUP', 'SELECT', 'INPUT', 'CODE', 'PRE', 'TITLE', 'NOSCRIPT', 'KBD']);
const skip = el => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { if (SKIP.has(e.tagName) || e.namespaceURI === SVGNS || e.isContentEditable || e.classList.contains('lp') || e.classList.contains('no-ic')) return true; } return false; };
const proto = {};
function svgNode(name, label) {
  const key = name + '|' + label;
  if (!proto[key]) { const t = document.createElement('template'); t.innerHTML = ic(name, label); proto[key] = t.content.firstChild; }
  return proto[key].cloneNode(true);
}
function fixText(t) {
  const s = t.nodeValue; RX.lastIndex = 0; if (!s || !RX.test(s)) return;
  const p = t.parentElement; if (!p || skip(p)) return;
  // nur das Emoji im Element (z. B. Knopf ohne Text): Icon mit Bezeichnung, sonst Schmuck
  const only = p.childNodes.length === 1 && s.replace(RX, '').trim() === '' && !p.getAttribute('aria-label');
  const f = document.createDocumentFragment(); let last = 0; RX.lastIndex = 0; let m;
  while ((m = RX.exec(s))) {
    if (m.index > last) f.appendChild(document.createTextNode(s.slice(last, m.index)));
    const name = EMOJI[m[1]]; f.appendChild(svgNode(name, only ? (p.title || LABEL[name] || '') : ''));
    last = m.index + m[0].length;
  }
  if (last < s.length) f.appendChild(document.createTextNode(s.slice(last)));
  t.replaceWith(f);
}
export function iconify(root = document.body) {
  if (!root) return;
  if (root.nodeType === 3) { fixText(root); return; }
  if (root.nodeType !== 1 || skip(root)) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), L = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) { RX.lastIndex = 0; if (RX.test(n.nodeValue)) L.push(n); }
  L.forEach(fixText);
}
const CSS = '.ic{width:1.2em;height:1.2em;flex:none;display:inline-block;vertical-align:-.22em;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;overflow:visible}'
  + '.ic+.t,.ic+span{margin-left:.15em}button .ic,.btn .ic{vertical-align:-.25em}';
if (typeof document !== 'undefined') {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const start = () => {
    iconify(document.body);
    new MutationObserver(ms => { for (const m of ms) { if (m.type === 'characterData') fixText(m.target); else m.addedNodes.forEach(n => iconify(n)); } })
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  if (document.body) start(); else addEventListener('DOMContentLoaded', start);
}
