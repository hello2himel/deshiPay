import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * The element package must be importable outside a browser: Node has no
 * `HTMLElement` / `customElements`, so registration has to be a guarded no-op.
 */
test("module import registers nothing in Node but exposes the API", async () => {
  const module = await import("../../src/element/index.ts");
  assert.equal(typeof module.DeshiQrPay, "function");
  assert.equal(typeof module.defineDeshiQrPay, "function");
  assert.equal(module.DeshiQrPay.name, "DeshiQrPay");
  assert.deepEqual(module.DeshiQrPay.observedAttributes, [
    "payload",
    "config-url",
    "amount",
    "lock-amount",
    "reference",
    "ref-prefix",
    "ref-length",
    "title",
    "note",
    "presets",
    "theme",
    "size",
    "bare",
  ]);
});

test("defineDeshiQrPay is a safe no-op without a registry", async () => {
  const { defineDeshiQrPay } = await import("../../src/element/index.ts");
  assert.doesNotThrow(() => defineDeshiQrPay(undefined));
});

test("defineDeshiQrPay registers once in a registry", async () => {
  const { defineDeshiQrPay, DeshiQrPay } = await import("../../src/element/index.ts");
  const registered = new Map<string, unknown>();
  const registry = {
    get: (name: string) => registered.get(name),
    define: (name: string, constructor: unknown) => registered.set(name, constructor),
  } as unknown as CustomElementRegistry;
  defineDeshiQrPay(registry);
  defineDeshiQrPay(registry); // second call must not throw
  assert.equal(registered.get("deshiqr-pay"), DeshiQrPay);
  assert.equal(registered.size, 1);
});
