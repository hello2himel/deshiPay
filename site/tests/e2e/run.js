/*
 * UI smoke test. Drives the real pages in headless Chrome against a mocked
 * Supabase and runs THREE scenarios:
 *
 *   1. ONLINE  — the original journey: landing, sign up, onboarding, publish,
 *                the Share tab (including the new HTML download), the customer
 *                page (one health probe per load), and scanning the QR it draws.
 *   2. OFFLINE — a paused/unreachable backend: landing "Create my page" CTA,
 *                the auth-free local wizard, the Download step, the downloaded
 *                standalone HTML opened from file:// (title, theme, amount -> QR
 *                scanned, ?amount= lock, no network but the fonts), and a live
 *                payment page showing "Temporarily unavailable" with Try again.
 *   3. RECOVERY — a live payment page opened while the backend is down, then the
 *                backend comes back and Try again renders the customer page.
 *
 * The Supabase client is mocked (tests/e2e/mock-supabase.js); config.js is
 * stubbed. The online scenario answers the backend health probe with 200; the
 * offline scenarios abort every request to the Supabase host (state.down), which
 * is what the site sees when a free-tier project is paused or the network is down.
 *
 * Setup (once, outside the repo — do not add puppeteer-core to the repo):
 *
 *   mkdir -p /tmp/deshiqr-e2e && cd /tmp/deshiqr-e2e
 *   npm i --no-save puppeteer-core
 *
 * Run from the repo root:
 *
 *   NODE_PATH=/tmp/deshiqr-e2e/node_modules \
 *   CHROME=/home/himel/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome \
 *   node site/tests/e2e/run.js
 *
 * (If you installed puppeteer-core in the repo with `npm i --no-save
 * puppeteer-core`, omit NODE_PATH and just run `CHROME=... node
 * site/tests/e2e/run.js`.)
 *
 * Screenshots and the captured standalone.html land in tests/e2e/shots/
 * (git-ignored).
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const puppeteer = require("puppeteer-core");
const H = require("../helpers.js");

const ROOT = path.join(__dirname, "..", "..");
const SHOTS = path.join(__dirname, "shots");
const PORT = 8899;
const BASE = "http://localhost:" + PORT;
const CHROME = process.env.CHROME || "/usr/bin/google-chrome";
const MOCK_SUPABASE = fs.readFileSync(path.join(__dirname, "mock-supabase.js"), "utf8");
const CONFIG_STUB =
  'window.DESHIQR_CONFIG={supabaseUrl:"https://test.supabase.co",supabaseAnonKey:"test",googleAuth:false};';
// same load order as the pages: vendored engine bundle, then the site adapter
const Q = H.loadAdapter();
fs.mkdirSync(SHOTS, { recursive: true });

let fails = 0;
let checks = 0;
const ok = (c, m) => {
  checks++;
  console.log((c ? "  ok   " : "  FAIL ") + m);
  if (!c) fails++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- synthetic merchant QR (no real account data) ---------------- */
// fixture-only TLV + CRC
const body0 = H.encodeTLV([
  ["00", "01"], ["01", "11"],
  ["26", H.encodeTLV([["00", "bd.org.bb.npsb"], ["01", "02"], ["02", "04"], ["03", "01700000000"]], "bytes")],
  ["52", "6016"], ["53", "050"], ["58", "BD"], ["59", "RAHIM TRADERS"], ["60", "Bogra"],
  ["62", H.encodeTLV([["06", "FT"]], "bytes")], ["80", "TOKENA/+=="]
], "bytes") + "6304";
const PAYLOAD = body0 + H.crc16(body0);

/* ---------------- shared page plumbing ---------------- */

// One page per scenario, in its own (incognito) browser context so the scenarios
// never share localStorage (mock session, local draft, ...). state.down starts as
// the scenario asks; flipping it mid-scenario lets the RECOVERY scenario bring the
// mocked backend back up behind the payment page's "Try again" button.
async function newScenarioPage(browser, offline) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const state = { down: !!offline, supa: [], health: 0, errors: [] };
  await page.setRequestInterception(true);
  page.on("request", (req) => serve(req, state));
  page.on("pageerror", (e) => state.errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") state.errors.push("console: " + m.text());
  });
  return { ctx, page, state };
}

function serve(req, state) {
  const u = req.url();
  if (u.startsWith("file:")) return req.continue();
  if (u.includes("/vendor/supabase.js")) {
    return req.respond({ status: 200, contentType: "text/javascript; charset=utf-8", body: MOCK_SUPABASE });
  }
  if (u.split("?")[0].endsWith("/js/config.js")) {
    return req.respond({ status: 200, contentType: "text/javascript; charset=utf-8", body: CONFIG_STUB });
  }
  if (u.includes("fonts.googleapis.com")) {
    return req.respond({ status: 200, contentType: "text/css; charset=utf-8", body: "" });
  }
  if (u.includes("fonts.gstatic.com")) return req.abort();
  if (u.includes("supabase.co")) {
    state.supa.push(u);
    // Down: abort the probe (and the fallback), like a paused project or a dead
    // network. Up: answer the auth health endpoint as a simple, CORS-readable
    // request (no custom headers, so no preflight).
    if (state.down) return req.abort();
    const clean = u.split("?")[0];
    if (clean.endsWith("/auth/v1/health") || /\/rest\/v1\/?$/.test(clean)) {
      state.health++;
      return req.respond({
        status: 200,
        contentType: "text/plain; charset=utf-8",
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "apikey, authorization, content-type"
        },
        body: "{}"
      });
    }
    return req.abort();
  }
  req.continue();
}

const isProbe = (u) => /\/auth\/v1\/health$/.test(u.split("?")[0]) || /\/rest\/v1\/?$/.test(u.split("?")[0]);

function noErrors(state, label) {
  const real = state.errors.filter((e) => !/fonts\.gstatic|ERR_FAILED|net::/i.test(e));
  ok(real.length === 0, label + ": no console or page errors" + (real.length ? "\n         " + real.join("\n         ") : ""));
}

// Capture the download without touching product code: remember every Blob
// handed to URL.createObjectURL and swallow the synthetic anchor download.
async function armCapture(page) {
  await page.evaluate(() => {
    window.__blobs = [];
    window.__downloadName = "";
    const makeObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (blob) {
      window.__blobs.push(blob);
      return makeObjectURL(blob);
    };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) {
        window.__downloadName = this.download;
        return;
      }
      return click.call(this);
    };
    try {
      Object.defineProperty(navigator, "canShare", { configurable: true, value: function () { return false; } });
    } catch (e) { /* canShare is optional */ }
  });
}

async function readCapture(page) {
  await page.waitForFunction(() => window.__blobs && window.__blobs.length > 0, { timeout: 20000 });
  return page.evaluate(async () => {
    const blob = window.__blobs[window.__blobs.length - 1];
    return { html: await blob.text(), size: blob.size, filename: window.__downloadName };
  });
}

// Wait until the wizard action is actually enabled, then advance. Prevents
// clicking while a previous step's async work still holds the bar disabled.
async function clickPrimary(page) {
  await page.waitForFunction(() => {
    const b = document.querySelector("#primary");
    return b && !b.disabled;
  }, { timeout: 15000 });
  await clickPrimary(page);
}

