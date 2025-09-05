const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.resolve(__dirname, '..', 'data', 'match.json');
const LOGOS_DIR = path.resolve(__dirname, '..', 'assets', 'logos');

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
      const bufs=[]; res.on('data', c=>bufs.push(c)); res.on('end', ()=>resolve(Buffer.concat(bufs)));
    }).on('error', reject);
  });
}

function fetchText(url){
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) return reject(new Error('HTTP '+res.statusCode));
      let d=''; res.setEncoding('utf8'); res.on('data', c=>d+=c); res.on('end', ()=>resolve(d));
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

function slugify(s){
  return (s||'').toString().trim().toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9\-]/g,'');
}

function ensureLogosDir(){
  if (!fs.existsSync(LOGOS_DIR)) fs.mkdirSync(LOGOS_DIR, { recursive: true });
}

function looksLikeUrl(s){ return /^https?:\/\//i.test(s||''); }

async function resolveLogo(value, fallbackName){
  // Priorità:
  // 1) valore è un path/filename nella repo (logos/xxx.* o xxx.*)
  // 2) valore è uno slug → logos/<slug>.webp
  // 3) valore è una URL → scarica in logos/<slug or name>.(png|webp)
  if (!value) return ''; // useremo fallback più avanti
  ensureLogosDir();

  const v = value.replace(/^["']|["']$/g,''); // togli eventuali virgolette
  const fileExt = (p)=> (p.match(/\.(webp|png|jpg|jpeg|svg)$/i)||[])[0];

  // (1) filename/path
  if (fileExt(v)) {
    const p = v.startsWith('logos/') ? v : `logos/${v}`;
    const abs = path.join(LOGOS_DIR, path.basename(p));
    // se il file non esiste nella repo, lasciamo il path così (magari c'è già altrove)
    return `../assets/logos/${path.basename(abs)}`;
  }

  // (2) slug
  if (!looksLikeUrl(v) && !fileExt(v)) {
    const slug = slugify(v);
    return `../assets/logos/${slug}.webp`;
  }

  // (3) URL → download
  if (looksLikeUrl(v)) {
    const slug = slugify(fallbackName || v.split('/').pop().split('?')[0]);
    const ext = '.webp'; // normalizziamo a webp
    const out = path.join(LOGOS_DIR, `${slug}${ext}`);
    try{
      const buf = await dl(v);
      fs.writeFileSync(out, buf);
      return `../assets/logos/${path.basename(out)}`;
    } catch(e){
      console.warn('Logo download failed:', v, e.message);
      return '';
    }
  }

  return '';
}

(async () => {
  const url = csvUrl();
  const csv = await fetchText(url);
  const {recs} = parseCSV(csv);
  if(!recs.length) throw new Error('CSV vuoto');
  const rec = pick(recs);
  if(!rec) throw new Error('nessuna riga valida');

  const homeTeamName = getBy(rec, ['squadra 1','casa','home','home team','petriolese']) || 'Petriolese';
  const awayTeamName = getBy(rec, ['squadra 2','trasferta','away','away team']);

  // nuovi campi logo (come in lineup/fulltime/countdown)
  const homeLogoRaw = getBy(rec, ['homelogo','home_logo','logohome','casalogo','logo casa','logo_home']);
  const awayLogoRaw = getBy(rec, ['awaylogo','away_logo','logoaway','trasfertalogo','logo trasferta','logo_away']);

  const data = {
    homeTeamName,
    awayTeamName,
    competition:   getBy(rec, ['competizione','torneo','league']),
    matchdayLabel: getBy(rec, ['giornata','matchday']),
    dateISO:       getBy(rec, ['data','date']),
    time:          getBy(rec, ['ora','time']),
    venue:         getBy(rec, ['campo','stadio','venue']),
    referee:       getBy(rec, ['arbitro','referee']),
    note:          getBy(rec, ['note']),
    sponsorCsv:    getBy(rec, ['sponsor'])
  };

  // risolvi path logo (locale o da scaricare)
  data.homeLogo = await resolveLogo(homeLogoRaw || 'petriolese', homeTeamName) || '../assets/petriolese.webp';
  const awayFallback = awayTeamName || 'away';
  const awaySlugPath = `../assets/logos/${slugify(awayFallback)}.webp`;
  data.awayLogo = await resolveLogo(awayLogoRaw || awayFallback, awayFallback) || awaySlugPath;

  fs.writeFileSync(OUT, JSON.stringify(data, null, 2), 'utf8');
  console.log('✅ scritto', OUT);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
