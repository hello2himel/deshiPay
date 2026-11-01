/**
 * Package invariants: zero runtime dependencies, no non-relative runtime
 * imports, ESM/CJS/types outputs declared, the `deshiqr/element` subpath and
 * the public QR API surface.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import * as publicApi from "../../src/qr/index.ts";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
  name: string;
  sideEffects: string[] | boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  files: string[];
  main: string;
  module: string;
  types: string;
  unpkg: string;
  jsdelivr: string;
  exports: Record<string, Record<string, string> | string>;
};

/** Every `.ts` file under a directory, recursively. */
function sourceFiles(directory: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (entry.name.endsWith(".ts")) out.push(path);
  }
  return out;
}

test("package manifest has no runtime dependencies", () => {
  assert.equal(packageJson.name, "deshiqr");
  assert.equal(packageJson.dependencies, undefined, "dependencies must not be declared");
  assert.deepEqual(Object.keys(packageJson.dependencies ?? {}), []);
  // Only the element and the browser bundle may have import side effects; the
  // main entry stays tree-shakable.
  assert.notEqual(packageJson.sideEffects, false, "sideEffects: false would break the element bundle");
  assert.deepEqual(packageJson.sideEffects, ["./dist/element.js", "./dist/deshiqr.global.js"]);
});

test("package manifest publishes ESM, CJS, type declarations and the element subpath", () => {
  assert.equal(packageJson.module, "./dist/index.js");
  assert.equal(packageJson.main, "./dist/index.cjs");
  assert.equal(packageJson.types, "./dist/index.d.ts");
  assert.equal(packageJson.unpkg, "./dist/deshiqr.global.js");
  assert.equal(packageJson.jsdelivr, "./dist/deshiqr.global.js");

  const root = packageJson.exports["."] as Record<string, string>;
  assert.equal(root.import, "./dist/index.js");
  assert.equal(root.require, "./dist/index.cjs");
  assert.equal(root.types, "./dist/index.d.ts");

  const element = packageJson.exports["./element"] as Record<string, string>;
  assert.equal(element.import, "./dist/element.js");
  assert.equal(element.types, "./dist/element.d.ts");
  assert.equal(packageJson.exports["./package.json"], "./package.json");

  assert.ok(packageJson.files.includes("dist"));
  assert.ok(packageJson.files.includes("README.md"));
});

test("the only dev dependencies are test/build tooling", () => {
  const dev = packageJson.devDependencies ?? {};
  for (const name of ["jsqr", "qrcode", "tsup", "typescript"]) {
    assert.ok(name in dev, `expected devDependency ${name}`);
  }
});

test("source files import only from inside the package", () => {
  const files = sourceFiles(join(packageRoot, "src"));
  assert.ok(files.length >= 4, "source is split into multiple modules");

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const specifiers: string[] = [];
    for (const match of source.matchAll(/\bfrom\s+["']([^"']+)["']/g)) specifiers.push(match[1]);
    for (const match of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) specifiers.push(match[1]);

    for (const specifier of specifiers) {
      assert.ok(specifier.startsWith("."), `${file}: runtime import "${specifier}" must be relative`);
      assert.ok(specifier.endsWith(".ts"), `${file}: relative imports use explicit .ts extensions`);
    }
    assert.equal(/requires?\s*\(/.test(source), false, `${file}: must not use require()`);
    assert.equal(
      /\bfrom\s+["'](?:qrcode|jsqr)["']/.test(source),
      false,
      `${file}: test oracles must not leak into src`,
    );
  }
});

test("public QR API exposes exactly the documented runtime surface", () => {
  assert.deepEqual(Object.keys(publicApi).sort(), [
    "encode",
    "getVersionCapacity",
    "toSvg",
    "toSvgPath",
    "toTerminal",
  ]);
  for (const value of Object.values(publicApi)) assert.equal(typeof value, "function");
});
