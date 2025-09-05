// Legge la tab "Meta" (CSV) e genera data/match.json per il poster.
// Supporta due layout:
//  A) Header orizzontale (una riga con intestazioni, poi i valori)
//  B) Tabella Key/Value come nello screenshot (chiave in col A, valore in col B)

const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.resolve(__dirname, '..', 'data', 'match.json');

function csvUrl(){
  const u = process.env.SHEET_CSV_URL;
  if (u && u.startsWith('http')) return u;
  const id = process.env.SHEET_ID, gid = process.env.SHEET_GID;
  if (id && gid) return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  throw new Error('Imposta SHEET_CSV_URL oppure SHEET_ID+SHEET_GID');
}

function fetchText(url){
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) return reject(new Error('HTTP '+res.statusCode));
      let d=''; res.setEncoding('utf8'); res.on('data', c=>d+=c); res.on('end', ()=>resolve(d));
    }).on('error', reject);
  });
}

function parseCSV(text){
  // CSV semplice (senza virgolette annidate). Se servisse, si può sostituire con una lib.
  const rows = text.split(/\r?\n/).filter(r => r.trim().length);
  const cells = rows.map(r => r.split(',').map(c => c.trim()));
  return cells;
}

function toHeaderRecord(cells){
  // Layout A: header orizzontale
  const headers = (cells[0] || []).map(h => (h||'').trim());
  const records = cells.slice(1).map(cols => {
    const o = {};
    headers.forEach((h,i) => o[h] = (cols[i] ?? '').trim());
    return o;
  });
  return { headers, records };
}

function toKeyValueObject(cells){
  // Layout B: Key / Value
  // prende l'ultima occorrenza non vuota per ogni chiave
  const obj = {};
  for (const row of cells){
    const k = (row[0] || '').trim();
    const v = (row[1] || '').trim();
    if (!k) continue;
    if (v !== '') obj[k] = v;
  }
  return obj;
}

function pickLastNonEmptyRecord(records){
  for (let i = records.length - 1; i >= 0; i--){
    const r = records[i];
    if (Object.values(r).some(v => (v||'').trim().length)) return r;
  }
  return null;
}

function getBy(obj, names){
  // obj può essere un record (layout A) oppure l'oggetto key/value (layout B)
  const keys = Object.keys(obj);
  for (const k of keys){
    const low = k.toLowerCase();
    if (names.some(n => low === n || low.includes(n))) return (obj[k] || '').toString().trim();
  }
  return '';
}

function slugify(s){
  return (s||'').toString().trim().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '');
}

(async () => {
  const url = csvUrl();
  console.log('[meta] CSV:', url);
  const csv = await fetchText(url);
  const cells = parseCSV(csv);

  let record = null;

  if (cells.length && cells[0].length >= 2 && /^key$/i.test(cells[0][0]) && /^value$/i.test(cells[0][1])) {
    // Layout B: Key/Value con header esplicito
    const obj = toKeyValueObject(cells.slice(1));
    record = obj;
  } else if (cells.length && cells[0].length === 2 && !cells[0][0].includes(',')) {
    // Layout B (senza header "Key/Value"): assumiamo col A=chiave, col B=valore
    const obj = toKeyValueObject(cells);
    record = obj;
  } else {
    // Layout A: header orizzontale
    const { records } = toHeaderRecord(cells);
    record = pickLastNonEmptyRecord(records) || {};
  }

  // Estrazione campi (sinonimi minimi aderenti al tuo Meta)
  const homeTeamName = getBy(record, ['squadra1','casa','home','petriolese']) || 'Petriolese';
  const awayTeamName = getBy(record, ['squadra2','trasferta','away']);
  const competition  = getBy(record, ['competizione','torneo','league']);
  const matchday     = getBy(record, ['giornata','matchday']);
  const dateISO      = getBy(record, ['data','date']); // lo prendiamo tal quale (stringa)
  const time         = getBy(record, ['ora','time']);
  const venue        = getBy(record, ['luogo','campo','stadio','impianto','venue']);
  const referee      = getBy(record, ['arbitro','referee']);
  const note         = getBy(record, ['note']);
  const sponsorCsv   = getBy(record, ['sponsor']); // es. "bar-rossi.webp|forno-sara.png"

  // Loghi: stessa logica lineup/fulltime/countdown → slug nel repo
  const homeSlug = slugify(homeTeamName);
  const awaySlug = slugify(awayTeamName);
  const homeLogo = `../assets/logos/${homeSlug}.webp`;
  const awayLogo = `../assets/logos/${awaySlug}.webp`;

  const data = {
    homeTeamName,
    awayTeamName,
    competition,
    matchdayLabel: matchday,
    dateISO,
    time,
    venue,
    referee,
    note,
    sponsorCsv,
    homeLogo,
    awayLogo
  };

  // crea cartella data/ e scrive il JSON
  const dataDir = path.resolve(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data, null, 2), 'utf8');
  console.log('✅ scritto', OUT, '\n', data);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
