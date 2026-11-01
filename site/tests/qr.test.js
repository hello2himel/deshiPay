/* Run with: npm test   (plain Node, no dependencies)
 *
 * The site adapter (public/js/payload.js) keeps the historical inspect/build/
 * makeRef/sanitizeAmount surface but delegates validation and every payload
 * write to the repo's vendored engine (public/vendor/deshiqr.global.js).
 * These tests therefore load the bundle first, then the adapter — the same
 * order as app.html/pay.html — and check both the site behaviour and that the
 * delegation really happens.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const H = require("./helpers.js");

const Q = H.loadAdapter();
const engine = H.loadEngine();

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ok   " + name);
  } catch (e) {
    console.error("  FAIL " + name + "\n       " + (e && e.message));
    process.exitCode = 1;
  }
}

/* ---------------- fixtures (fixture-only TLV/CRC, no real account data) ----------------
 * A synthetic, checksum-valid merchant QR. `mode` picks the length unit:
 * "bytes" (EMVCo, default) or "chars" (some legacy Bangla-QR generators).
 */
const NPSB = [["00", "bd.org.bb.npsb"], ["01", "02"], ["02", "04"], ["03", "01700000000"]];

function standard(opts) {
  opts = opts || {};
  const mode = opts.mode || "bytes";
  const items = [["00", "01"]];
  if (opts.initiation !== false) items.push(["01", opts.dynamic ? "12" : "11"]);
  items.push(["26", H.encodeTLV(NPSB, mode)]);
  items.push(["52", "6016"]);
  items.push(["53", "050"]);
  if (opts.amount !== undefined) items.push(["54", opts.amount]);
  items.push(["58", "BD"]);
  items.push(["59", opts.name || "TEST MERCHANT"]);
  items.push(["60", opts.city || "Dhaka"]);
  if (opts.include62 !== false) items.push(["62", H.encodeTLV(opts.refSub || [["06", "FT"]], mode)]);
  items.push(["80", "TOKEN-A/+=="]);
  return H.make(items, mode);
}

/** Parse the top level of a payload (fixture helper, not the site's write path). */
function fields(payload) {
  return H.parseTLV(payload).filter((x) => x[0] !== "63");
}
function field(payload, tag) {
  return fields(payload).find((x) => x[0] === tag);
}
function rebuild(items) {
  return H.make(items);
}

const base = () => standard();
const refSub = [["01", "ABCDEFGHIJ1234567890"], ["06", "FT"]];
const withRef = () => standard({ refSub: refSub, dynamic: true, amount: "10.00" });
const refOnly62 = () => standard({ refSub: [["01", "ABCDEFGHIJ1234567890"]] });

const MSG = {
  short: "That doesn’t look like a payment QR. It’s too short.",
  noChecksum: "This QR has no checksum field, so it isn’t a Bangla QR.",
  checksum: "The checksum doesn’t match. The QR may be damaged, or it isn’t a Bangla QR. Try a sharper screenshot.",
  notStandard: "The QR data is not in the standard merchant QR format.",
  indicator: "This isn’t an EMV merchant QR (format indicator missing).",
  account: "This QR has no account details in it.",
  name: "This QR has no merchant name, so customers couldn’t verify who they’re paying.",
  currency: "This QR isn’t in Bangladeshi taka (BDT).",
};

/* ---------------- the vendored engine + the adapter ---------------- */

test("the adapter augments the vendored engine object in place (Node)", () => {
  assert.strictEqual(require(H.ADAPTER), globalThis.DeshiQR);
  assert.strictEqual(globalThis.DeshiQR, engine);
  assert.strictEqual(typeof engine.update, "function");
  assert.strictEqual(typeof engine.validate, "function");
  for (const fn of ["inspect", "build", "makeRef", "sanitizeAmount"]) assert.strictEqual(typeof Q[fn], "function");
  assert.strictEqual(Q.MAX_AMOUNT, 9999999.99);
});

