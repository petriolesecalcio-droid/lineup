
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data', 'match.json');
const TEMPLATE_PATH = path.join(ROOT, 'src', 'template.html');
const DIST = path.join(ROOT, 'dist');
const SP_DIR = path.join(ROOT, 'assets', 'sponsor');

function slugify(s){
  return (s||'').toString().trim().toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9\-]/g,'');
}

function listSponsors(orderCsv){
  // Allowed extensions
  const exts = new Set(['.webp','.png','.jpg','.jpeg','.svg']);
  if (!fs.existsSync(SP_DIR)) return [];
  const all = fs.readdirSync(SP_DIR).filter(f => exts.has(path.extname(f).toLowerCase()));
  if (orderCsv && orderCsv.trim().length){
    const wanted = orderCsv.split('|').map(s=>s.trim()).filter(Boolean);
    const ordered = wanted.filter(w => all.includes(w));
    // append remaining files not listed, alphabetically
    const remaining = all.filter(a => !ordered.includes(a)).sort();
    return [...ordered, ...remaining];
  }
  return all.sort();
}

function fill(tpl, data){
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (data[k] ?? ''));
}

async function renderOne(browser, htmlPath, out, w, h){
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.goto('file://' + htmlPath, { waitUntil: 'load' });
  await page.screenshot({ path: out.replace(/\.webp$/, '.png') });
  await page.screenshot({ path: out, type: 'webp', quality: 90 });
  await page.close();
}

(async () => {
  if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

 // data.awaySlug = slugify(data.awayTeamName || '');

  // Sponsor list
  const sponsors = listSponsors(data.sponsorCsv || '');
  const sponsorHtml = sponsors.map(fn => `<div class="s-item"><img src="../assets/sponsor/${fn}" alt=""></div>`).join('');
  data.SPONSOR_GRID = sponsorHtml;

  const tpl = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const filled = fill(tpl, data);
  const htmlA4 = path.join(DIST, 'poster.html');
  fs.writeFileSync(htmlA4, filled, 'utf8');

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  try{
    await renderOne(browser, htmlA4, path.join(DIST, 'poster-a4-3508x2480.webp'), 2480, 3508);

    const p1350 = filled.replace(':root{', ':root{ --W:1080px; --H:1350px;');
    const p1350Path = path.join(DIST, 'poster-1080x1350.html');
    fs.writeFileSync(p1350Path, p1350, 'utf8');
    await renderOne(browser, p1350Path, path.join(DIST, 'social-1080x1350.webp'), 1080, 1350);

    const p1080 = filled.replace(':root{', ':root{ --W:1080px; --H:1080px;');
    const p1080Path = path.join(DIST, 'poster-1080x1080.html');
    fs.writeFileSync(p1080Path, p1080, 'utf8');
    await renderOne(browser, p1080Path, path.join(DIST, 'social-1080x1080.webp'), 1080, 1080);
  } finally {
    await browser.close();
  }
})().catch(err => { console.error(err); process.exit(1); });
