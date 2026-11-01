/*
 * Keeps the reserved-username list in sync between the site and the database.
 *
 * The site rejects reserved names at signup (site/public/js/common.js RESERVED);
 * the database is the real gate (public.is_reserved_username() in the newest
 * migration). If the two drift, a name can be allowed by one and refused by the
 * other, so this test fails when they differ.
 */
const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");

function clientReserved() {
  const file = path.join(__dirname, "..", "public", "js", "common.js");
  const src = fs.readFileSync(file, "utf8");
  const start = src.indexOf("var RESERVED = new Set(");
  const end = src.indexOf('.split(",")', start);
  assert.ok(start >= 0 && end > start, "common.js must define RESERVED");
  let body = src.slice(start + "var RESERVED = new Set(".length, end).trim();
  body = body.replace(/^\(\s*/, "").replace(/\s*\)$/, "");
  const names = JSON.parse("[" + body + "]");
  assert.ok(Array.isArray(names) && names.length > 0, "RESERVED must be a non-empty list");
  return names;
}

function sqlReserved() {
  const dir = path.join(__dirname, "..", "..", "supabase", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const src = fs.readFileSync(path.join(dir, files[i]), "utf8");
    const m = src.match(/select\s+u = any \(array\[([\s\S]*?)\]\);/);
    if (!m) continue;
    const names = [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
    return { file: files[i], names };
  }
  throw new Error("no migration defines public.is_reserved_username()");
}

const site = clientReserved();
const db = sqlReserved();

assert.equal(new Set(site).size, site.length, "site RESERVED has duplicates");
assert.equal(new Set(db.names).size, db.names.length, "SQL reserved list has duplicates");
for (const n of [...site, ...db.names]) {
  assert.ok(/^[a-z0-9-]+$/.test(n), "reserved name has an invalid character: " + n);
}
assert.ok(site.length >= 150, "reserved list should be substantial (got " + site.length + ")");
assert.deepEqual(site.slice().sort(), db.names.slice().sort(), "site RESERVED and " + db.file + " are out of sync");

console.log(site.length + " reserved usernames, in sync with " + db.file);