test("the browser UMD branch augments window.DeshiQR when the bundle loads first", () => {
  const vendorSrc = fs.readFileSync(H.VENDOR, "utf8");
  const adapterSrc = fs.readFileSync(H.ADAPTER, "utf8");
  const sandbox = { console: console, TextEncoder: TextEncoder, TextDecoder: TextDecoder };
  vm.createContext(sandbox);
  vm.runInContext(vendorSrc, sandbox, { filename: "deshiqr.global.js" });
  assert.strictEqual(typeof sandbox.DeshiQR, "object");
  vm.runInContext(adapterSrc, sandbox, { filename: "payload.js" });
  assert.strictEqual(typeof sandbox.DeshiQR.inspect, "function");
  assert.strictEqual(typeof sandbox.DeshiQR.update, "function");
  const r = sandbox.DeshiQR.inspect(base());
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.name, "TEST MERCHANT");
});

test("the adapter fails loudly if the engine bundle is missing", () => {
  const adapterSrc = fs.readFileSync(H.ADAPTER, "utf8");
  const sandbox = { console: console, TextEncoder: TextEncoder, TextDecoder: TextDecoder };
  vm.createContext(sandbox);
  assert.throws(() => vm.runInContext(adapterSrc, sandbox), /engine bundle is missing/);
});

/* ---------------- inspect ---------------- */

test("inspect reads a valid static QR", () => {
  const r = Q.inspect(base());
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.base, base());
  assert.strictEqual(r.mode, "bytes");
  assert.strictEqual(r.name, "TEST MERCHANT");
  assert.strictEqual(r.city, "Dhaka");
  assert.strictEqual(r.guid, "bd.org.bb.npsb");
  assert.strictEqual(r.acct, "01700000000");
  assert.strictEqual(r.srcAmount, 0);
  assert.strictEqual(r.hasRef, false);
  assert.strictEqual(r.refPrefix, "");
  assert.strictEqual(r.refLen, 0);
  assert.deepStrictEqual(r.tags, H.parseTLV(base()));
});

test("inspect trims the payload before reading it", () => {
  const r = Q.inspect("  \n" + base() + "  ");
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.base, base());
});

test("inspect reports an amount that was already in the QR", () => {
  const r = Q.inspect(Q.build(base(), 750));
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.srcAmount, 750);
  assert.strictEqual(r.base, base());
});

/* ---------------- build ---------------- */

test("build with no amount returns the same static QR", () => {
  assert.strictEqual(Q.build(base()), base());
  assert.strictEqual(Q.build(base(), 0), base());
  assert.strictEqual(Q.build(base(), null), base());
});

test("build adds tag 54 after tag 53, flips tag 01 to 12, and seals a valid checksum", () => {
  const out = Q.build(base(), 500);
  const items = H.parseTLV(out);
  const tags = items.map((x) => x[0]);
  assert.strictEqual(items.find((x) => x[0] === "54")[1], "500.00");
  assert.strictEqual(items.find((x) => x[0] === "01")[1], "12");
  assert.strictEqual(tags.indexOf("54"), tags.indexOf("53") + 1);
  assert.ok(tags.indexOf("54") < tags.indexOf("58"));
  assert.strictEqual(tags[tags.length - 1], "63");
  assert.strictEqual(out.slice(-4), H.crc16(out.slice(0, -4)));
  assert.strictEqual(engine.validate(out, { warnings: false }).ok, true);
  assert.strictEqual(Q.inspect(out).ok, true);
});

test("every other tag is carried over untouched", () => {
  const before = fields(base()).filter((x) => x[0] !== "01");
  const after = fields(Q.build(base(), 1234.5)).filter((x) => !["01", "54"].includes(x[0]));
  assert.deepStrictEqual(after, before);
});

