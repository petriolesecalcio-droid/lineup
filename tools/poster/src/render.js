const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data', 'match.json');
const TEMPLATE_PATH = path.join(ROOT, 'src', 'template.html');
const DIST = path.join(ROOT, 'dist');

function fill(tpl, data){
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (data[k] ?? ''));
}

async function waitForImagesAndFonts(page){
  // aspetta i font
  try { await page.evaluateHandle('document.fonts && document.fonts.ready'); } catch {}
  // aspetta tutte le immagini
  await page.waitForFunction(() => Array.from(document.images).every(i => i.complete && i.naturalWidth > 0));
}

async function renderOne(browser, htmlPath, out, w, h){
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.goto('file://' + htmlPath, { waitUntil: 'load' });
  await waitForImagesAndFonts(page);
  await page.screenshot({ path: out.replace(/\.webp$/, '.png') });
  await page.screenshot({ path: out, type: 'webp', quality: 90 });
  await page.close();
}

(async () => {
  if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const tpl = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  // A4 2480x3508
  const filledA4 = fill(tpl, data).replace(':root{', ':root{ --W:2480px; --H:3508px;');
  const htmlA4 = path.join(DIST, 'poster.html');
  fs.writeFileSync(htmlA4, filledA4, 'utf8');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--allow-file-access-from-files',
      '--disable-web-security'
    ]
  });

  try{
    await renderOne(browser, htmlA4, path.join(DIST, 'poster-a4-3508x2480.webp'), 2480, 3508);

    // Social 1080x1350
    const social1350 = fill(tpl, data).replace(':root{', ':root{ --W:1080px; --H:1350px;');
    const html1350 = path.join(DIST, 'poster-1080x1350.html');
    fs.writeFileSync(html1350, social1350, 'utf8');
    await renderOne(browser, html1350, path.join(DIST, 'social-1080x1350.webp'), 1080, 1350);

    // Social 1080x1080
    const social1080 = fill(tpl, data).replace(':root{', ':root{ --W:1080px; --H:1080px;');
    const html1080 = path.join(DIST, 'poster-1080x1080.html');
    fs.writeFileSync(html1080, social1080, 'utf8');
    await renderOne(browser, html1080, path.join(DIST, 'social-1080x1080.webp'), 1080, 1080);
  } finally {
    await browser.close();
  }
})().catch(err => { console.error(err); process.exit(1); });
