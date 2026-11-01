/**
 * The `update` edge function does one thing: payload + edits -> updated payload
 * (+ warnings), or a coded error. These tests pin the pure core
 * (`updateCore`) and the HTTP-shaped contract (`handleUpdateRequest`).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DeshiQrError,
  crc16,
  encodeFields,
  parse,
  update,
} from "../_vendor/core/index.ts";
import {
  MAX_BODY_BYTES,
  handleUpdateRequest,
  updateCore,
  type UpdateCoreResult,
} from "./update-core.ts";

/** Synthetic fixtures only — see docs/demo-payloads.md. */
const STATIC =
  "00020101021126470014bd.org.bb.npsb010202020420020311010000000005204601653030505802BD5910DEMO STORE6005Dhaka62060602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=6304295D";
const DYNAMIC_500 =
  "00020101021226470014bd.org.bb.npsb010202020420020311010000000005204601653030505406500.005802BD5910DEMO STORE6005Dhaka62350125DEMOQR0VZeK2MfbVRI6w36osd0602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=6304F835";
const REFERENCE = "DEMOQR0VZeK2MfbVRI6w36osd";

const ENDPOINT = "http://localhost:54321/functions/v1/update";

function post(body: unknown, init: RequestInit = {}): Request {
  return new Request(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...init,
  });
}

function isCode(code: string) {
  return (error: unknown) => DeshiQrError.is(error) && error.code === code;
}

function duplicateNamePayload(): string {
  const fields = parse(STATIC).filter((field) => field.tag !== "63");
  fields.splice(1, 0, { tag: "59", value: "OTHER STORE" });
  const body = encodeFields(fields) + "6304";
  return body + crc16(body);
}

// ---- updateCore ---------------------------------------------------------

test("omitted edits are validate-only: same payload, no warnings", () => {
  const result = updateCore({ payload: STATIC });
  assert.deepEqual(result, { ok: true, payload: STATIC, warnings: [] });
});

test("empty edits are validate-only too", () => {
  const result = updateCore({ payload: STATIC, edits: {} });
  assert.deepEqual(result, { ok: true, payload: STATIC, warnings: [] });
});

test("validate-only surfaces warnings and honours suppression", () => {
  const edited = update(STATIC, { city: "x".repeat(16) }, { warnings: false });
  const surfaced = updateCore({ payload: edited });
  assert.deepEqual(
    surfaced.warnings.map((warning) => [warning.code, warning.tag]),
    [["FIELD_TOO_LONG", "60"]],
  );

  const suppressed = updateCore({ payload: edited, warnings: ["60"] });
  assert.deepEqual(suppressed.warnings, []);

  const allOff = updateCore({ payload: edited, warnings: false });
  assert.deepEqual(allOff.warnings, []);
});

test("editing amount and reference returns the pinned dynamic payload", () => {
  const result = updateCore({
    payload: STATIC,
    edits: { amount: 500, reference: REFERENCE },
  });
  assert.equal(result.payload, DYNAMIC_500);
  assert.deepEqual(result.warnings, []);
});

test("edits are applied and the payload is re-sealed", () => {
  const result = updateCore({ payload: STATIC, edits: { amount: 1250.5 } });
  assert.match(result.payload.slice(-4), /^[0-9A-F]{4}$/);
  assert.equal(updateCore({ payload: result.payload }).warnings.length, 0);
});

test("RISKY_EDIT warnings are returned and suppressible", () => {
  const risky = updateCore({ payload: STATIC, edits: { name: "NEW STORE" } });
  assert.deepEqual(
    risky.warnings.map((warning) => [warning.code, warning.tag]),
    [["RISKY_EDIT", "59"]],
  );

  const suppressed = updateCore({ payload: STATIC, edits: { name: "NEW STORE" }, warnings: ["59"] });
  assert.deepEqual(suppressed.warnings, []);

  const off = updateCore({ payload: STATIC, edits: { name: "NEW STORE" }, warnings: false });
  assert.deepEqual(off.warnings, []);
});

test("invalid payloads throw coded errors", () => {
  assert.throws(() => updateCore({ payload: "" }), isCode("EMPTY_PAYLOAD"));
  assert.throws(() => updateCore({ payload: 42 }), isCode("EMPTY_PAYLOAD"));
  assert.throws(() => updateCore({ payload: "x".repeat(5000) }), isCode("UNSUPPORTED"));
  assert.throws(() => updateCore({ payload: "000201010211" }), isCode("MISSING_FIELD"));
  assert.throws(() => updateCore({ payload: STATIC.slice(0, -4) + "0000" }), isCode("CHECKSUM_MISMATCH"));
  assert.throws(() => updateCore({ payload: STATIC.slice(0, -12) }), isCode("BAD_TLV"));
});