test("amounts are rounded to two places before they are written", () => {
  const amountOf = (n) => field(Q.build(base(), n), "54")[1];
  assert.strictEqual(amountOf(0.5), "0.50");
  assert.strictEqual(amountOf(99.999), "100.00");
  assert.strictEqual(amountOf(1234.5), "1234.50");
  assert.strictEqual(amountOf(9999999.99), "9999999.99");
});

test("build refuses amounts outside the QR range", () => {
  const msg = "Amount must be between 0.01 and 9,999,999.99";
  for (const bad of [-5, NaN, Infinity, 1e9, "500"]) assert.throws(() => Q.build(base(), bad), { message: msg });
  assert.doesNotThrow(() => Q.build(base(), 9999999.99));
  assert.doesNotThrow(() => Q.build(base(), 0.01));
});

test("build refuses a stored payload that is not valid", () => {
  assert.throws(() => Q.build("hello world, not a payload", 10), { message: "Stored QR payload is not valid" });
  assert.throws(() => Q.build("", 10), { message: "Stored QR payload is not valid" });
});

/* ---------------- references ---------------- */

test("reference (tag 62 / sub 01) is detected, regenerated and re-injected", () => {
  const r = Q.inspect(withRef());
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.hasRef, true);
  assert.strictEqual(r.refPrefix, "ABCDEFGHIJ");
  assert.strictEqual(r.refLen, 20);
  assert.strictEqual(r.srcAmount, 10);

  // base carries the other 62 subfields but no reference
  const baseSub = H.readSub(r.base, "62");
  assert.strictEqual(baseSub.some((x) => x[0] === "01"), false);
  assert.deepStrictEqual(baseSub.find((x) => x[0] === "06"), ["06", "FT"]);

  const ref = Q.makeRef(r.refPrefix, r.refLen);
  assert.strictEqual(ref.length, 20);
  assert.ok(ref.startsWith("ABCDEFGHIJ"));

  const out = Q.build(r.base, 250, ref);
  const sub = H.readSub(out, "62");
  assert.deepStrictEqual(sub[0], ["01", ref]);
  assert.deepStrictEqual(sub.find((x) => x[0] === "06"), ["06", "FT"]);
  const r2 = Q.inspect(out);
  assert.strictEqual(r2.ok, true, r2.error);
  assert.strictEqual(r2.hasRef, true);
  assert.strictEqual(r2.refLen, 20);
});

test("a static build drops the reference and flips back to 11", () => {
  const r = Q.inspect(withRef());
  const staticQr = Q.build(r.base, 0);
  const items = H.parseTLV(staticQr);
  assert.strictEqual(items.find((x) => x[0] === "01")[1], "11");
  assert.strictEqual(items.some((x) => x[0] === "54"), false);
  assert.strictEqual(H.readSub(staticQr, "62").some((x) => x[0] === "01"), false);
  assert.strictEqual(Q.inspect(staticQr).hasRef, false);
});

test("a reference-only tag 62 survives a dynamic rebuild (legacy compatibility)", () => {
  // The engine collapses a 62 that only held the reference when the base is
  // stripped; build() re-creates the container in the same update() call.
  const r = Q.inspect(refOnly62());
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.hasRef, true);
  assert.strictEqual(r.refLen, 20);
  assert.strictEqual(field(r.base, "62"), undefined, "base must not keep an empty tag 62");

  const ref = Q.makeRef(r.refPrefix, r.refLen);
  const out = Q.build(r.base, 250, ref);
  assert.deepStrictEqual(H.readSub(out, "62"), [["01", ref]]);
  assert.strictEqual(Q.inspect(out).ok, true);
  assert.strictEqual(Q.inspect(out).hasRef, true);

  // ...and a static rebuild leaves no empty container behind (unlike the legacy engine)
  assert.strictEqual(field(Q.build(r.base, 0), "62"), undefined);
});

