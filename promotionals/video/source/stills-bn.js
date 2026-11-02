const puppeteer = require('/tmp/video-tools/node_modules/puppeteer-core');
const path = require('path');
const CHROME = '/home/himel/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox','--disable-gpu','--allow-file-access-from-files','--hide-scrollbars','--force-device-scale-factor=1'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto('file://' + path.resolve(__dirname, 'promo-bn.html'), { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 400));
  for (const t of process.argv.slice(2).map(Number)) {
    await page.evaluate((t) => window.render(t), t);
    await new Promise(r => setTimeout(r, 40));
    await page.screenshot({ path: path.resolve(__dirname, `still-bn-${t.toFixed(1)}.jpg`), type: 'jpeg', quality: 94 });
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
