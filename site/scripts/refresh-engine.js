#!/usr/bin/env node
/*
 * Copies the browser bundle built from the repo's deshiqr package into this
 * site's vendor directory:
 *
 *   packages/deshiqr/dist/deshiqr.global.js      -> public/vendor/deshiqr.global.js
 *   packages/deshiqr/dist/deshiqr.global.js.map  -> public/vendor/deshiqr.global.js.map
 *
 * The copy is committed so the static site works on Netlify without the
 * monorepo's build tooling. Run this after `pnpm build:libs` (from the repo
 * root) whenever the engine changes.
 *
 * Usage (from site/):
 *   node scripts/refresh-engine.js           copy the current bundle into public/vendor/
 *   node scripts/refresh-engine.js --check   verify the vendor copy is byte-identical; exit 1 if stale
 */
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..", "..");
const siteRoot = path.join(__dirname, "..");
const distDir = path.join(repoRoot, "packages", "deshiqr", "dist");
const vendorDir = path.join(siteRoot, "public", "vendor");
const files = ["deshiqr.global.js", "deshiqr.global.js.map"];

const checkOnly = process.argv.includes("--check");
const unknown = process.argv.slice(2).filter((a) => a !== "--check" && a !== "--help");

function fail(message) {
  console.error("[refresh-engine] " + message);
  process.exit(1);
}

if (unknown.length) {
  console.error("[refresh-engine] unknown argument: " + unknown.join(" "));
  console.error("usage: node scripts/refresh-engine.js [--check]");
  process.exit(1);
}

if (process.argv.includes("--help")) {
  console.log("usage: node scripts/refresh-engine.js [--check]");
  console.log("  (no flags)  copy packages/deshiqr/dist/deshiqr.global.js[.map] into public/vendor/");
  console.log("  --check     compare public/vendor/ copies with dist; exit 1 if stale or missing");
  process.exit(0);
}

const sources = files.map((name) => ({ name, from: path.join(distDir, name), to: path.join(vendorDir, name) }));
const missingDist = sources.filter((s) => !fs.existsSync(s.from));

if (checkOnly) {
  let stale = false;
  for (const s of sources) {
    if (!fs.existsSync(s.from)) {
      console.error("[refresh-engine] missing " + path.relative(repoRoot, s.from) + " - run `pnpm build:libs` first");
      stale = true;
      continue;
    }
    if (!fs.existsSync(s.to)) {
      console.error("[refresh-engine] STALE: " + path.relative(siteRoot, s.to) + " is missing - run `node scripts/refresh-engine.js`");
      stale = true;
      continue;
    }
    const dist = fs.readFileSync(s.from);
    const vendored = fs.readFileSync(s.to);
    if (!dist.equals(vendored)) {
      console.error("[refresh-engine] STALE: " + path.relative(siteRoot, s.to) + " differs from " + path.relative(repoRoot, s.from));
      stale = true;
    }
  }
  if (stale) process.exit(1);
  console.log("[refresh-engine] OK: public/vendor/ matches " + path.relative(repoRoot, distDir) + "/");
  process.exit(0);
}

if (missingDist.length) {
  fail(
    "missing " +
      missingDist.map((s) => path.relative(repoRoot, s.from)).join(", ") +
      " - run `pnpm build:libs` from the repo root first",
  );
}

fs.mkdirSync(vendorDir, { recursive: true });
for (const s of sources) {
  fs.copyFileSync(s.from, s.to);
  console.log("[refresh-engine] copied " + path.relative(repoRoot, s.from) + " -> " + path.relative(siteRoot, s.to));
}
console.log("[refresh-engine] vendor engine refreshed. Run `node scripts/refresh-engine.js --check` to verify.");