test("no tag 62 is added when no reference is supplied", () => {
  const no62 = standard({ include62: false });
  assert.strictEqual(field(Q.build(no62, 250), "62"), undefined);
  assert.strictEqual(field(Q.build(no62, 250, null), "62"), undefined);
});

/* ---------------- Bangla (UTF-8 byte lengths and char-length legacy) ---------------- */

test("Bangla merchant names use byte lengths and stay valid end to end", () => {
  const b = standard({ name: "হিমেল দাস", city: "ঢাকা" });
  const r = Q.inspect(b);
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.mode, "bytes");
  assert.strictEqual(r.name, "হিমেল দাস");
  assert.strictEqual(field(b, "59")[1], "হিমেল দাস");

  const out = Q.build(r.base, 300);
  const r2 = Q.inspect(out);
  assert.strictEqual(r2.ok, true, r2.error);
  assert.strictEqual(r2.name, "হিমেল দাস");
  assert.strictEqual(r2.city, "ঢাকা");
  assert.strictEqual(r2.srcAmount, 300);
  assert.strictEqual(r2.mode, "bytes");
});

test("generators that count characters instead of bytes are still handled", () => {
  const b = standard({ name: "হিমেল", city: "বগুড়া", mode: "chars" });
  const r = Q.inspect(b);
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.mode, "chars");
  assert.strictEqual(r.name, "হিমেল");
  const out = Q.build(r.base, 42);
  const r2 = Q.inspect(out);
  assert.strictEqual(r2.ok, true, r2.error);
  assert.strictEqual(r2.mode, "chars");
  assert.strictEqual(r2.name, "হিমেল");
  assert.strictEqual(r2.srcAmount, 42);
});

/* ---------------- legacy error copy ---------------- */

test("rejects bad input with the exact historical messages", () => {
  assert.deepStrictEqual(Q.inspect(""), { ok: false, error: MSG.short });
  assert.deepStrictEqual(Q.inspect("hello"), { ok: false, error: MSG.short });
  assert.deepStrictEqual(Q.inspect("hello world this is not a qr"), { ok: false, error: MSG.noChecksum });

  const broken = base().slice(0, -4) + (base().slice(-4) === "0000" ? "1111" : "0000");
  assert.deepStrictEqual(Q.inspect(broken), { ok: false, error: MSG.checksum });
});

test("rejects non-BDT currency and a missing merchant name", () => {
  const usd = rebuild(fields(base()).map((x) => (x[0] === "53" ? ["53", "840"] : x)));
  assert.deepStrictEqual(Q.inspect(usd), { ok: false, error: MSG.currency });

  const noName = rebuild(fields(base()).filter((x) => x[0] !== "59"));
  assert.deepStrictEqual(Q.inspect(noName), { ok: false, error: MSG.name });
});

test("rejects a QR with a missing format indicator", () => {
  const fmtBad = rebuild(fields(base()).map((x) => (x[0] === "00" ? ["00", "02"] : x)));
  assert.deepStrictEqual(Q.inspect(fmtBad), { ok: false, error: MSG.indicator });
});

test("rejects a QR with no account details", () => {
  const items = fields(base()).filter((x) => !(+x[0] >= 2 && +x[0] <= 51));
  assert.deepStrictEqual(Q.inspect(rebuild(items)), { ok: false, error: MSG.account });
});

