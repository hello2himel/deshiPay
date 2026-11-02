const puppeteer = require(process.env.PUPPETEER || '/tmp/video-tools/node_modules/puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = process.env.CHROME || '/home/himel/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const FPS = 30, DUR = 52, TOTAL = FPS * DUR;
const dir = path.resolve(__dirname, 'frames-bn');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--disable-gpu','--allow-file-access-from-files','--hide-scrollbars','--force-device-scale-factor=1','--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto('file://' + path.resolve(__dirname, 'promo-bn.html'), { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 500));
  const start = Date.now();
  for (let f = 0; f < TOTAL; f++) {
    await page.evaluate((t) => window.render(t), f / FPS);
    await page.screenshot({ path: path.join(dir, `f${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 });
    if (f % 60 === 0) {
      const el = (Date.now() - start) / 1000;
      console.log(`frame ${f}/${TOTAL} ${el.toFixed(1)}s`);
    }
  }
  await browser.close();
  console.log('done', ((Date.now() - start) / 1000).toFixed(1) + 's');
})().catch((e) => { console.error(e); process.exit(1); });
