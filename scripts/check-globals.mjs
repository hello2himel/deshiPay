#!/usr/bin/env node
/**
 * Verifies the single browser (`<script src>`) bundle of the unified `deshiqr` package.
 *
 * A plain HTML page with no bundler must be able to load one file — `dist/deshiqr.global.js` — and
 * get exactly one global, `DeshiQR`, that decodes/validates/derives payloads, encodes QR Codes and
 * renders SVG, and that auto-registers `<deshiqr-pay>`. The bundle is executed in a bare `vm`
 * context that only provides browser globals (TextEncoder/TextDecoder/crypto) and **no DOM**, so any
 * accidental Node dependency (`require`, `fs`, `process`) or top-level DOM access fails this check.
 *
 * Run after `pnpm build:libs`: `node scripts/check-globals.mjs`
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_DIR = "packages/deshiqr";
const BUNDLE = `${PACKAGE_DIR}/dist/deshiqr.global.js`;

/** Synthetic fixtures from docs/demo-payloads.md — never use real merchant data here. */
const STATIC =
  "00020101021126470014bd.org.bb.npsb010202020420020311010000000005204601653030505802BD5910DEMO STORE6005Dhaka62060602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=6304295D";
const DYNAMIC_500 =
  "00020101021226470014bd.org.bb.npsb010202020420020311010000000005204601653030505406500.005802BD5910DEMO STORE6005Dhaka62350125DEMOQR0VZeK2MfbVRI6w36osd0602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=6304F835";
const REFERENCE = "DEMOQR0VZeK2MfbVRI6w36osd";

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * The browser-only globals the bundle is allowed to use. Deliberately no `document`/`window`: the
 * bundle has to survive being loaded where there is no DOM.
 */
function browserGlobals() {
  return { TextEncoder, TextDecoder, crypto: globalThis.crypto };
}

/** Load the IIFE bundle the way a browser would, into a fresh global scope. */
function loadBundle(code, extraGlobals = {}) {
  const sandbox = { ...browserGlobals(), ...extraGlobals };
  vm.runInNewContext(code, sandbox, { filename: BUNDLE });
  return sandbox;
}