test("rejects damaged or non-standard TLV with the current phrasing", () => {
  // a nested template that is not TLV: the repo engine is strict
  const malformed62 = rebuild(fields(base()).map((x) => (x[0] === "62" ? ["62", "06"] : x)));
  const r = Q.inspect(malformed62);
  assert.strictEqual(r.ok, false);
  assert.ok(r.error.startsWith("Couldn’t read this QR: "), r.error);
  assert.ok(/tag 62/i.test(r.error), r.error);

  // duplicate top-level tags are invalid
  const dup = rebuild(fields(base()).concat([["54", "100.00"], ["54", "200.00"]]));
  const d = Q.inspect(dup);
  assert.strictEqual(d.ok, false);
  assert.ok(d.error.startsWith("Couldn’t read this QR: "), d.error);
  assert.ok(/appears more than once/.test(d.error), d.error);

  // a damaged top-level TLV that no longer parses at all: standard-format message
  const damaged = (() => {
    const body = base().slice(0, -4);
    const at = body.indexOf("2645");
    assert.ok(at > 0);
    const broken = body.slice(0, at) + "2699" + body.slice(at + 4);
    return broken + "6304" + H.crc16(broken + "6304");
  })();
  assert.deepStrictEqual(Q.inspect(damaged), { ok: false, error: MSG.notStandard });
});

/* ---------------- helpers ---------------- */

test("makeRef keeps the prefix, fills the rest and respects the length", () => {
  const ref = Q.makeRef("ABCDEFGHIJ", 20);
  assert.strictEqual(ref.length, 20);
  assert.ok(ref.startsWith("ABCDEFGHIJ"));
  assert.ok(/^[A-Za-z0-9]+$/.test(ref));
  assert.strictEqual(Q.makeRef("ABCDEFGHIJ", 0), null);
  assert.strictEqual(Q.makeRef("", 6).length, 6);
  assert.strictEqual(Q.makeRef("ABCDEFGHIJ", 4), "ABCD");
});

test("sanitizeAmount accepts Bangla digits, commas and junk", () => {
  assert.strictEqual(Q.sanitizeAmount("১২৫০"), "1250");
  assert.strictEqual(Q.sanitizeAmount("1,250.5"), "1250.5");
  assert.strictEqual(Q.sanitizeAmount("12.345.6"), "12.34");
  assert.strictEqual(Q.sanitizeAmount("abc"), "");
  assert.strictEqual(Q.sanitizeAmount("007"), "7");
  assert.strictEqual(Q.sanitizeAmount("0.5"), "0.5");
  assert.strictEqual(Q.sanitizeAmount(null), "");
});

/* ---------------- delegation: the bundle owns validation and every write ---------------- */

// Load payload.js against a stub engine object, so calls can be observed even
// though the real bundle exposes update/validate as read-only getters.
const plain = (value) => JSON.parse(JSON.stringify(value));

function adapterWithStub(stub) {
  const src = fs.readFileSync(H.ADAPTER, "utf8");
  const sandbox = { console: console, TextEncoder: TextEncoder, TextDecoder: TextDecoder, DeshiQR: stub };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: "payload.js" });
  return sandbox.DeshiQR;
}

test("inspect() validates with the engine and builds its base through engine.update()", () => {
  const calls = [];
  const A = adapterWithStub({
    validate: function (payload, options) {
      calls.push({ fn: "validate", payload: payload, options: options });
      return { ok: true, errors: [], warnings: [] };
    },
    update: function (payload, edits, options) {
      calls.push({ fn: "update", payload: payload, edits: edits, options: options });
      return "BASE_FROM_ENGINE";
    },
  });
  const r = A.inspect(withRef());
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.base, "BASE_FROM_ENGINE");
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[0].fn, "validate");
  assert.deepStrictEqual(plain(calls[0].options), { warnings: false });
  assert.strictEqual(calls[1].fn, "update");
  assert.deepStrictEqual(plain(calls[1].edits), { amount: null, "62/01": null });
  assert.deepStrictEqual(plain(calls[1].options), { warnings: false });
});

