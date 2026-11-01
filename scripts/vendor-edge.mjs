#!/usr/bin/env node
/**
 * Vendor the dependency-free payload core into `supabase/functions/_vendor/core`
 * so the Deno edge function (`update`) can import it directly. Supabase bundles
 * the function directory; it cannot resolve pnpm workspace packages.
 *
 * Only `packages/deshiqr/src/core` is vendored — QR encoding is not part of the
 * product anymore, so `_vendor/qr` is removed when it is found.
 *
 * Run: node scripts/vendor-edge.mjs
 * Generated files are committed so `supabase functions deploy update` works from
 * a clean clone. The script is idempotent: running it twice produces identical
 * files.
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_SRC = "packages/deshiqr/src";
const FROM = join(root, PACKAGE_SRC, "core");
const TO = join(root, "supabase/functions/_vendor/core");
const LEGACY_QR = join(root, "supabase/functions/_vendor/qr");

const HEADER = `// GENERATED FILE - do not edit.\n// Source: ${PACKAGE_SRC}/core\n// Regenerate with: node scripts/vendor-edge.mjs\n`;

async function copyTree(from, to) {
  await rm(to, { recursive: true, force: true });
  await mkdir(to, { recursive: true });
  const entries = (await readdir(from, { withFileTypes: true })).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
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

// QR encoding was removed from the product: never ship the old vendored copy.
await rm(LEGACY_QR, { recursive: true, force: true });

await copyTree(FROM, TO);

console.log(`removed ${relative(root, LEGACY_QR)} (if present)`);
console.log(`vendored ${relative(root, FROM)} -> ${relative(root, TO)}`);
console.log("done. deploy with: supabase functions deploy update --no-verify-jwt");