test("invalid edits throw coded errors", () => {
  assert.throws(() => updateCore({ payload: STATIC, edits: { amount: -1 } }), isCode("BAD_AMOUNT"));
  assert.throws(() => updateCore({ payload: STATIC, edits: { "63": "0000" } }), isCode("BAD_TAG"));
  assert.throws(() => updateCore({ payload: STATIC, edits: "nope" }), isCode("BAD_VALUE"));
  assert.throws(() => updateCore({ payload: STATIC, warnings: "all" }), isCode("BAD_VALUE"));
});

test("duplicate tags in the input are rejected", () => {
  assert.throws(() => updateCore({ payload: duplicateNamePayload() }), isCode("DUPLICATE_TAG"));
});

test("a non-object request body is rejected", () => {
  assert.throws(() => updateCore([]), isCode("BAD_VALUE"));
  assert.throws(() => updateCore("payload"), isCode("BAD_VALUE"));
});

// ---- HTTP contract ------------------------------------------------------

test("POST returns 200 with ok/payload/warnings and default CORS", async () => {
  const response = await handleUpdateRequest(
    post({ payload: STATIC, edits: { amount: 500, reference: REFERENCE } }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  const body = (await response.json()) as UpdateCoreResult;
  assert.equal(body.ok, true);
  assert.equal(body.payload, DYNAMIC_500);
  assert.deepEqual(body.warnings, []);
});

test("OPTIONS returns 204 with CORS headers", async () => {
  const response = await handleUpdateRequest(
    new Request(ENDPOINT, { method: "OPTIONS" }),
    { corsOrigin: "https://example.com" },
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://example.com");
  assert.equal(response.headers.get("access-control-allow-methods"), "POST, OPTIONS");
  assert.equal(response.headers.get("vary"), "origin");
});

test("a configured CORS origin is echoed on JSON responses", async () => {
  const response = await handleUpdateRequest(post({ payload: STATIC }), {
    corsOrigin: "https://shop.example",
  });
  assert.equal(response.headers.get("access-control-allow-origin"), "https://shop.example");
});

test("wrong method returns 405 METHOD_NOT_ALLOWED", async () => {
  const response = await handleUpdateRequest(new Request(ENDPOINT, { method: "GET" }));
  assert.equal(response.status, 405);
  const body = (await response.json()) as { ok: false; error: { code: string } };
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "METHOD_NOT_ALLOWED");
});

test("unknown route returns 404 NOT_FOUND", async () => {
  const response = await handleUpdateRequest(
    new Request("http://localhost/functions/v1/qr", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: STATIC }),
    }),
  );
  assert.equal(response.status, 404);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, "NOT_FOUND");
});

test("invalid JSON returns 400 BAD_REQUEST", async () => {
  const response = await handleUpdateRequest(
    new Request(ENDPOINT, { method: "POST", body: "{not json" }),
  );
  assert.equal(response.status, 400);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, "BAD_REQUEST");
});

test("a non-object JSON body returns 400 BAD_REQUEST", async () => {
  const response = await handleUpdateRequest(post([1, 2, 3]));
  assert.equal(response.status, 400);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, "BAD_REQUEST");
});

test("oversized bodies return 413 UNSUPPORTED", async () => {
  const raw = JSON.stringify({ payload: "x".repeat(MAX_BODY_BYTES) });
  const response = await handleUpdateRequest(
    new Request(ENDPOINT, { method: "POST", body: raw }),
  );
  assert.equal(response.status, 413);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, "UNSUPPORTED");
});

test("input errors map to 400 with the DeshiQrError code and tag", async () => {
  const badAmount = await handleUpdateRequest(post({ payload: STATIC, edits: { amount: -1 } }));
  assert.equal(badAmount.status, 400);
  const body = (await badAmount.json()) as { ok: false; error: { code: string; tag?: string } };
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "BAD_AMOUNT");
  assert.equal(body.error.tag, "54");
});

test("payloads longer than 4096 characters map to 413", async () => {
  const response = await handleUpdateRequest(post({ payload: "0".repeat(4097) }));
  assert.equal(response.status, 413);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, "UNSUPPORTED");
});

test("validate-only over HTTP returns the same payload and warnings", async () => {
  const response = await handleUpdateRequest(post({ payload: STATIC, edits: {} }));
  assert.equal(response.status, 200);
  const body = (await response.json()) as UpdateCoreResult;
  assert.equal(body.payload, STATIC);
  assert.deepEqual(body.warnings, []);
});
