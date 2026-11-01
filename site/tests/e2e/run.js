/*
 * UI smoke test. Drives the real pages in headless Chrome against a mocked Supabase,
 * walks the whole journey (sign up, onboarding, publish, customer page) and saves screenshots.
 *
 *   npm i --no-save puppeteer-core
 *   CHROME=/path/to/chrome node tests/e2e/run.js
 *
 * Screenshots land in tests/e2e/shots/ (git-ignored).
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const puppeteer = require("puppeteer-core");
const H = require("../helpers.js");

const ROOT = path.join(__dirname, "..", "..");
const SHOTS = path.join(__dirname, "shots");
const PORT = 8899;
const BASE = "http://localhost:" + PORT;
const CHROME = process.env.CHROME || "/usr/bin/google-chrome";
// same load order as the pages: vendored engine bundle, then the site adapter
const Q = H.loadAdapter();
fs.mkdirSync(SHOTS, { recursive: true });

let fails = 0;
const ok = (c, m) => { console.log((c ? "  ok   " : "  FAIL ") + m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// synthetic merchant QR (no real account data); fixture-only TLV + CRC
const body0 = H.encodeTLV([
  ["00", "01"], ["01", "11"],
  ["26", H.encodeTLV([["00", "bd.org.bb.npsb"], ["01", "02"], ["02", "04"], ["03", "01700000000"]], "bytes")],
  ["52", "6016"], ["53", "050"], ["58", "BD"], ["59", "RAHIM TRADERS"], ["60", "Bogra"],
  ["62", H.encodeTLV([["06", "FT"]], "bytes")], ["80", "TOKENA/+=="]
], "bytes") + "6304";
const PAYLOAD = body0 + H.crc16(body0);

async function main() {
  const server = spawn("node", [path.join(ROOT, "scripts/dev-server.js")], { env: Object.assign({}, process.env, { PORT }), stdio: "ignore" });
  await sleep(600);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const errors = [];
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const u = req.url();
      if (u.includes("/vendor/supabase.js")) return req.respond({ status: 200, contentType: "text/javascript", body: fs.readFileSync(path.join(__dirname, "mock-supabase.js"), "utf8") });
      if (u.endsWith("/js/config.js")) return req.respond({ status: 200, contentType: "text/javascript", body: 'window.DESHIQR_CONFIG={supabaseUrl:"https://test.supabase.co",supabaseAnonKey:"test",googleAuth:false};' });
      if (u.includes("fonts.googleapis.com")) return req.respond({ status: 200, contentType: "text/css", body: "" });
      if (u.includes("fonts.gstatic.com")) return req.abort();
      req.continue();
    });
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + ".png"), fullPage: false });
    const shotFull = (n) => page.screenshot({ path: path.join(SHOTS, n + ".png"), fullPage: true });

    console.log("Landing + sign up");
    await page.goto(BASE + "/", { waitUntil: "networkidle0" });
    // The landing page only signs people in; the payload engine is loaded by the
    // dashboard and customer pages, so check it once we are on /app below.
    await shot("01-landing-mobile");
    // make a QR image of the synthetic payload using the app's own renderer
    const b64 = await page.evaluate(async (p) => {
      const blob = await Deshi.qrPng(p, 700);
      return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(",")[1]); fr.readAsDataURL(blob); });
    }, PAYLOAD);
    const qrFile = path.join(SHOTS, "input-qr.png");
    fs.writeFileSync(qrFile, Buffer.from(b64, "base64"));

    await page.type("#email", "owner@example.com");
    await page.type("#pw", "correct-horse-1");
    await page.click("form button[type=submit]");
    await page.waitForFunction(() => location.pathname === "/app", { timeout: 8000 });
    await page.waitForSelector("#f-title");
    ok(true, "signed up and landed on /app");
    const wiring = await page.evaluate(() => ({
      adapter: typeof window.DeshiQR.inspect === "function" && typeof window.DeshiQR.build === "function",
      engine: typeof window.DeshiQR.update === "function" && typeof window.DeshiQR.validate === "function",
    }));
    ok(wiring.engine, "vendored deshiqr engine loaded (update/validate)");
    ok(wiring.adapter, "site payload adapter loaded over the engine (inspect/build)");
    await shot("02-step1-link");

    console.log("Step 1: name and link");
    await page.type("#f-title", "Rahim Traders");
    ok((await page.$eval("#f-user", (e) => e.value)) === "rahim-traders", "username auto-filled from the name");
    await page.waitForFunction(() => document.querySelector("#userStatus").classList.contains("ok"), { timeout: 4000 });
    ok(true, "username availability shows ✓");
    await shot("03-step1-filled");
    await page.click("#primary");

    console.log("Step 2: drop the QR");
    await page.waitForSelector(".drop");
    await shot("04-step2-empty");
    const input = await page.$('input[type=file]:not([capture])');
    await input.uploadFile(qrFile);
    await page.waitForSelector(".qr-ok", { timeout: 15000 });
    ok((await page.$eval(".qr-ok .who b", (e) => e.textContent)) === "RAHIM TRADERS", "QR image decoded, merchant name shown");
    ok((await page.$eval(".qr-ok .pill", (e) => e.textContent)).includes("Checksum"), "checksum verified badge shown");
    await shot("05-step2-ok");
    await page.click("#primary");

    console.log("Step 3: wallet + bank");
    await page.waitForSelector(".add");
    const adds = await page.$$(".add");
    await adds[0].click();
    await page.waitForSelector('[id^="w-"][id$="-n"]');
    await page.type('[id^="w-"][id$="-n"]', "+880 1712-345678");
    const wsel = await page.$('[id^="w-"][id$="-p"]');
    await wsel.select("nagad");
    const adds2 = await page.$$(".add");
    await adds2[1].click();
    await page.waitForSelector('[id^="b-"][id$="-bank"]');
    await page.type('[id^="b-"][id$="-bank"]', "Sonali Bank");
    await page.type('[id^="b-"][id$="-name"]', "Rahim Traders");
    await page.type('[id^="b-"][id$="-number"]', "1234567890123");
    await page.type('[id^="b-"][id$="-branch"]', "Bogra");
    await page.type('[id^="b-"][id$="-routing"]', "123456789");
    await shotFull("06-step3-full");
    await page.click("#primary");

    console.log("Step 4: theme and publish");
    await page.waitForSelector(".themes");
    await page.click('.swatch[aria-label="Coffee"]');
    ok((await page.$eval(".pv", (e) => e.getAttribute("data-theme"))) === "coffee", "preview switched to the coffee theme");
    await shot("07-step4-look");
    await page.click("#primary");
    await page.waitForSelector(".live-banner", { timeout: 8000 });
    ok(true, "published, share tab with live banner");
    await shotFull("08-share");

    console.log("Customer page (mobile)");
    await page.goto(BASE + "/rahim-traders", { waitUntil: "networkidle0" });
    await page.waitForSelector(".pv h1");
    ok((await page.$eval(".pv h1", (e) => e.textContent)) === "Rahim Traders", "customer page shows the title");
    ok((await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "coffee", "customer page uses the chosen theme");
    await shot("09-pay-empty");
    await page.type(".amt-input", "১২৫০");
    ok((await page.$eval(".amt-input", (e) => e.value)) === "1250", "Bangla digits typed in the amount are converted");
    await page.waitForSelector(".qrbox svg");
    await sleep(900);
    await shotFull("10-pay-qr");

    // decode the QR that is actually on screen and check the payload end to end
    await page.addScriptTag({ path: path.join(ROOT, "public/vendor/jsQR.js") });
    const decoded = await page.evaluate(async () => {
      const svg = document.querySelector(".qrbox svg");
      const xml = new XMLSerializer().serializeToString(svg);
      const img = new Image();
      await new Promise((r) => { img.onload = r; img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml); });
      const c = document.createElement("canvas"); c.width = c.height = 800;
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 800, 800); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, 800, 800);
      const d = g.getImageData(0, 0, 800, 800);
      const r = jsQR(d.data, 800, 800);
      return r ? r.data : null;
    });
    ok(!!decoded, "the QR on screen can be scanned");
    const rr = decoded ? Q.inspect(decoded) : { ok: false };
    ok(rr.ok && rr.srcAmount === 1250 && rr.name === "RAHIM TRADERS", "scanned payload: checksum valid, amount ৳1250, same merchant");
    ok(decoded && H.parseTLV(decoded, "bytes").find((x) => x[0] === "80")[1] === "TOKENA/+==", "bank token (tag 80) carried over untouched");

    console.log("Wallet and bank tabs");
    const tabs = await page.$$(".pv-methods button");
    ok(tabs.length === 3, "three payment methods offered");
    await tabs[1].click();
    await page.waitForSelector(".copyrow");
    ok((await page.$eval(".copyrow .v", (e) => e.textContent)) === "01712 345678", "wallet number normalised from +880 format");
    await shotFull("11-pay-wallet");
    const tabs2 = await page.$$(".pv-methods button");
    await tabs2[2].click();
    await page.waitForSelector(".item-foot");
    await shotFull("12-pay-bank");

    console.log("Fixed-amount link");
    await page.goto(BASE + "/rahim-traders?amount=500", { waitUntil: "networkidle0" });
    await page.waitForSelector(".qrbox svg");
    ok((await page.$eval(".amt-input", (e) => e.readOnly)) === true, "amount locked with ?amount=500");

    console.log("Not found + dark mode + desktop");
    await page.goto(BASE + "/nobody-here", { waitUntil: "networkidle0" });
    await page.waitForSelector(".pv-state h1");
    ok((await page.$eval(".pv-state h1", (e) => e.textContent)).includes("doesn’t exist"), "unknown username shows a friendly not-found");
    await page.goto(BASE + "/rahim-traders", { waitUntil: "networkidle0" });
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
    await page.type(".amt-input", "500");
    await sleep(900);
    await shotFull("13-pay-dark");
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
    await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
    await page.goto(BASE + "/rahim-traders", { waitUntil: "networkidle0" });
    await page.type(".amt-input", "500");
    await sleep(900);
    await shot("14-pay-desktop");
    await page.goto(BASE + "/", { waitUntil: "networkidle0" });
    await shot("15-landing-desktop");
    await page.goto(BASE + "/app", { waitUntil: "networkidle0" });
    await page.waitForSelector(".tabs");
    await shot("16-dashboard-desktop");

    console.log("Sign out and wrong password");
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(BASE + "/app", { waitUntil: "networkidle0" });
    await page.waitForSelector(".top-actions button");
    await page.click(".top-actions button");
    await page.waitForFunction(() => location.pathname === "/", { timeout: 5000 });
    await page.goto(BASE + "/?mode=signin", { waitUntil: "networkidle0" });
    await page.type("#email", "owner@example.com");
    await page.type("#pw", "wrong-password");
    await page.click("form button[type=submit]");
    await page.waitForFunction(() => document.querySelector(".form-msg.bad"), { timeout: 4000 });
    ok((await page.$eval(".form-msg.bad", (e) => e.textContent)).includes("don’t match"), "wrong password shows a friendly message");
  } catch (e) {
    console.error("  FAIL exception: " + e.message);
    fails++;
  } finally {
    await browser.close();
    server.kill();
  }
  const real = errors.filter((e) => !/fonts\.gstatic|ERR_FAILED|net::/i.test(e));
  ok(real.length === 0, "no console or page errors" + (real.length ? "\n         " + real.join("\n         ") : ""));
  console.log(fails ? "\n" + fails + " check(s) FAILED" : "\nAll UI checks passed");
  process.exit(fails ? 1 : 0);
}
main();
