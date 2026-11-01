#!/usr/bin/env node
/**
 * deshiQR — Node server example: create an order, get a dynamic Bangla QR + SVG back.
 *
 * Framework-free on purpose: no dependencies are installed in this repo for examples, so
 * this uses Node's built-in `node:http`. The route table maps 1:1 to Express — see
 * examples/README.md for the six-line Express version.
 *
 *   POST /order                 { amount, note?, reference? } -> { id, amount, reference, payload, qr_svg }
 *   GET  /order/:id             order status (pending | paid)
 *   GET  /order/:id/qr.svg      the QR image (also returned inline by POST /order)
 *   POST /order/:id/paid        manual "mark paid" stub (confirmation is your job: deshiQR
 *                               only encodes what the payer should send)
 *
 * The payload/QR code comes from the workspace package (npm: deshiqr):
 *   packages/deshiqr   payload derivation + QR encoder + SVG renderer
 *
 * Run from the repo root:
 *   pnpm build:libs
 *   node examples/node-express/server.mjs
 *
 * All data here is synthetic (docs/demo-payloads.md). "Mark paid" is a stub: deshiQR never
 * moves or custody funds and cannot verify a bKash/Nagad/Rocket payment on its own.
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

// Resolve the workspace package whether it is linked (installed as a dep) or only built
// locally (`pnpm build:libs` writes packages/deshiqr/dist). Dynamic import keeps the fallback honest.
async function loadLibrary(name, builtPath) {
  try {
    return await import(name);
  } catch {
    return await import(new URL(builtPath, import.meta.url).href);
  }
}

const {
  MAX_AMOUNT,
  amountToField,
  build,
  encode,
  formatTaka,
  referenceFrom,
  toSvg,
  validate,
  verifyChecksum,
} = await loadLibrary("deshiqr", "../../packages/deshiqr/dist/index.js");

// Synthetic static payload from docs/demo-payloads.md — account 01000000000, DEMO STORE.
const DEMO_STATIC_PAYLOAD =
  "00020101021126470014bd.org.bb.npsb010202020420020311010000000005204601653030505802BD5910DEMO STORE6005Dhaka62060602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=6304295D";

const PORT = Number(process.env.PORT ?? 8787);
const OWNER = "DEMO STORE";
const REFERENCE_LENGTH = 25; // real bKash dynamic QRs carry 25-character bill numbers

/** @type {Map<string, {id: string, amount: number, reference: string, payload: string, svg: string, note: string, status: "pending" | "paid", createdAt: string, paidAt: string | null}>} */
const orders = new Map();

const REFERENCE_RE = /^[\x20-\x7E]{1,32}$/;

class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function coerceAmount(value) {
  const numeric =
    typeof value === "string" && /^\d+(?:\.\d{1,2})?$/.test(value.trim()) ? Number(value.trim()) : value;
  if (typeof numeric !== "number" || !Number.isFinite(numeric) || numeric <= 0 || numeric > MAX_AMOUNT) {
    throw new ApiError("INVALID_AMOUNT", `amount must be between 0.01 and ${MAX_AMOUNT} BDT`);
  }
  const cents = Math.round(numeric * 100);
  if (Math.abs(numeric * 100 - cents) > 1e-6 || cents < 1) {
    throw new ApiError("INVALID_AMOUNT", "amount must have at most 2 decimals");
  }
  return cents / 100;
}

