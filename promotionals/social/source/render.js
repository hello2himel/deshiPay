const puppeteer = require(process.env.PUPPETEER || '/tmp/video-tools/node_modules/puppeteer-core');
const path = require('path');
const CHROME = process.env.CHROME || '/home/himel/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--disable-gpu','--allow-file-access-from-files','--hide-scrollbars','--force-device-scale-factor=1'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });
  await page.goto('file://' + path.resolve(__dirname, 'social.html'), { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.socialReady || true);
  await new Promise(r => setTimeout(r, 450));
  for (let i = 1; i <= 6; i++) {
    await page.evaluate((n) => window.showSlide(n), i);
    await new Promise(r => setTimeout(r, 180));
    await page.screenshot({ path: path.resolve(__dirname, `slide-${i}.png`), type: 'png' });
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