// The QR drawn by PayView is an SVG; rasterise it and scan it with jsQR.
async function decodeOnScreenQr(page) {
  await page.addScriptTag({ path: path.join(ROOT, "public", "vendor", "jsQR.js") });
  return page.evaluate(async () => {
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
}

/* ================= online journey (the original smoke test) ================= */

async function scenarioOnline(browser) {
  console.log("\n=== Scenario 1: online (backend healthy) ===");
  const { ctx, page, state } = await newScenarioPage(browser, false);
  try {
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + ".png"), fullPage: false });
    const shotFull = (n) => page.screenshot({ path: path.join(SHOTS, n + ".png"), fullPage: true });

    console.log("Landing + sign up");
    await page.goto(BASE + "/", { waitUntil: "networkidle0" });
    await page.waitForSelector(".hero-cta[href='/login']", { timeout: 10000 });
    ok((await page.title()).includes("DeshiPay"), "the landing page title is DeshiPay");
    ok((await page.$eval(".brand", (e) => e.textContent.trim())) === "DeshiPay", "the header brand is DeshiPay");
    const heroFill = await page.evaluate(() => ({
      nav: document.querySelector(".top").getBoundingClientRect().height,
      hero: document.querySelector(".hero-top").getBoundingClientRect().height,
      viewport: window.innerHeight,
    }));
    ok(heroFill.hero >= heroFill.viewport - Math.ceil(heroFill.nav), "the hero fills at least the viewport below the nav");
    ok((await page.$("#email")) === null, "landing has no login form — just the create-page CTA");
    ok(!!(await page.$(".hero-cta[href='/login'] .ic")), "the hero CTA is a button with an arrow icon");
    ok(
      (await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "emerald",
      "the site uses the green default theme"
    );
    const landingAccent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--accent").trim().toUpperCase()
    );
    ok(landingAccent === "#056B4E", "the default accent is the chosen green (got " + landingAccent + ")");

    ok(state.health === 0, "the landing itself makes no backend probe");
    const onlineLandingText = await page.evaluate(() => document.body.innerText);
    ok(
      onlineLandingText.includes("Everything you need to get paid") && onlineLandingText.includes("Questions people ask"),
      "online landing has the address line plus the features and FAQ sections"
    );
    ok(
      onlineLandingText.includes("payments, donations and support") && onlineLandingText.includes("bank details"),
      "landing positions DeshiPay as a complete way to receive money (QR + wallet + bank), not just a QR tool"
    );
    ok(!onlineLandingText.includes("Take it with you") && !onlineLandingText.includes("your-site.com"), "online landing has no offline-only copy");
    ok((await page.$$eval(".top-links", (els) => els.length)) === 0, "the top bar has no section links, only the actions");
    ok(!!(await page.$(".top-actions a[href='/login']")), "the top nav offers a create-page action");
    ok(!!(await page.$(".top-actions a[href='/login?mode=signin']")), "the top nav offers a sign-in action");
    ok((await page.$eval(".nav-btn", (e) => getComputedStyle(e).display)) === "flex", "mobile shows a hamburger menu button");
    ok(!!(await page.$('.top-actions a[href="/deshipay"]')), "the nav offers Donate to DeshiPay");
    ok(!!(await page.$('.site-foot a[href="/deshipay"]')), "the site footer offers Donate to DeshiPay");
    ok((await page.$eval(".top-menu", (e) => getComputedStyle(e).display)) === "none", "the mobile nav menu starts collapsed");
    await page.click(".nav-btn");
    ok((await page.$eval(".top", (e) => e.classList.contains("open"))) === true, "the hamburger opens the nav menu");
    ok((await page.$eval(".nav-btn", (e) => e.getAttribute("aria-expanded"))) === "true", "the hamburger reports its expanded state");
    ok((await page.$eval(".top-menu", (e) => getComputedStyle(e).display)) === "flex", "the open menu shows the nav elements");
    await page.keyboard.press("Escape");
    ok((await page.$eval(".top-menu", (e) => getComputedStyle(e).display)) === "none", "Escape closes the nav menu");

    // Theme toggle lives in the nav (inside the hamburger on mobile).
    const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.click(".nav-btn");
    await page.click(".theme-toggle");
    ok((await page.evaluate(() => document.documentElement.getAttribute("data-mode"))) === "dark", "the nav theme toggle switches to dark");
    const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok(darkBg !== lightBg, "the dark choice changes the page colours");
    ok((await page.evaluate(() => localStorage.getItem("deshipay.mode"))) === "dark", "the theme choice is remembered");
    await page.click(".nav-btn");
    await page.click(".theme-toggle");
    ok((await page.evaluate(() => document.documentElement.getAttribute("data-mode"))) === "light", "the nav theme toggle switches back to light");
    ok((await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === lightBg, "the light choice restores the light colours");
    // Regression: explicit light must beat a dark OS preference inside nested theme scopes
    // (the PayView demo sets its own data-theme, which used to stay dark).
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
    await page.evaluate(() => { localStorage.setItem("deshipay.mode", "light"); document.documentElement.setAttribute("data-mode", "light"); });
    const demoBg = await page.$eval(".demo .pv", (e) => getComputedStyle(e).backgroundColor);
    ok(demoBg === "rgb(230, 240, 237)", "explicit light mode keeps the demo card light when the OS is dark");
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
    // follow the system preference again for the rest of the suite (dark-mode tests)
    await page.evaluate(() => { localStorage.removeItem("deshipay.mode"); document.documentElement.removeAttribute("data-mode"); });

    // The landing demo is the real customer page (PayView), not a static mock.
    ok((await page.$$eval(".demo .pv", (els) => els.length)) === 1, "landing shows the live payment demo (real customer page)");
    ok((await page.$eval(".demo .amt-input", (e) => e.value)) === "1500", "the live demo starts at ৳1,500");
    await page.waitForSelector(".demo .qrbox svg", { timeout: 5000 });
    ok(true, "the live demo draws its real amount-bearing QR");
    const demoChips = await page.$$(".demo .chip");
    if (demoChips[1]) await demoChips[1].click();
    ok((await page.$eval(".demo .amt-input", (e) => e.value)) === "500", "the live demo’s quick amounts update the amount");
    ok((await page.$$eval(".demo .pv-methods button", (els) => els.length)) === 3, "the live demo has QR, Wallet and Bank methods");
    ok((await page.$$eval(".demo .pv-help", (els) => els.filter((el) => getComputedStyle(el).display !== "none").length)) === 0, "the homepage demo leaves out the “How to pay” block");
    ok((await page.$$eval(".demo .pv-foot", (els) => els.length)) === 0, "the homepage demo leaves out the page footer");
    ok(
      (await page.$$eval(".demo .slip-actions", (els) => els.filter((el) => getComputedStyle(el).display !== "none").length)) === 0,
      "the homepage demo leaves out the Save QR image button"
    );
    ok(
      (await page.$$eval(".demo .slip-help", (els) => els.filter((el) => getComputedStyle(el).display !== "none").length)) === 1,
      "the homepage demo keeps the paying-from-this-phone note"
    );
    const demoMethods = await page.$$(".demo .pv-methods button");
    await demoMethods[1].click();
    await page.waitForSelector(".demo .copyrow", { timeout: 5000 });
    ok(true, "the demo’s Wallet method renders the customer copy rows");
    await shot("01-landing-mobile");

    console.log("Footer and legal pages");
    const footLinks = await page.$$eval(".site-foot a", (els) => els.map((e) => e.getAttribute("href")));
    ok(
      footLinks.includes("/terms") && footLinks.includes("/privacy") && footLinks.includes("/contact"),
      "the landing footer links to terms, privacy and contact"
    );
    ok(
      (await page.$eval(".foot-brand", (e) => e.innerText)).includes("Not a payment processor"),
      "the footer clearly says DeshiPay is not a payment processor"
    );
    const abuseLinks = await page.$$eval(".site-foot a[href^='mailto:']", (els) => els.map((e) => e.getAttribute("href")));
    ok(
      abuseLinks.some((h) => h.includes("stargzr.science@gmail.com") && decodeURIComponent(h).toLowerCase().includes("report abuse")),
      "the landing footer has a report-abuse email link"
    );
    for (const [path, heading] of [
      ["/terms", "Terms of service"],
      ["/privacy", "Privacy policy"],
      ["/contact", "Contact & FAQ"],
    ]) {
      await page.goto(BASE + path, { waitUntil: "networkidle0" });
      await page.waitForSelector(".legal h1", { timeout: 10000 });
      ok((await page.$eval(".legal h1", (e) => e.textContent)) === heading, path + " serves its own page");
      ok(!!(await page.$(".site-foot")), path + " has the site footer");
      ok((await page.$eval(".legal", (e) => e.innerText)).includes("stargzr.science@gmail.com"), path + " uses the new contact email");
    }
    await page.goto(BASE + "/", { waitUntil: "networkidle0" });
    await page.waitForSelector(".hero-cta[href='/login']", { timeout: 10000 });

    // make a QR image of the synthetic payload using the app's own renderer
    const b64 = await page.evaluate(async (p) => {
      const blob = await Deshi.qrPng(p, 700);
      return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(",")[1]); fr.readAsDataURL(blob); });
    }, PAYLOAD);
    const qrFile = path.join(SHOTS, "input-qr.png");
    fs.writeFileSync(qrFile, Buffer.from(b64, "base64"));

    // The sign-in/sign-up form lives on its own page now.
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click(".hero-cta[href='/login']")]);
    await page.waitForSelector("#email", { timeout: 10000 });
    ok(state.health > 0, "login page probes /auth/v1/health before showing sign-in");
    ok(!!(await page.$(".no-login a[href='/app?local=1']")), "login page offers a no-login create option");
    ok((await page.$$eval(".auth form", (els) => els.length)) === 1, "login and sign up are one form");
    ok((await page.$eval(".auth form button[type=submit]", (e) => e.textContent.trim())) === "Continue", "the single form uses a Continue button");
    ok((await page.$eval(".auth h2", (e) => e.textContent)) === "Create your page", "the unified card says Create your page");
    ok(
      (await page.$$eval(".auth-links button", (els) => els.some((b) => /I already have an account|New here/.test(b.textContent)))) === false,
      "there is no separate sign-in/sign-up toggle"
    );
    const noLoginStyle = await page.$eval(".no-login a[href='/app?local=1']", (e) => {
      const cs = getComputedStyle(e);
      return { borderStyle: cs.borderStyle, borderColor: cs.borderColor };
    });
    ok(noLoginStyle.borderStyle === "dashed", "the no-login option is a dashed button");
    ok(noLoginStyle.borderColor.replace(/ /g, "") === "rgb(5,107,78)", "the no-login button uses the brand green border");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }),
      page.click(".no-login a[href='/app?local=1']"),
    ]);
    await page.waitForSelector("#f-title", { timeout: 10000 });
    ok((await page.$eval(".progress .count", (e) => e.textContent)).includes("Step 1 of 5 · Name"), "the no-login option starts the same offline wizard");
    ok((await page.$("#f-user")) === null, "the no-login flow asks for no username/link");
    ok((await page.$eval("#topActions .user-chip", (e) => e.textContent)).trim() === "No account", "the no-login dashboard is labelled No account");
    await page.goto(BASE + "/login", { waitUntil: "networkidle0" });
    await page.waitForSelector("#email", { timeout: 10000 });
    await page.type("#email", "owner@example.com");
    await page.type("#pw", "correct-horse-1");
    await page.click("form button[type=submit]");
    await page.waitForSelector("#otp", { timeout: 8000 });
    ok(true, "signup asks for the emailed 6-digit code");
    const signupCode = await page.evaluate(() => JSON.parse(localStorage.getItem("mock.supa")).pending.token);
    await page.type("#otp", signupCode);
    await page.click("form button[type=submit]");
    await page.waitForFunction(() => location.pathname === "/app", { timeout: 8000 });
    await page.waitForSelector("#f-title");
    ok(true, "signed up and landed on /app");
    const barLayout = await page.evaluate(() => {
      const bar = document.querySelector("#bar");
      const panel = document.querySelector("#panel");
      return {
        inMain: !!bar.closest(".studio-main"),
        position: getComputedStyle(bar).position,
        belowPanel: bar.getBoundingClientRect().top >= panel.getBoundingClientRect().bottom - 1,
      };
    });
    ok(barLayout.inMain && barLayout.position === "static", "the action bar is in flow, under the form");
    ok(barLayout.belowPanel, "Continue/Back sit directly below the form panel");
    const wiring = await page.evaluate(() => ({
      adapter: typeof window.DeshiQR.inspect === "function" && typeof window.DeshiQR.build === "function",
      engine: typeof window.DeshiQR.update === "function" && typeof window.DeshiQR.validate === "function",
      exporter: typeof window.Deshi.downloadPage === "function" && typeof window.Deshi.buildPageHtml === "function"
    }));
    ok(wiring.engine, "vendored deshiqr engine loaded (update/validate)");
    ok(wiring.adapter, "site payload adapter loaded over the engine (inspect/build)");
    ok(wiring.exporter, "standalone exporter loaded (downloadPage/buildPageHtml)");
    ok((await page.$eval(".progress .count", (e) => e.textContent)).includes("Step 1 of 4 · Link"), "online wizard keeps the Link step");
    ok((await page.$("#f-user")) !== null, "online step 1 still has the username field");
    ok(
      (await page.$eval("#panel .panel-head p", (e) => e.textContent)).includes("address of your page"),
      "online step 1 still explains the page address"
    );
    ok((await page.$$eval("#previewBody .pv-handle", (els) => els.length)) === 1, "online live preview shows the host/username handle");
    await shot("02-step1-link");

    console.log("Step 1: name and link");
    await page.type("#f-title", "Rahim Traders");
    ok((await page.$eval("#f-user", (e) => e.value)) === "rahim-traders", "username auto-filled from the name");
    await page.waitForFunction(() => document.querySelector("#userStatus").classList.contains("ok"), { timeout: 4000 });
    ok(true, "username availability shows ✓");
    await shot("03-step1-filled");
    await clickPrimary(page);

    console.log("Step 2: drop the QR");
    await page.waitForSelector(".drop");
    await shot("04-step2-empty");
    const input = await page.$('input[type=file]:not([capture])');
    await input.uploadFile(qrFile);
    await page.waitForSelector(".qr-ok", { timeout: 15000 });
    ok((await page.$eval(".qr-ok .who b", (e) => e.textContent)) === "RAHIM TRADERS", "QR image decoded, merchant name shown");
    ok((await page.$eval(".qr-ok .pill", (e) => e.textContent)).includes("Checksum"), "checksum verified badge shown");
    await shot("05-step2-ok");
    await clickPrimary(page);

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
    await clickPrimary(page);

    console.log("Step 4: theme and publish");
    await page.waitForSelector(".pick-list .pick-row");
    ok((await page.$eval('.pick-row[data-pick="avatar"] .pick-value', (e) => e.textContent)).includes("initials"), "the avatar row shows the current choice");
    await page.click('.pick-row[data-pick="avatar"]');
    await page.waitForSelector(".sheet .avatars");
    await page.click('.sheet .avatar-pick[aria-label="Shop"]');
    await page.waitForSelector(".sheet", { hidden: true });
    ok((await page.$$eval("#previewBody .pv-avatar svg", (els) => els.length)) === 1, "choosing an avatar updates the live preview");
    ok((await page.$eval('.pick-row[data-pick="avatar"] .pick-value', (e) => e.textContent)) === "Shop", "the avatar row shows the selected icon");
    await page.click('.pick-row[data-pick="colour"]');
    await page.waitForSelector(".sheet .themes");
    await page.click('.sheet .swatch[aria-label="Coffee"]');
    await page.waitForSelector(".sheet", { hidden: true });
    ok((await page.$eval('.pick-row[data-pick="colour"] .pick-value', (e) => e.textContent)) === "Coffee", "the colour row shows the selected theme");
    ok((await page.$eval(".pv", (e) => e.getAttribute("data-theme"))) === "coffee", "preview switched to the coffee theme");
    await shot("07-step4-look");
    await clickPrimary(page);
    await page.waitForSelector(".live-banner", { timeout: 8000 });
    ok(true, "published, share tab with live banner");
    await shotFull("08-share");

    // Mobile tab bar: only the selected tab keeps its label; the others are icon pills.
    const mobileTabs = await page.$$eval(".tabs button", (els) => els.map((el) => {
      const label = el.querySelector(".tab-label");
      return {
        selected: el.getAttribute("aria-selected") === "true",
        hasLabel: !!label,
        labelVisible: !!label && getComputedStyle(label).display !== "none",
      };
    }));
    ok(mobileTabs.length === 6, "published dashboard has six tabs");
    ok(mobileTabs.filter((t) => t.selected).length === 1 && mobileTabs.filter((t) => t.selected)[0].labelVisible,
      "mobile: the active tab shows icon + label");
    ok(mobileTabs.filter((t) => !t.selected).every((t) => t.hasLabel && !t.labelVisible),
      "mobile: every inactive tab is icon-only");
    const tabLayout = await page.evaluate(() => {
      const bar = document.querySelector(".tabs");
      const tops = new Set(Array.from(bar.querySelectorAll("button")).map((b) => Math.round(b.getBoundingClientRect().top)));
      return { scroll: bar.scrollWidth, client: bar.clientWidth, rows: tops.size };
    });
    ok(tabLayout.scroll <= tabLayout.client + 1, "mobile: the tab bar does not overflow horizontally");
    ok(tabLayout.rows > 1, "mobile: extra tabs wrap onto a new row");

    console.log("Share tab: download the page as HTML");
    ok(
      (await page.evaluate(() => Array.from(document.querySelectorAll("#panel h2")).some((e) => e.textContent === "Download your page as HTML"))),
      "Share tab offers “Download your page as HTML”"
    );
    const shareHeadings = await page.$$eval("#panel h2", (els) => els.map((e) => e.textContent));
    ok(!shareHeadings.includes("Link with an amount"), "Share tab no longer duplicates the Payments amount link");
    ok(!shareHeadings.includes("QR for your page"), "Share tab no longer duplicates the page QR");
    await armCapture(page);
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("#panel button")).find((b) => b.textContent.trim() === "Download page (.html)");
      if (!btn) throw new Error("Share tab download button not found");
      btn.click();
    });
    const onlineExport = await readCapture(page);
    ok(onlineExport.filename === "deshiqr-rahim-traders.html", "share download filename is deshiqr-<username>.html");
    ok(onlineExport.html.startsWith("<!doctype html>"), "share download is a complete HTML document");
    ok(onlineExport.html.includes("window.DESHIQR_PAGE = {"), "share download embeds window.DESHIQR_PAGE");
    ok(/"avatar"\s*:\s*"shop"/.test(onlineExport.html), "share download keeps the chosen avatar icon");
    ok(
      onlineExport.html.includes('"title":"Rahim Traders"') && onlineExport.html.includes('"username":"rahim-traders"'),
      "share download carries the published page data"
    );
    ok(onlineExport.size > 100000, "share download is one self-contained file (" + Math.round(onlineExport.size / 1024) + " KB)");
    await shotFull("09-share-download");

    console.log("Share tab: printable poster");
    ok(
      (await page.evaluate(() => Array.from(document.querySelectorAll("#panel h2")).some((e) => e.textContent === "Printable poster"))),
      "Share tab offers a printable poster"
    );
    ok(!!(await page.$(".poster-preview svg")), "the poster preview renders");
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll(".poster-formats button")).find((b) => b.textContent.includes("A5"));
      btn.click();
    });
    ok((await page.$eval(".poster-preview svg", (e) => e.getAttribute("width"))) === "148mm", "A5 poster uses 148 mm width");
    await armCapture(page);
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("#panel button")).find((b) => b.textContent.includes("Download poster"));
      btn.click();
    });
    const posterA5 = await readCapture(page);
    ok(posterA5.filename === "deshipay-poster-a5-rahim-traders.svg", "poster download filename names the A5 page");
    ok(posterA5.html.includes('width="148mm"') && posterA5.html.includes('height="210mm"'), "poster SVG is A5 portrait");
    ok(posterA5.html.includes("Rahim Traders") && !posterA5.html.includes("localhost:8899"), "poster shows the merchant, not the DeshiPay URL");
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll(".poster-formats button")).find((b) => b.textContent.includes("A4"));
      btn.click();
    });
    ok((await page.$eval(".poster-preview svg", (e) => e.getAttribute("width"))) === "210mm", "A4 poster uses 210 mm width");
    await armCapture(page);
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("#panel button")).find((b) => b.textContent.includes("Download poster"));
      btn.click();
    });
    const posterA4 = await readCapture(page);
    ok(posterA4.filename === "deshipay-poster-a4-rahim-traders.svg", "poster download filename names the A4 page");
    const posterQr = await page.evaluate(async (svgText) => {
      const blob = new Blob([svgText], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
      const c = document.createElement("canvas"); c.width = 1200; c.height = Math.round(1200 * 297 / 210);
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      const d = g.getImageData(0, 0, c.width, c.height);
      const r = jsQR(d.data, c.width, c.height);
      URL.revokeObjectURL(url);
      return r ? r.data : null;
    }, posterA4.html);
    ok(posterQr === PAYLOAD, "the poster QR is the merchant's static Bangla QR, not the page URL");
    ["bKash", "Nagad", "Rocket", "upay", "Citytouch", "BRAC Bank Astha", "EBL Skybanking", "NexusPay", "MTB Neo", "Bangla QR"].forEach(function (brand) {
      ok(posterA4.html.includes('data-logo="' + brand + '"'), "poster shows the " + brand + " app icon");
    });
    const posterInfo = posterQr ? Q.inspect(posterQr) : { ok: false };
    ok(posterInfo.ok && posterInfo.srcAmount === 0 && !posterQr.includes("deshipay"), "poster QR is amount-free and points at the merchant account");
    await shotFull("09b-share-poster");

    console.log("Payments tab");
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll(".tabs button")).find((b) => b.textContent.includes("Payments"));
      btn.click();
    });
    await page.waitForSelector("#f-pay-amount");
    ok((await page.$eval("#panel h1", (e) => e.textContent)) === "Request a payment", "the Payments tab opens the request flow");
    await page.type("#f-pay-amount", "750");
    await page.waitForFunction(() => {
      const a = document.querySelector("#pay-open");
      return a && a.getAttribute("href").includes("?amount=750");
    }, { timeout: 4000 });
    ok((await page.$eval("#pay-open", (e) => e.getAttribute("href"))).includes("?amount=750"), "the locked payment link carries the amount");
    ok((await page.$eval("#f-pay-lock", (e) => e.checked)) === true, "the payment amount is locked by default");
    ok(!!(await page.$(".poster-preview svg")), "the amount-specific poster preview renders");
    await page.evaluate(() => { document.querySelector("#f-pay-lock").click(); });
    await page.waitForFunction(() => {
      const a = document.querySelector("#pay-open");
      return a && a.getAttribute("href").includes("?preferred=750");
    }, { timeout: 4000 });
    ok((await page.$eval("#pay-open", (e) => e.getAttribute("href"))).includes("?preferred=750"), "unlocking switches the link to a preferred amount");
    ok((await page.$eval("#pay-open", (e) => e.textContent)).includes("Open preferred page"), "the action label follows the lock state");
    await page.evaluate(() => { document.querySelector("#f-pay-lock").click(); });
    await armCapture(page);
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("#panel button")).find((b) => b.textContent.includes("Download poster"));
      btn.click();
    });
    const amountPoster = await readCapture(page);
    ok(amountPoster.filename === "deshipay-poster-a4-rahim-traders-tk750.svg", "amount poster filename names the amount");
    ok(amountPoster.html.includes("৳750") || amountPoster.html.includes("750"), "the amount is printed on the poster");
    const amountQr = await page.evaluate(async (svgText) => {
      const blob = new Blob([svgText], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
      const c = document.createElement("canvas"); c.width = 1200; c.height = Math.round(1200 * 297 / 210);
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      const d = g.getImageData(0, 0, c.width, c.height);
      const r = jsQR(d.data, c.width, c.height);
      URL.revokeObjectURL(url);
      return r ? r.data : null;
    }, amountPoster.html);
    const amountInfo = amountQr ? Q.inspect(amountQr) : { ok: false };
    ok(amountInfo.ok && amountInfo.srcAmount === 750, "the amount-specific poster QR decodes to ৳750");
    await shotFull("09c-payments");

    console.log("Customer page (mobile)");
    const healthBefore = state.health;
    await page.goto(BASE + "/rahim-traders", { waitUntil: "networkidle0" });
    await page.waitForSelector(".pv h1");
    ok(state.health > healthBefore, "online payment page probes the backend health endpoint on load");
    ok(!(await page.evaluate(() => document.body.innerText.includes("Temporarily unavailable"))), "online payment page never shows “Temporarily unavailable”");
    ok((await page.$eval(".pv h1", (e) => e.textContent)) === "Rahim Traders", "customer page shows the title");
    ok((await page.$$eval(".pv-avatar svg", (els) => els.length)) === 1, "customer page shows the chosen avatar icon");
    await page.waitForSelector(".pv-apps img");
    ok((await page.$eval(".slip-actions .btn", (e) => e.textContent)).includes("A5 poster"), "the QR save button downloads the A5 poster");
    ok((await page.$$eval(".pv-apps img", (els) => els.length)) === 10, "customer QR shows the supported app icons");
    ok((await page.$$eval(".pv-apps .pv-app.bare", (els) => els.length)) === 3, "Nagad, upay and Bangla QR keep their unrounded marks");
    ok(
      (await page.$eval(".pv-caution", (e) => e.innerText)).includes("not a payment processor"),
      "the customer-page caution says DeshiPay is not a payment processor"
    );
    ok(
      (await page.$eval(".pv-foot .made-line", (e) => e.innerText)).includes("Made with") &&
        (await page.$eval(".pv-foot .made-line", (e) => e.innerText)).includes("DeshiPay"),
      "customer-page footer credits DeshiPay"
    );
    ok((await page.$$eval(".pv-foot .made-brand .mark", (els) => els.length)) === 1, "the footer uses the DeshiPay logo");
    ok(
      (await page.$eval(".pv-foot .made-cta", (e) => e.textContent)).includes("Create your own page"),
      "the footer invites visitors to create their own page"
    );
    ok(!!(await page.$(".pv-foot .made-actions .made-report[href^='mailto:']")), "the footer has a Report abuse button beside it");
    ok(!!(await page.$(".site-foot")), "customer page has the site footer");
    ok((await page.$eval(".pv-handle", (e) => e.textContent)) === "localhost:8899/rahim-traders", "online customer page still shows its host/username handle");
    ok((await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "coffee", "customer page uses the chosen theme");
    await shot("10-pay-empty");
    await page.waitForSelector(".qrbox svg", { timeout: 5000 });
    const baseDecoded = await decodeOnScreenQr(page);
    const baseInfo = baseDecoded ? Q.inspect(baseDecoded) : { ok: false };
    ok(baseInfo.ok && baseInfo.srcAmount === 0, "without an amount the page shows the static QR for the app's own amount");
    ok(
      (await page.$eval(".slip-help", (e) => e.textContent)).includes("type the amount in your payment app"),
      "the page explains that the payer can type the amount in their app"
    );
    await page.type(".amt-input", "১২৫০");
    ok((await page.$eval(".amt-input", (e) => e.value)) === "1250", "Bangla digits typed in the amount are converted");
    await page.waitForSelector(".qrbox svg");
    await sleep(900);
    await shotFull("11-pay-qr");

    // decode the QR that is actually on screen and check the payload end to end
    const decoded = await decodeOnScreenQr(page);
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
    await shotFull("12-pay-wallet");
    const tabs2 = await page.$$(".pv-methods button");
    await tabs2[2].click();
    await page.waitForSelector(".item-foot");
    await shotFull("13-pay-bank");

    console.log("Fixed-amount link");
    await page.goto(BASE + "/rahim-traders?amount=500", { waitUntil: "networkidle0" });
    await page.waitForSelector(".qrbox svg");
    ok((await page.$eval(".amt-input", (e) => e.readOnly)) === true, "amount locked with ?amount=500");

    console.log("Amount ceiling");
    await page.goto(BASE + "/rahim-traders", { waitUntil: "networkidle0" });
    await page.waitForSelector(".amt-input");
    await page.type(".amt-input", "60000");
    ok((await page.$eval(".amt-err", (e) => e.textContent)).includes("50,000"), "amounts above ৳50,000 are refused");
    ok(!!(await page.$(".qrbox svg")), "the static QR stays visible above the limit");

    console.log("Preferred amount");
    await page.goto(BASE + "/rahim-traders?preferred=500", { waitUntil: "networkidle0" });
    await page.waitForSelector(".amt-input");
    ok((await page.$eval(".amt-input", (e) => e.value)) === "500", "?preferred=500 prefills the amount");
    ok((await page.$eval(".amt-input", (e) => e.readOnly)) === false, "the preferred amount stays editable");
    await page.waitForSelector(".qrbox svg");
    await sleep(900);
    const preferredDecoded = await decodeOnScreenQr(page);
    const preferredInfo = preferredDecoded ? Q.inspect(preferredDecoded) : { ok: false };
    ok(preferredInfo.ok && preferredInfo.srcAmount === 500, "the preferred amount QR already carries ৳500");

    console.log("Method deep links");
    await page.goto(BASE + "/rahim-traders?method=wallet", { waitUntil: "networkidle0" });
    await page.waitForSelector(".copyrow");
    ok((await page.$$eval(".pv-methods button", (els) => els.map((e) => e.getAttribute("aria-selected")))).join(",") === "false,true,false", "?method=wallet opens the Wallet tab");
    ok((await page.evaluate(() => location.search)).includes("method=wallet"), "the tab is reflected in the URL");
    await page.goto(BASE + "/rahim-traders?method=bank", { waitUntil: "networkidle0" });
    await page.waitForSelector(".item-foot");
    ok((await page.$$eval(".pv-methods button", (els) => els.map((e) => e.getAttribute("aria-selected")))).join(",") === "false,false,true", "?method=bank opens the Bank tab");
    await page.goto(BASE + "/rahim-traders?amount=500&method=bank", { waitUntil: "networkidle0" });
    await page.waitForSelector(".item-foot");
    ok((await page.$$eval(".pv-methods button", (els) => els.map((e) => e.getAttribute("aria-selected")))).join(",") === "false,false,true", "amount and method deep links work together");
    await page.goto(BASE + "/rahim-traders", { waitUntil: "networkidle0" });
    await page.waitForSelector(".pv-methods");
    const tabs3 = await page.$$(".pv-methods button");
    await tabs3[1].click();
    await page.waitForSelector(".copyrow");
    ok((await page.evaluate(() => location.search)).includes("method=wallet"), "switching tabs updates the URL so it can be shared");
    const tabs4 = await page.$$(".pv-methods button");
    await tabs4[0].click();
    ok((await page.evaluate(() => location.search)).includes("method=") === false, "back on Scan QR the method param is dropped");

    console.log("Not found + dark mode + desktop");
    await page.goto(BASE + "/nobody-here", { waitUntil: "networkidle0" });
    await page.waitForSelector(".pv-state h1");
    ok((await page.$eval(".pv-state h1", (e) => e.textContent)).includes("doesn’t exist"), "unknown username shows a friendly not-found");
    await page.goto(BASE + "/rahim-traders", { waitUntil: "networkidle0" });
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
    await page.type(".amt-input", "500");
    await sleep(900);
    await shotFull("14-pay-dark");
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
    await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
    await page.goto(BASE + "/rahim-traders", { waitUntil: "networkidle0" });
    await page.type(".amt-input", "500");
    await sleep(900);
    await shot("15-pay-desktop");
    await page.goto(BASE + "/app", { waitUntil: "networkidle0" });
    await page.waitForSelector(".tabs");
    const desktopLabels = await page.$$eval(".tabs button .tab-label", (els) =>
      els.map((el) => getComputedStyle(el).display !== "none"));
    ok(desktopLabels.length === 6 && desktopLabels.every(Boolean),
      "desktop: every tab shows its label");
    await shot("17-dashboard-desktop");

    console.log("Sign out and wrong password");
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(BASE + "/app", { waitUntil: "networkidle0" });
    await page.waitForSelector(".top-actions button");
    ok((await page.$eval(".nav-btn", (e) => getComputedStyle(e).display)) === "flex", "dashboard uses the hamburger on mobile");
    ok((await page.$eval(".top-actions", (e) => !!e.closest(".top-menu"))) === true, "dashboard actions live inside the nav menu on mobile");
    ok((await page.$eval(".top-menu", (e) => getComputedStyle(e).display)) === "none", "dashboard menu is collapsed on mobile");
    await page.click(".nav-btn");
    await page.waitForSelector(".top.open .top-actions button");
    await page.click(".top.open .top-actions button");
    await page.waitForFunction(() => location.pathname === "/", { timeout: 5000 });
    // signed out now, so this is a real landing page (a signed-in visitor is redirected to /app)
    await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
    await page.waitForSelector(".hero-cta[href='/login']", { timeout: 10000 });
    const desktopHero = await page.evaluate(() => ({
      nav: document.querySelector(".top").getBoundingClientRect().height,
      hero: document.querySelector(".hero-top").getBoundingClientRect().height,
      viewport: window.innerHeight,
    }));
    ok(desktopHero.hero >= desktopHero.viewport - Math.ceil(desktopHero.nav), "desktop hero also fills the viewport below the nav");
    const demoCentre = await page.evaluate(() => {
      const hero = document.querySelector(".hero-top").getBoundingClientRect();
      const demo = document.querySelector(".demo").getBoundingClientRect();
      return Math.abs((demo.top + demo.height / 2) - (hero.top + hero.height / 2));
    });
    ok(demoCentre < 40, "the desktop hero demo is vertically centred in the hero (off by " + Math.round(demoCentre) + "px)");
    ok((await page.$eval(".nav-btn", (e) => getComputedStyle(e).display)) === "none", "desktop hides the hamburger");
    ok((await page.$eval(".top-menu", (e) => getComputedStyle(e).display)) === "flex", "desktop shows the nav inline");
    ok((await page.$eval(".theme-toggle", (e) => getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0)), "desktop shows the theme toggle in the bar");
    ok((await page.$eval(".theme-toggle .theme-label", (e) => getComputedStyle(e).display)) === "none", "the desktop theme toggle is icon-only");
    ok((await page.$eval(".top-actions", (e) => getComputedStyle(e).display)) === "flex", "desktop shows the top actions inline");
    await shot("16-landing-desktop");
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(BASE + "/login?mode=signin", { waitUntil: "networkidle0" });
    await page.waitForSelector("#email", { timeout: 10000 });
    await page.type("#email", "owner@example.com");
    await page.type("#pw", "wrong-password");
    await page.click("form button[type=submit]");
    await page.waitForFunction(() => document.querySelector(".form-msg.bad"), { timeout: 4000 });
    ok((await page.$eval(".form-msg.bad", (e) => e.textContent)).includes("don’t match"), "wrong password shows a friendly message");

    console.log("Donate page");
    await page.goto(BASE + "/deshipay", { waitUntil: "networkidle0" });
    await page.waitForSelector(".pv h1");
    ok((await page.$eval(".pv h1", (e) => e.textContent)) === "DeshiPay", "the donate page is titled DeshiPay");
    const donateText = await page.evaluate(() => document.body.innerText);
    ok(
      donateText.includes("Himel Das") && donateText.includes("1251070048232") &&
        donateText.includes("Dutch-Bangla Bank") && donateText.includes("090100378") && donateText.includes("DBBLBDDH"),
      "the donate page shows the full bank details"
    );

    console.log("Forgot password: OTP then new password");
    await page.click(".auth-links button");
    await page.waitForSelector("#email");
    await page.evaluate(() => { document.querySelector("#email").value = ""; });
    await page.type("#email", "owner@example.com");
    await page.click("form button[type=submit]");
    await page.waitForSelector("#otp", { timeout: 8000 });
    const resetCode = await page.evaluate(() => JSON.parse(localStorage.getItem("mock.supa")).pending.token);
    await page.type("#otp", resetCode);
    await page.click("form button[type=submit]");
    await page.waitForSelector("#pw", { timeout: 8000 });
    await page.type("#pw", "new-correct-horse");
    await page.click("form button[type=submit]");
    await page.waitForFunction(() => location.pathname === "/app", { timeout: 8000 });
    ok(true, "reset code verifies and the new password signs in");
  } catch (e) {
    console.error("  FAIL exception: " + e.message);
    fails++;
  }
  noErrors(state, "online journey");
  await ctx.close();
}