/** Generate a reference in the same shape as the core library (prefix + random alphanumerics). */
function makeReference(prefix = "DEMO") {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let reference = prefix.slice(0, REFERENCE_LENGTH);
  while (reference.length < REFERENCE_LENGTH) {
    reference += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return reference;
}

function createOrder(body) {
  const amount = coerceAmount(body?.amount);
  const note = body?.note === undefined ? "" : String(body.note).slice(0, 160);
  let reference = body?.reference;
  if (reference === undefined || reference === null || reference === "") {
    reference = makeReference();
  } else if (typeof reference !== "string" || !REFERENCE_RE.test(reference)) {
    throw new ApiError("BAD_REQUEST", "reference must be 1-32 printable ASCII characters");
  }

  const payload = build(DEMO_STATIC_PAYLOAD, { amount, reference });
  if (!verifyChecksum(payload) || !validate(payload).ok) {
    throw new ApiError("INTERNAL", "derived payload failed validation");
  }
  if (referenceFrom(payload) !== reference) {
    throw new ApiError("INTERNAL", "derived payload does not carry the reference");
  }

  const svg = toSvg(encode(payload), {
    margin: 4,
    title: `${OWNER} — ${formatTaka(amount)}`,
    ariaLabel: `Scan to pay ${formatTaka(amount, { symbol: true })} to ${OWNER}`,
  });

  const order = {
    id: randomUUID(),
    amount,
    reference,
    payload,
    svg,
    note,
    status: "pending",
    createdAt: new Date().toISOString(),
    paidAt: null,
  };
  orders.set(order.id, order);
  return order;
}

function publicOrder(order) {
  return {
    id: order.id,
    amount: order.amount,
    amount_text: amountToField(order.amount),
    reference: order.reference,
    payload: order.payload,
    note: order.note,
    status: order.status,
    created_at: order.createdAt,
    paid_at: order.paidAt,
  };
}

// --- tiny HTTP plumbing -----------------------------------------------------

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function sendJson(response, status, body) {
  const body_ = JSON.stringify(body);
  response.writeHead(status, {
    ...CORS_HEADERS,
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(body_);
}

function sendHtml(response, html) {
  response.writeHead(200, {
    ...CORS_HEADERS,
    "content-type": "text/html; charset=utf-8",
  });
  response.end(html);
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed;
  } catch {
    throw new ApiError("BAD_REQUEST", "request body must be a JSON object");
  }
}

const INDEX_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>deshiQR node example</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px}
input,button{font:inherit;padding:8px;margin:4px 0}pre{background:#f4f4f4;padding:12px;overflow:auto;border-radius:8px}
#qr{max-width:280px}#qr svg{width:100%;height:auto}</style></head>
<body>
<h1>deshiQR Node example</h1>
<p>Synthetic DEMO STORE payload only. Payments are fake; deshiQR never holds funds.</p>
<label>Amount (BDT) <input id="amount" type="number" min="0.01" step="0.01" value="500"></label><br>
<button id="create">Create order</button>
<div id="qr"></div>
<pre id="out">—</pre>
<button id="paid" disabled>Mark paid (manual stub)</button>
<script>
let current = null;
document.getElementById('create').onclick = async () => {
  const amount = Number(document.getElementById('amount').value);
  const res = await fetch('/order', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({amount})});
  const data = await res.json();
  document.getElementById('out').textContent = JSON.stringify(data, null, 2);
  if (data.ok) {
    current = data.order.id;
    document.getElementById('qr').innerHTML = data.qr_svg;
    document.getElementById('paid').disabled = false;
  }
};
document.getElementById('paid').onclick = async () => {
  if (!current) return;
  const res = await fetch('/order/' + current + '/paid', {method:'POST'});
  document.getElementById('out').textContent = JSON.stringify(await res.json(), null, 2);
  document.getElementById('paid').disabled = true;
};
</script>
</body></html>`;

const server = createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") {
      response.writeHead(204, CORS_HEADERS);
      response.end();
      return;
    }

    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const path = url.pathname;

    if (request.method === "GET" && (path === "/" || path === "/index.html")) {
      sendHtml(response, INDEX_HTML);
      return;
    }

    if (request.method === "POST" && path === "/order") {
      const body = await readJsonBody(request);
      const order = createOrder(body);
      sendJson(response, 201, { ok: true, order: publicOrder(order), qr_svg: order.svg });
      return;
    }

    const orderMatch = /^\/order\/([^/]+)(\/qr\.svg|\/paid)?$/.exec(path);
    if (orderMatch) {
      const id = decodeURIComponent(orderMatch[1]);
      const action = orderMatch[2] ?? "";
      const order = orders.get(id);
      if (!order) {
        sendJson(response, 404, { ok: false, error: { code: "ORDER_NOT_FOUND", message: "unknown order" } });
        return;
      }
      if (request.method === "GET" && action === "") {
        sendJson(response, 200, { ok: true, order: publicOrder(order) });
        return;
      }
      if (request.method === "GET" && action === "/qr.svg") {
        response.writeHead(200, { ...CORS_HEADERS, "content-type": "image/svg+xml; charset=utf-8" });
        response.end(order.svg);
        return;
      }
      if (request.method === "POST" && action === "/paid") {
        // Manual confirmation stub. In production this is your own admin flow marking an order
        // paid after checking the provider statement. It is NOT a payment API.
        order.status = "paid";
        order.paidAt = new Date().toISOString();
        sendJson(response, 200, {
          ok: true,
          order: publicOrder(order),
          note: "manual confirmation stub — no real payment was verified",
        });
        return;
      }
      sendJson(response, 405, {
        ok: false,
        error: { code: "BAD_REQUEST", message: "method not allowed for this route" },
      });
      return;
    }

    sendJson(response, 404, {
      ok: false,
      error: { code: "NOT_FOUND", message: `no route for ${request.method} ${path}` },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      sendJson(response, 400, { ok: false, error: { code: error.code, message: error.message } });
      return;
    }
    console.error("unhandled error", error);
    sendJson(response, 500, { ok: false, error: { code: "INTERNAL", message: "unexpected server error" } });
  }
});

server.listen(PORT, () => {
  console.log(`deshiQR node example listening on http://localhost:${PORT}`);
  console.log("synthetic demo payload only — see docs/demo-payloads.md");
});
