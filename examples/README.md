# deshiQR examples

Three integration examples, from simplest to most backend-y. All of them use the **same
synthetic demo payload** from [`docs/demo-payloads.md`](../docs/demo-payloads.md) — fake account
`01000000000`, merchant `DEMO STORE`, city `Dhaka`, dummy NPSB tokens. Never paste a real
merchant payload into an example, a test fixture or a docs page.

| Example                                                | What it shows                                                                     | Needs                       |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- | --------------------------- |
| [`vanilla.html`](./vanilla.html)                       | `<deshiqr-pay>` in plain HTML, no framework, no network                           | `pnpm build:libs`           |
| [`react/App.tsx`](./react/App.tsx)                     | Typed React wrapper for the custom element (ref + events)                         | React app + the element     |
| [`node-express/server.mjs`](./node-express/server.mjs) | Your own backend: POST /order → dynamic payload + QR SVG, manual "mark paid" stub | Node 22+, `pnpm build:libs` |

## Prerequisites

From the repo root:

```bash
pnpm install
pnpm build:libs   # builds packages/core, packages/qr, packages/element (dist/)
```

- `packages/core` → npm `deshiqr` (payload parse/derive/validate, zero dependencies)
- `packages/qr` → npm `deshiqr-qr` (QR encoder + SVG/terminal renderer, zero dependencies)
- `packages/element` → npm `deshiqr-element` (`<deshiqr-pay>`, zero runtime dependencies)

The public API contracts are in [`docs/architecture.md`](../docs/architecture.md) §3–§5.

## 1. `vanilla.html`

Open the file directly in a browser after `pnpm build:libs` (it loads
`../packages/element/dist/deshiqr-element.global.js`), or serve the repo root with any static
server. It sets the demo payload, wires `deshiqr-ready` / `deshiqr-change` / `deshiqr-error`,
and prints the derived payload + reference. Amount presets come from the `presets` attribute.

```html
<deshiqr-pay
  payload="00020101021126…"
  title="DEMO STORE"
  presets="100,500,1000"
  ref-prefix="DEMO"
  ref-length="25"
></deshiqr-pay>
```

In production, either self-host the built `deshiqr-element.global.js` or load it from a CDN
(jsDelivr/unpkg — `deshiqr-element`'s `unpkg`/`jsdelivr` fields point at the IIFE bundle).

## 2. `react/App.tsx`

A single-file example that copies into a React app. It includes:

- a `forwardRef` wrapper (`DeshiQrPay`) exposing `refresh()`, `setAmount()`, `getPayload()`,
  `getSvg()`, `downloadPng()` and the underlying element;
- JSX intrinsic declarations for the `<deshiqr-pay>` tag (React 19 `React.JSX` and the older
  global `JSX` namespace);
- explicit `addEventListener` wiring for the element's events (React does not map `on*` props
  to custom-element events), with typed `CustomEvent` details;
- a tiny demo app using the synthetic payload.

The wrapper imports `react` only — the web component stays dependency-free. Make sure the
element module is imported once somewhere in your app (`import "deshiqr-element"`) or the
global bundle is loaded, otherwise the tag never upgrades.

## 3. `node-express/server.mjs`

A small, dependency-free backend (Node's built-in `node:http`; no Express is installed in this
repo, and the routes map 1:1 to Express — see the snippet below). It imports the real workspace
libraries, and falls back to `packages/*/dist` when the packages are not linked in
`node_modules`.

```bash
node examples/node-express/server.mjs
# http://localhost:8787
```

Routes:

| Method | Path                | Purpose                                                   |
| ------ | ------------------- | --------------------------------------------------------- |
| `GET`  | `/`                 | tiny HTML page: enter amount → QR                         |
| `POST` | `/order`            | `{ amount, note?, reference? }` → `{ ok, order, qr_svg }` |
| `GET`  | `/order/:id`        | order status (`pending` / `paid`)                         |
| `GET`  | `/order/:id/qr.svg` | QR image (`image/svg+xml`)                                |
| `POST` | `/order/:id/paid`   | manual "mark paid" stub                                   |

What it demonstrates:

- `build(basePayload, { amount, reference })` derives a dynamic Bangla QR payload while keeping
  account/name/tokens verbatim;
- `encode(payload)` + `toSvg(matrix)` produce a self-contained SVG (no external references);
- 25-character bill numbers by default (the shape real bKash dynamic QRs use today);
- **the confirmation gap**: `POST /order/:id/paid` just flips a flag. deshiQR never holds or
  moves funds and cannot verify a bKash/Nagad/Rocket payment; confirmation is manual (or, in
  future, provider APIs). See [`docs/security.md`](../docs/security.md).

Express port (same handlers, `app.post(...)` etc.):

```js
import express from "express";
const app = express();
app.use(express.json());
app.post("/order", (req, res) => res.status(201).json({ ok: true, order: createOrder(req.body) }));
app.get("/order/:id", (req, res) => res.json({ ok: true, order: orders.get(req.params.id) }));
app.get("/order/:id/qr.svg", (req, res) => res.type("image/svg+xml").send(orders.get(req.params.id).svg));
app.listen(8787);
```

## Production notes

- The **backend** is the trust boundary: derive and validate payloads on the server, never
  accept a QR image/payload string from the browser and forward it to a customer.
- The amount is not proof of payment. Match payments against your provider statement manually
  until you have an official confirmation channel.
- Keep the base payload in a secret/DB row per merchant, not in client-side code that any
  visitor can edit to point at their own account. (A static payload is public _once printed_;
  the pay page still has to render the merchant's own payload.)