/* ================= offline / paused backend + standalone download ================= */

async function scenarioOffline(browser) {
  console.log("\n=== Scenario 2: offline (backend paused/unreachable) ===");
  const { ctx, page, state } = await newScenarioPage(browser, true);
  try {
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + ".png"), fullPage: false });
    const shotFull = (n) => page.screenshot({ path: path.join(SHOTS, n + ".png"), fullPage: true });

    console.log("Landing + offline sign-in page");
    await page.goto(BASE + "/", { waitUntil: "networkidle0" });
    await page.waitForSelector(".hero-cta[href='/login']", { timeout: 10000 });
    ok((await page.$("#email")) === null && (await page.$("#pw")) === null, "offline landing has no sign-in / sign-up form");
    ok(state.supa.length === 0, "the landing makes no backend request");
    const offlineLandingText = await page.evaluate(() => document.body.innerText);
    ok(
      offlineLandingText.includes("Everything you need to get paid") && offlineLandingText.includes("Questions people ask"),
      "the landing keeps its normal marketing copy in offline mode"
    );
    ok((await page.$$eval(".demo .pv", (els) => els.length)) === 1, "offline landing still shows the live payment demo");
    await page.waitForSelector(".demo .qrbox svg", { timeout: 5000 });
    ok(true, "the offline live demo draws its real QR");
    await shot("18-offline-landing");

    // fixture QR image for the wizard (rendered by the app itself, from the landing page)
    const b64 = await page.evaluate(async (p) => {
      const blob = await Deshi.qrPng(p, 700);
      return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(",")[1]); fr.readAsDataURL(blob); });
    }, PAYLOAD);
    const qrFile = path.join(SHOTS, "input-qr-offline.png");
    fs.writeFileSync(qrFile, Buffer.from(b64, "base64"));

    console.log("Login page: offline create-page card");
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click(".hero-cta[href='/login']")]);
    await page.waitForSelector('#auth a[href="/app"]', { timeout: 10000 });
    ok((await page.$("#email")) === null && (await page.$("#pw")) === null, "offline login page shows no sign-in form");
    ok((await page.$eval("#auth h2", (e) => e.textContent)) === "Create your page", "offline login page heading explains what to do");
    ok((await page.$eval('#auth a[href="/app"]', (e) => e.textContent)).includes("Create my page"), "offline login page offers the “Create my page” CTA");
    ok((await page.$("#auth .notice")) === null, "offline login card has no database-status notice");
    ok((await page.$eval("#auth .sub", (e) => e.textContent)).includes("Sign-in is offline right now"), "offline login page explains why sign-in is unavailable");
    ok(state.supa.length >= 2 && state.supa.every(isProbe), "the login page probed health + fallback and nothing else (" + state.supa.length + " requests)");

    console.log("Local wizard: no account, same steps");
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click('#auth a[href="/app"]')]);
    await page.waitForSelector("#f-title", { timeout: 10000 });
    ok((await page.$eval(".progress .count", (e) => e.textContent)).includes("Step 1 of 5 · Name"), "local wizard has five steps and step 1 is “Name”");
    ok((await page.$eval("#topActions .user-chip", (e) => e.textContent)).trim() === "Offline mode", "dashboard shows the “Offline mode” chip");
    ok((await page.$eval(".nav-btn", (e) => getComputedStyle(e).display)) === "flex", "offline dashboard uses the hamburger on mobile");
    ok((await page.$eval(".top-menu", (e) => getComputedStyle(e).display)) === "none", "offline dashboard menu starts collapsed");
    await page.click(".nav-btn");
    ok((await page.$eval("#topActions .user-chip", (e) => getComputedStyle(e).display)) !== "none", "opening the menu shows the mode chip");
    await page.keyboard.press("Escape");
    ok((await page.$("#topActions button")) === null, "no sign-out button without an account");
    ok((await page.$("#f-user")) === null, "local mode has no username/link input");
    ok((await page.$("#userAffix")) === null && (await page.$("#userStatus")) === null, "local mode has no link affix or availability status");
    const localFields = await page.$$eval("#panel .field", (els) => els.map((e) => (e.querySelector("label") || {}).textContent || ""));
    ok(
      localFields.length === 2 && localFields[0].includes("Your name or business name") && localFields[1].includes("A note for customers"),
      "local step 1 asks only for the name and an optional note"
    );
    ok(
      (await page.$eval("#panel .panel-head p", (e) => e.textContent)) === "This is the name customers see on your page.",
      "local step 1 lead makes no hosted-address promise"
    );
    ok(!/link|address/i.test(await page.$eval("#panel", (e) => e.innerText)), "local step 1 has no link/address copy");
    ok((await page.$$eval("#previewBody .pv-handle", (els) => els.length)) === 0, "local live preview hides the host/username handle");
    ok((await page.$eval(".frame-bar", (e) => e.textContent.trim())) === "Preview", "local preview frame says “Preview”, not “Live preview”");
    await shot("19-offline-step1");

    console.log("Step 1: name only");
    await page.type("#f-title", "Offline Traders");
    ok((await page.$eval("#previewBody .pv h1", (e) => e.textContent)) === "Offline Traders", "local preview picks up the name");
    ok((await page.$$eval("#previewBody .pv-handle", (els) => els.length)) === 0, "local preview still has no handle after typing");
    await clickPrimary(page);

    console.log("Step 2: drop the QR");
    await page.waitForSelector(".drop");
    const input = await page.$('input[type=file]:not([capture])');
    await input.uploadFile(qrFile);
    await page.waitForSelector(".qr-ok", { timeout: 15000 });
    ok((await page.$eval(".qr-ok .who b", (e) => e.textContent)) === "RAHIM TRADERS", "QR decoded in local mode, merchant name shown");
    await clickPrimary(page);

    console.log("Step 3 + 4: skip wallet, pick a theme");
    await page.waitForSelector(".add");
    await clickPrimary(page);
    await page.waitForSelector(".pick-list .pick-row");
    await page.click('.pick-row[data-pick="colour"]');
    await page.waitForSelector(".sheet .themes");
    await page.click('.sheet .swatch[aria-label="Coffee"]');
    await page.waitForSelector(".sheet", { hidden: true });
    ok((await page.$eval(".pv", (e) => e.getAttribute("data-theme"))) === "coffee", "preview uses the coffee theme");
    await clickPrimary(page);

    console.log("Step 5: download the standalone page");
    await page.waitForSelector("#dlBtn", { timeout: 8000 });
    ok((await page.$eval(".progress .count", (e) => e.textContent)).includes("Step 5 of 5"), "the download is the fifth (new) step");
    ok((await page.$eval("#primary", (e) => e.textContent)).includes("Download page"), "the primary action becomes “Download page”");
    ok((await page.$eval("#panel .urlbox span", (e) => e.textContent)) === "deshiqr-offline-traders.html", "download panel shows the title-derived file name");
    ok(!!(await page.$(".poster-preview svg")), "offline/no-account mode also offers the printable poster");
    await shot("20-offline-download");

    const draft = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem("deshiqr.local.v1") || "null"); } catch (e) { return null; }
    });
    ok(!!draft && draft.title === "Offline Traders" && draft.theme === "coffee" && !!draft.qr, "the wizard draft persists in localStorage deshiqr.local.v1");
    ok(state.supa.every(isProbe), "the local wizard made no Supabase auth or RPC calls (only the aborted probe chain)");

    await armCapture(page);
    await page.click("#dlBtn");
    await page.waitForFunction(() => {
      const hint = document.getElementById("dlHint");
      return !!hint && /^Downloaded deshiqr-offline-traders\.html/.test(hint.textContent);
    }, { timeout: 20000 });
    const exported = await readCapture(page);
    ok(exported.filename === "deshiqr-offline-traders.html", "download filename is deshiqr-<username>.html");
    ok(exported.html.startsWith("<!doctype html>"), "downloaded file is a complete HTML document");
    ok(exported.html.includes("window.DESHIQR_PAGE = {"), "downloaded file embeds window.DESHIQR_PAGE");
    ok(
      exported.html.includes('"title":"Offline Traders"') &&
        exported.html.includes('"username":"offline-traders"') &&
        exported.html.includes('"theme":"coffee"'),
      "downloaded file carries the wizard data (title, username, theme)"
    );
    ok(exported.html.includes('"qr_payload":"' + PAYLOAD + '"') && exported.html.includes('"qr_name":"RAHIM TRADERS"'), "downloaded file carries the uploaded QR payload");
    ok(exported.html.includes('window.DESHIQR_FOOTER_HREF = "' + BASE + '/"'), "downloaded file points its footer at the generating site");
    ok(/<style>/.test(exported.html) && !/<script[^>]+src=/.test(exported.html), "CSS and JS are inlined into the file");
    const externals = (exported.html.match(/(?:src|href)="https?:\/\/[^"]+"/g) || []).map((s) => s.split('"')[1]);
    ok(externals.length > 0 && externals.every((u) => /fonts\.(googleapis|gstatic)\.com/.test(u)), "the only external references are Google Fonts");
    ok(exported.size > 100000, "downloaded file is self-contained (" + Math.round(exported.size / 1024) + " KB)");
    const standalonePath = path.join(SHOTS, "standalone.html");
    fs.writeFileSync(standalonePath, exported.html);

    console.log("Open the downloaded file from disk");
    const sp = await ctx.newPage();
    const sshot = (n) => sp.screenshot({ path: path.join(SHOTS, n + ".png"), fullPage: false });
    const sshotFull = (n) => sp.screenshot({ path: path.join(SHOTS, n + ".png"), fullPage: true });
    const sstate = { errors: [], net: [] };
    await sp.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await sp.setRequestInterception(true);
    sp.on("request", (req) => {
      const u = req.url();
      if (u.startsWith("file:")) return req.continue();
      if (/^https?:/.test(u)) sstate.net.push(u);
      if (u.includes("fonts.googleapis.com")) return req.respond({ status: 200, contentType: "text/css; charset=utf-8", body: "" });
      if (u.includes("fonts.gstatic.com")) return req.abort();
      return req.continue();
    });
    sp.on("pageerror", (e) => sstate.errors.push("pageerror: " + e.message));
    sp.on("console", (m) => { if (m.type() === "error") sstate.errors.push("console: " + m.text()); });

    const fileUrl = "file://" + standalonePath;
    await sp.goto(fileUrl, { waitUntil: "networkidle0", timeout: 20000 });
    await sp.waitForSelector(".pv h1", { timeout: 8000 });
    ok((await sp.$eval(".pv h1", (e) => e.textContent)) === "Offline Traders", "standalone page renders the merchant title");
    ok((await sp.title()) === "Pay Offline Traders", "standalone page title names the page");
    ok((await sp.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "coffee", "standalone page keeps the chosen theme");
    ok((await sp.$(".pv-handle")) === null && (await sp.$$(".pv-handle")).length === 0, "standalone page hides the host/username handle");
    ok((await sp.$(".pv-methods")) === null && (await sp.$(".amt-input")) !== null, "standalone page renders the single QR method directly");
    ok((await sp.$eval(".pv-foot a", (e) => e.getAttribute("href"))) === BASE + "/", "standalone footer links back to the generating site");
    ok(
      (await sp.$eval(".pv-foot .made-cta", (e) => e.getAttribute("href"))) === BASE + "/",
      "standalone footer points its create-page CTA at the generating site"
    );
    await sshot("21-standalone-pay");

    await sp.type(".amt-input", "1250");
    await sp.waitForSelector(".qrbox svg");
    await sleep(900);
    await sshotFull("22-standalone-qr");
    const decoded = await decodeOnScreenQr(sp);
    ok(!!decoded, "the standalone page draws a scannable QR");
    const rr = decoded ? Q.inspect(decoded) : { ok: false };
    ok(rr.ok && rr.srcAmount === 1250 && rr.name === "RAHIM TRADERS", "standalone QR: checksum valid, amount ৳1250, same merchant");

    await sp.goto(fileUrl + "?amount=1000", { waitUntil: "networkidle0", timeout: 20000 });
    await sp.waitForSelector(".qrbox svg");
    ok((await sp.$eval(".amt-input", (e) => e.readOnly)) === true, "?amount=1000 locks the amount on the standalone page");
    ok((await sp.$eval(".amt-input", (e) => e.value)) === "1000", "the locked amount is 1000");
    await sshot("23-standalone-fixed");

    ok(sstate.net.length > 0 && sstate.net.every((u) => /fonts\.(googleapis|gstatic)\.com/.test(u)), "standalone page loads nothing but the web fonts");
    ok(sstate.errors.length === 0, "standalone page has no console or page errors" + (sstate.errors.length ? "\n         " + sstate.errors.join("\n         ") : ""));

    console.log("Live payment page while the backend is down");
    // Close the standalone tab and make the main page active again: Puppeteer
    // waits for a stable bounding box with requestAnimationFrame before clicking,
    // and a background tab's rAF can be throttled (the click would hang).
    await sp.close();
    await page.bringToFront();
    await page.goto(BASE + "/some-shop", { waitUntil: "networkidle0" });
    await page.waitForSelector(".pv-state h1", { timeout: 10000 });
    ok((await page.$eval(".pv-state h1", (e) => e.textContent)) === "Temporarily unavailable", "a payment page opened while the backend is down says “Temporarily unavailable”");
    const unavailableText = await page.$eval(".pv-state p", (e) => e.textContent);
    ok(unavailableText.includes("Sorry") && /try again/i.test(unavailableText), "the unavailable state apologises and asks the visitor to try again");
    ok((await page.$eval(".pv-state button", (e) => e.textContent)).includes("Try again"), "the unavailable state offers a “Try again” button");
    ok((await page.$(".pv h1")) === null, "no customer page is rendered while the backend is down");
    await shot("24-offline-pay-unavailable");
    const supaBeforeRetry = state.supa.length;
    await page.click(".pv-state button");
    await page.waitForFunction(
      () => document.querySelector(".pv-state h1") && document.querySelector(".pv-state h1").textContent === "Temporarily unavailable",
      { timeout: 15000 }
    );
    ok(true, "Try again keeps the unavailable state while the backend is still down");
    ok(state.supa.length > supaBeforeRetry && state.supa.every(isProbe), "Try again forces a fresh health probe, and makes no other Supabase call");
  } catch (e) {
    console.error("  FAIL exception: " + e.message);
    fails++;
  }
  noErrors(state, "offline journey");
  await ctx.close();
}

