/**
 * Package invariants: zero runtime dependencies, no non-relative runtime
 * imports, ESM/CJS/types outputs declared, and the public API surface.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import * as publicApi from "../src/index.ts";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
  name: string;
  sideEffects: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  files: string[];
  main: string;
  module: string;
  types: string;
  exports: Record<string, Record<string, string>>;
};

test("package manifest has no runtime dependencies", () => {
  assert.equal(packageJson.name, "deshiqr-qr");
  assert.equal(packageJson.dependencies, undefined, "dependencies must not be declared");
  assert.deepEqual(Object.keys(packageJson.dependencies ?? {}), []);
  assert.equal(packageJson.sideEffects, false, "sideEffects: false is required for tree shaking");
});

test("package manifest publishes ESM, CJS and type declarations", () => {
  assert.equal(packageJson.module, "./dist/index.js");
  assert.equal(packageJson.main, "./dist/index.cjs");
  assert.equal(packageJson.types, "./dist/index.d.ts");
  assert.equal(packageJson.exports["."].import, "./dist/index.js");
  assert.equal(packageJson.exports["."].require, "./dist/index.cjs");
  assert.equal(packageJson.exports["."].types, "./dist/index.d.ts");
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
  const sourceDirectory = join(packageRoot, "src");
  const sourceFiles = readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"));
  assert.ok(sourceFiles.length >= 4, "source is split into multiple modules");

  for (const file of sourceFiles) {
    const source = readFileSync(join(sourceDirectory, file), "utf8");
    const specifiers: string[] = [];
    for (const match of source.matchAll(/\bfrom\s+["']([^"']+)["']/g)) specifiers.push(match[1]);
    for (const match of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) specifiers.push(match[1]);

    for (const specifier of specifiers) {
      assert.ok(specifier.startsWith("."), `${file}: runtime import "${specifier}" must be relative`);
      assert.ok(specifier.endsWith(".ts"), `${file}: relative imports use explicit .ts extensions`);
    }
    assert.equal(/requires?\s*\(/.test(source), false, `${file}: must not use require()`);
    assert.equal(/\bfrom\s+["'](?:qrcode|jsqr)["']/.test(source), false, `${file}: test oracles must not leak into src`);
  }
});

test("public API exposes exactly the documented runtime surface", () => {
  assert.deepEqual(Object.keys(publicApi).sort(), [
    "encode",
    "getVersionCapacity",
    "toSvg",
    "toSvgPath",
    "toTerminal",
  ]);
  for (const value of Object.values(publicApi)) assert.equal(typeof value, "function");
});
