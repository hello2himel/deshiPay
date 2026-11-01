#!/usr/bin/env node
/**
 * Vendor the dependency-free library sources into `supabase/functions/_vendor/` so the Deno edge
 * function (`qr`) can import them directly (Supabase bundles the function directory; it cannot
 * resolve pnpm workspace packages).
 *
 * The sources live in the single npm package `deshiqr`: `packages/deshiqr/src/core` is vendored to
 * `_vendor/core` and `packages/deshiqr/src/qr` to `_vendor/qr`, so the edge function imports stay
 * `../_vendor/core/index.ts` and `../_vendor/qr/index.ts`.
 *
 * Run: node scripts/vendor-edge.mjs
 * Generated files are committed so `supabase functions deploy qr` works from a clean clone.
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_SRC = "packages/deshiqr/src";
const targets = [
  { from: join(root, PACKAGE_SRC, "core"), to: join(root, "supabase/functions/_vendor/core") },
  { from: join(root, PACKAGE_SRC, "qr"), to: join(root, "supabase/functions/_vendor/qr") },
];

const HEADER = `// GENERATED FILE - do not edit.\n// Source: ${PACKAGE_SRC}/{core,qr}\n// Regenerate with: node scripts/vendor-edge.mjs\n`;

async function copyTree(from, to) {
  await rm(to, { recursive: true, force: true });
  await mkdir(to, { recursive: true });
  const entries = await readdir(from, { withFileTypes: true });
  for (const entry of entries) {
    const src = join(from, entry.name);
    const dest = join(to, entry.name);
    if (entry.isDirectory()) {
      await copyTree(src, dest);
    } else if (entry.name.endsWith(".ts")) {
      const code = await readFile(src, "utf8");
      await writeFile(dest, HEADER + code, "utf8");
    }
  }
}

for (const target of targets) {
  await copyTree(target.from, target.to);
  console.log(`vendored ${relative(root, target.from)} -> ${relative(root, target.to)}`);
}
console.log("done. deploy with: supabase functions deploy qr --no-verify-jwt (payload + amount → QR SVG)");