test("build() writes through engine.update() — it never encodes a payload itself", () => {
  const calls = [];
  const A = adapterWithStub({
    validate: function () {
      throw new Error("build() must not validate directly");
    },
    update: function (payload, edits, options) {
      calls.push({ payload: payload, edits: edits, options: options });
      return "OUT_FROM_ENGINE";
    },
  });
  const ref = "ABCDEFGHIJKLMNOPQRST";
  assert.strictEqual(A.build(withRef(), 500, ref), "OUT_FROM_ENGINE");
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].payload, withRef());
  assert.deepStrictEqual(plain(calls[0].edits), { amount: 500, "62/01": ref });
  assert.deepStrictEqual(plain(calls[0].options), { warnings: false });

  calls.length = 0;
  assert.strictEqual(A.build(base(), 0), "OUT_FROM_ENGINE");
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(plain(calls[0].edits), { amount: null, "62/01": null });

  // the real adapter returns exactly what the real engine returns
  assert.strictEqual(Q.build(withRef(), 500, ref), engine.update(withRef(), { amount: 500, "62/01": ref }, { warnings: false }));
  assert.strictEqual(Q.build(base(), 0), engine.update(base(), { amount: null }, { warnings: false }));
});

test("build() re-creates a reference-only tag 62 inside the same engine.update() call", () => {
  const r = Q.inspect(refOnly62());
  assert.strictEqual(r.ok, true, r.error);
  const ref = "ABCDEFGHIJ1234567890";
  const calls = [];
  const A = adapterWithStub({
    validate: function () {}, // not used by build()
    update: function (payload, edits, options) {
      calls.push({ payload: payload, edits: edits, options: options });
      return "OUT_FROM_ENGINE";
    },
  });
  assert.strictEqual(A.build(r.base, 250, ref), "OUT_FROM_ENGINE");
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(plain(calls[0].edits), { amount: 250, "62": "01" + String(ref.length).padStart(2, "0") + ref });
  assert.deepStrictEqual(plain(calls[0].options), { warnings: false });

  const expected = engine.update(r.base, calls[0].edits, { warnings: false });
  assert.strictEqual(Q.build(r.base, 250, ref), expected);
  assert.deepStrictEqual(H.readSub(expected, "62"), [["01", ref]]);
});

test("inspect() and build() keep the console clean (warnings suppressed)", () => {
  const originalWarn = console.warn;
  const warned = [];
  console.warn = function () {
    warned.push(Array.prototype.slice.call(arguments).join(" "));
  };
  try {
    assert.strictEqual(Q.inspect(withRef()).ok, true);
    Q.build(base(), 500);
    Q.build(base(), 0);
  } finally {
    console.warn = originalWarn;
  }
  assert.deepStrictEqual(warned, []);
});

/* ---------------- page wiring ---------------- */

test("pages load the vendored engine, then payload.js, not qr.js", () => {
  for (const page of H.PAGES) {
    const html = fs.readFileSync(path.join(__dirname, "..", "public", page), "utf8");
    const vendorAt = html.indexOf("/vendor/deshiqr.global.js");
    const payloadAt = html.indexOf("/js/payload.js");
    assert.ok(vendorAt >= 0, page + " must load /vendor/deshiqr.global.js");
    assert.ok(payloadAt >= 0, page + " must load /js/payload.js");
    assert.ok(vendorAt < payloadAt, page + " must load the bundle before the adapter");
    assert.strictEqual(html.indexOf("/js/qr.js"), -1, page + " must not load the deleted legacy engine");
  }
  // The landing page mounts the live payment demo, so it loads the engine and
  // adapter too — before auth.js, which mounts PayView.
  const index = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const vendorAt = index.indexOf("/vendor/deshiqr.global.js");
  const payloadAt = index.indexOf("/js/payload.js");
  const authAt = index.indexOf("/js/auth.js");
  assert.ok(vendorAt >= 0 && payloadAt >= 0, "index.html must load the engine and adapter for the demo");
  assert.ok(vendorAt < payloadAt && payloadAt < authAt, "index.html: bundle, then adapter, then auth.js");
  assert.strictEqual(index.indexOf("/js/qr.js"), -1, "index.html must not load the deleted legacy engine");
});

console.log("\n" + passed + " passed" + (process.exitCode ? ", some FAILED" : ""));