/* ================= recovery: Try again after the backend comes back ================= */

async function scenarioRecovery(browser) {
  console.log("\n=== Scenario 3: payment page recovers when the backend comes back ===");
  const { ctx, page, state } = await newScenarioPage(browser, true);
  try {
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + ".png"), fullPage: false });

    // Same-origin page first, to seed the mocked database with one published page.
    await page.goto(BASE + "/", { waitUntil: "networkidle0" });
    await page.waitForSelector(".hero-cta[href='/login']", { timeout: 10000 });
    await page.evaluate((payload) => {
      localStorage.setItem("mock.supa", JSON.stringify({
        users: [],
        session: null,
        profiles: [{
          username: "some-shop", title: "Recovery Shop", message: "We are back online.",
          theme: "coffee", presets: [100, 500, 1000], qr_payload: payload, qr_name: "RAHIM TRADERS",
          qr_city: "Bogra", ref_prefix: "", ref_len: 0, wallets: [], banks: [], is_published: true
        }]
      }));
    }, PAYLOAD);

    console.log("Down: the unavailable state");
    await page.goto(BASE + "/some-shop", { waitUntil: "networkidle0" });
    await page.waitForSelector(".pv-state h1", { timeout: 10000 });
    ok((await page.$eval(".pv-state h1", (e) => e.textContent)) === "Temporarily unavailable", "recovery test starts from “Temporarily unavailable”");
    await shot("25-pay-unavailable");

    console.log("Backend returns: Try again loads the page");
    state.down = false;
    const probesBefore = state.health;
    await page.click(".pv-state button");
    await page.waitForSelector(".pv h1", { timeout: 15000 });
    ok((await page.$eval(".pv h1", (e) => e.textContent)) === "Recovery Shop", "Try again renders the customer page once the backend is back");
    ok(state.health > probesBefore, "the recovered page came from a fresh, successful health probe");
    ok(!(await page.evaluate(() => document.body.innerText.includes("Temporarily unavailable"))), "the unavailable state is gone after recovery");
    ok((await page.$eval(".pv-handle", (e) => e.textContent)) === "localhost:8899/some-shop", "the recovered live page shows its host/username handle");
    await page.type(".amt-input", "500");
    await page.waitForSelector(".qrbox svg");
    await shot("26-pay-recovered");
    ok(true, "the recovered page still draws its payment QR");
  } catch (e) {
    console.error("  FAIL exception: " + e.message);
    fails++;
  }
  noErrors(state, "recovery journey");
  await ctx.close();
}

/* ---------------- main ---------------- */

async function main() {
  const server = spawn("node", [path.join(ROOT, "scripts/dev-server.js")], { env: Object.assign({}, process.env, { PORT }), stdio: "ignore" });
  await sleep(600);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    await scenarioOnline(browser);
    await scenarioOffline(browser);
    await scenarioRecovery(browser);
  } finally {
    await browser.close();
    server.kill();
  }
  const shots = fs.readdirSync(SHOTS).filter((f) => /\.(png|html)$/.test(f)).sort();
  console.log("\nScreenshots (" + shots.length + "): " + shots.join(", "));
  console.log(checks + " checks, " + fails + " failed");
  console.log(fails ? "\n" + fails + " check(s) FAILED" : "\nAll UI checks passed");
  process.exit(fails ? 1 : 0);
}
main();
