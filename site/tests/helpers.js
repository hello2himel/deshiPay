/*
 * Test helpers for the site engine adapter (plain Node, no dependencies).
 *
 * The vendored browser bundle is a classic script that declares a top-level
 * `var DeshiQR`; evaluate it inside a function so the test process can grab the
 * object, publish it as `globalThis.DeshiQR` (what the browser does with
 * `window.DeshiQR`) and then require the site adapter.
 *
 * The TLV/CRC helpers below are FIXTURE-ONLY: they exist so the tests can build
 * synthetic checksum-valid payloads without shipping real account data. The site
 * itself never uses them — the adapter delegates every write to the bundle.
 */
const fs = require("fs");
const path = require("path");

const VENDOR = path.join(__dirname, "..", "public", "vendor", "deshiqr.global.js");
const ADAPTER = path.join(__dirname, "..", "public", "js", "payload.js");
const PAGES = ["app.html", "pay.html"];

/** Read the vendored bundle and evaluate it, returning its DeshiQR object. */
function loadEngine() {
  if (globalThis.DeshiQR && typeof globalThis.DeshiQR.update === "function") return globalThis.DeshiQR;
  const source = fs.readFileSync(VENDOR, "utf8");
  // eslint-disable-next-line no-new-func
  const engine = new Function(source + "\n;return DeshiQR;")();
  if (!engine || typeof engine.update !== "function" || typeof engine.validate !== "function") {
    throw new Error("vendored deshiqr bundle did not expose update()/validate()");
  }
  globalThis.DeshiQR = engine;
  return engine;
}

/** Load the engine bundle, then the site adapter (same order as the HTML pages). */
function loadAdapter() {
  loadEngine();
  return require(ADAPTER);
}

/* ---------------- fixture-only TLV + CRC (never used by the site) ---------------- */

const enc8 = new TextEncoder();
const dec8 = new TextDecoder();

function crc16(str) {
  let c = 0xffff;
  const bytes = enc8.encode(str);
  for (let k = 0; k < bytes.length; k += 1) {
    c ^= bytes[k] << 8;
    for (let i = 0; i < 8; i += 1) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
  }
  return c.toString(16).toUpperCase().padStart(4, "0");
}

function lengthOf(value, mode) {
  return mode === "bytes" ? enc8.encode(value).length : value.length;
}

/** Encode a level of fields; mode defaults to UTF-8 bytes (EMVCo). */
function encodeTLV(items, mode) {
  mode = mode || "bytes";
  return items
    .map((it) => {
      const len = lengthOf(it[1], mode);
      if (len > 99) throw new Error("fixture value too long for tag " + it[0]);
      return it[0] + String(len).padStart(2, "0") + it[1];
    })
    .join("");
}

/** Parse one TLV level; mode defaults to UTF-8 bytes (EMVCo). */
function parseTLV(str, mode) {
  mode = mode || "bytes";
  const out = [];
  let i = 0;
  if (mode === "bytes") {
    const b = enc8.encode(str);
    while (i < b.length) {
      const tag = dec8.decode(b.subarray(i, i + 2));
      const len = parseInt(dec8.decode(b.subarray(i + 2, i + 4)), 10);
      out.push([tag, dec8.decode(b.subarray(i + 4, i + 4 + len))]);
      i += 4 + len;
    }
    return out;
  }
  while (i < str.length) {
    const tag = str.slice(i, i + 2);
    const len = parseInt(str.slice(i + 2, i + 4), 10);
    out.push([tag, str.slice(i + 4, i + 4 + len)]);
    i += 4 + len;
  }
  return out;
}

/** Build the full payload (body + "6304" + CRC) for a level of fields. */
function make(items, mode) {
  const body = encodeTLV(items, mode) + "6304";
  return body + crc16(body);
}

/** Read one nested template value (fixture convenience). */
function readSub(payload, tag, mode) {
  const field = parseTLV(payload, mode).find((x) => x[0] === tag);
  return field ? parseTLV(field[1], mode) : [];
}

module.exports = {
  VENDOR,
  ADAPTER,
  PAGES,
  loadEngine,
  loadAdapter,
  crc16,
  encodeTLV,
  parseTLV,
  make,
  readSub,
};