assert(existsSync(resolve(ROOT, BUNDLE)), `${BUNDLE} is missing — run \`pnpm build:libs\``);
const code = readFileSync(resolve(ROOT, BUNDLE), "utf8");
assert(!/\brequire\s*\(/.test(code), `${BUNDLE} contains require() — not a browser bundle`);

console.log(`${BUNDLE} (window.DeshiQR)`);
const sandbox = loadBundle(code);
const DeshiQR = sandbox.DeshiQR;
assert(DeshiQR && typeof DeshiQR === "object", `global \`DeshiQR\` was not defined by ${BUNDLE}`);

check("defines exactly one global (`DeshiQR`)", () => {
  assert(sandbox.DeshiQRQR === undefined, "stale DeshiQRQR global is still defined");
  assert(sandbox.DeshiQrElement === undefined, "stale DeshiQrElement global is still defined");
});

check("exposes the payload API", () => {
  for (const name of [
    "crc16",
    "parse",
    "decode",
    "validate",
    "toStatic",
    "withAmount",
    "build",
    "newReference",
    "formatTaka",
    "maskAccount",
    "verifyChecksum",
  ]) {
    assert(typeof DeshiQR[name] === "function", `missing export ${name}()`);
  }
});

check("exposes the QR encoder and renderers", () => {
  for (const name of ["encode", "getVersionCapacity", "toSvg", "toSvgPath", "toTerminal"]) {
    assert(typeof DeshiQR[name] === "function", `missing export ${name}()`);
  }
});

check("exposes the <deshiqr-pay> element API", () => {
  assert(typeof DeshiQR.DeshiQrPay === "function", "missing export DeshiQrPay");
  assert(typeof DeshiQR.defineDeshiQrPay === "function", "missing export defineDeshiQrPay()");
});

check("crc16 matches the pinned vector", () => {
  assert(DeshiQR.crc16("123456789") === "29B1", `got ${DeshiQR.crc16("123456789")}`);
});

check("decode reads the static fixture", () => {
  const qr = DeshiQR.decode(STATIC);
  assert(qr.kind === "static", `kind=${qr.kind}`);
  assert(qr.amount === null, `amount=${qr.amount}`);
  assert(qr.merchant.account === "01000000000", `account=${qr.merchant.account}`);
  assert(qr.merchant.name === "DEMO STORE", `name=${qr.merchant.name}`);
  assert(qr.merchant.institution === "bd.org.bb.npsb", `institution=${qr.merchant.institution}`);
  assert(qr.checksum === "295D", `checksum=${qr.checksum}`);
});

check("withAmount reproduces the pinned dynamic fixture byte for byte", () => {
  assert(
    DeshiQR.withAmount(STATIC, 500, { reference: REFERENCE }) === DYNAMIC_500,
    "derived payload differs from docs/demo-payloads.md",
  );
});

check("toStatic round-trips the dynamic fixture", () => {
  assert(DeshiQR.toStatic(DYNAMIC_500) === STATIC, "toStatic(dynamic) !== static fixture");
});

check("decode reads the dynamic fixture", () => {
  const qr = DeshiQR.decode(DYNAMIC_500);
  assert(qr.kind === "dynamic", `kind=${qr.kind}`);
  assert(qr.amount === 500, `amount=${qr.amount}`);
  assert(qr.reference === REFERENCE, `reference=${qr.reference}`);
  assert(qr.customerLabel === "FT", `customerLabel=${qr.customerLabel}`);
});

check("validate rejects a damaged checksum with a coded error", () => {
  const report = DeshiQR.validate(STATIC.slice(0, -4) + "0000");
  assert(report.ok === false, "expected ok=false");
  assert(
    report.errors.some((error) => error.code === "CHECKSUM_MISMATCH"),
    `codes=${report.errors.map((error) => error.code).join(",")}`,
  );
});

check("decode throws DeshiQrError with a code", () => {
  let thrown = null;
  try {
    DeshiQR.decode("000201010211"); // valid TLV, but no tag 63 checksum
  } catch (error) {
    thrown = error;
  }
  assert(thrown !== null, "expected decode() to throw");
  assert(thrown.code === "MISSING_FIELD", `code=${thrown.code}`);
});

check("newReference produces a 25-character default and honours a prefix", () => {
  assert(DeshiQR.newReference().length === 25, "default reference length");
  const prefixed = DeshiQR.newReference({ prefix: "FT80" });
  assert(prefixed.startsWith("FT80") && prefixed.length === 25, `got ${prefixed}`);
});

check("payload → QR pipeline: encodes and renders deterministic, script-free SVG", () => {
  const payload = DeshiQR.withAmount(STATIC, 500, { reference: REFERENCE });
  const matrix = DeshiQR.encode(payload, { level: "M" });
  assert(matrix.size > 0 && matrix.version >= 1, `size=${matrix.size} version=${matrix.version}`);
  const svg = DeshiQR.toSvg(matrix, { margin: 4, scale: 8 });
  assert(svg.startsWith("<svg"), "SVG does not start with <svg");
  assert(!svg.includes("<script"), "SVG contains a script tag");
  assert(
    svg ===
      DeshiQR.toSvg(DeshiQR.encode(DeshiQR.withAmount(STATIC, 500, { reference: REFERENCE })), {
        margin: 4,
        scale: 8,
      }),
    "SVG is not deterministic",
  );
});

check("the same bundle auto-registers <deshiqr-pay> when a DOM registry exists", () => {
  const registered = new Map();
  const registry = {
    get: (name) => registered.get(name),
    define: (name, constructor) => registered.set(name, constructor),
  };
  const domSandbox = loadBundle(code, {
    customElements: registry,
    HTMLElement: class HTMLElement {},
  });
  assert(registered.has("deshiqr-pay"), "the bundle did not register <deshiqr-pay>");
  assert(typeof registered.get("deshiqr-pay") === "function", "registered value is not a constructor");
  assert(
    domSandbox.DeshiQR.DeshiQrPay === registered.get("deshiqr-pay"),
    "the registered element is not the exported DeshiQrPay class",
  );
});

console.log("\npackage.json CDN fields and dist artifacts (single package)");
check("the build produces the documented dist artifacts", () => {
  for (const file of [
    "dist/index.js",
    "dist/index.cjs",
    "dist/index.d.ts",
    "dist/element.js",
    "dist/element.d.ts",
    "dist/deshiqr.global.js",
  ]) {
    assert(existsSync(resolve(ROOT, PACKAGE_DIR, file)), `${PACKAGE_DIR}/${file} is missing`);
  }
});

check("package.json points unpkg/jsdelivr at the one browser bundle", () => {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, PACKAGE_DIR, "package.json"), "utf8"));
  assert(manifest.name === "deshiqr", `name=${manifest.name}`);
  for (const field of ["unpkg", "jsdelivr"]) {
    assert(
      manifest[field] === "./dist/deshiqr.global.js",
      `${field}=${manifest[field]} (expected ./dist/deshiqr.global.js)`,
    );
    assert(
      existsSync(resolve(ROOT, PACKAGE_DIR, manifest[field])),
      `${PACKAGE_DIR}/${manifest[field]} is missing — run \`pnpm build:libs\``,
    );
  }
});

if (failures > 0) {
  console.error(`\n${failures} browser-bundle check(s) failed.`);
  process.exit(1);
}
console.log("\nall browser-bundle checks passed.");
