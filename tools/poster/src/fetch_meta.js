
// Legge la tab "Meta" (CSV) e genera data/match.json
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
function dl(url){
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) return reject(new Error('HTTP '+res.statusCode));
      let d=''; res.setEncoding('utf8');
      res.on('data', c => d+=c); res.on('end', ()=>resolve(d));
    }).on('error', reject);
  });
}
function parseCSV(t){
  const rows = t.split(/\r?\n/).filter(r=>r.trim());
  const head = rows.shift().split(',').map(h=>h.trim());
  const recs = rows.map(r => {
    const cols = r.split(',').map(c=>c.trim());
    const o={}; head.forEach((h,i)=>o[h]=cols[i]??''); return o;
  });
  return {head,recs};
}
function pick(recs){
  const m = process.env.MATCH_INDEX;
  if (m && !isNaN(parseInt(m,10))) {
    const i = parseInt(m,10);
    if (i>=0 && i<recs.length) return recs[i];
  }
  for(let i=recs.length-1;i>=0;i--){
    const r = recs[i];
    if (Object.values(r).some(v => (v||'').trim().length)) return r;
  }
  return null;
}
function getBy(rec, names){
  for (const k of Object.keys(rec)){
    const low = k.toLowerCase();
    if (names.some(n => low===n || low.includes(n))) return (rec[k]||'').trim();
  }
  return '';
}

(async () => {
  const url = csvUrl();
  console.log('CSV:', url);
  const csv = await dl(url);
  const {recs} = parseCSV(csv);
  if(!recs.length) throw new Error('CSV vuoto');
  const rec = pick(recs);
  if(!rec) throw new Error('nessuna riga valida');

  const data = {
    homeTeamName: getBy(rec, ['squadra 1','casa','home','home team','petriolese']) || 'Petriolese',
    awayTeamName: getBy(rec, ['squadra 2','trasferta','away','away team']),
    competition:  getBy(rec, ['competizione','torneo','league']),
    matchdayLabel:getBy(rec, ['giornata','matchday']),
    dateISO:      getBy(rec, ['data','date']),
    time:         getBy(rec, ['ora','time']),
    venue:        getBy(rec, ['campo','stadio','venue']),
    referee:      getBy(rec, ['arbitro','referee']),
    note:         getBy(rec, ['note']),
    sponsorCsv:   getBy(rec, ['sponsor']) // opzionale: "logo1.webp|logo2.png"
  };

  fs.writeFileSync(OUT, JSON.stringify(data, null, 2), 'utf8');
  console.log('✅ scritto', OUT);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
