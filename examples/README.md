# deshiQR examples

Integration examples for the one thing deshiQR does: **a merchant's Bangla QR payload + an amount →
dynamic payload + QR**. All of them use the **same synthetic demo payload** from
[`docs/demo-payloads.md`](../docs/demo-payloads.md) — fake account `01000000000`, merchant
`DEMO STORE`, city `Dhaka`, dummy NPSB tokens. Never paste a real merchant payload into an example, a
test fixture or a docs page.

| Example                                                                | What it shows                                                              | Needs                             |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------- |
| [`checkout.html`](./checkout.html)                                     | The core use case: cart total → dynamic payload + QR, entirely client-side | `pnpm build`                      |
| [`vanilla.html`](./vanilla.html)                                       | `<deshiqr-pay>` in plain HTML, no framework, no network                    | `pnpm build`                      |
| [`react/App.tsx`](./react/App.tsx)                                     | Typed React wrapper for the custom element (ref + events)                  | React app + the `deshiqr` package |
| [`node-express/server.mjs`](./node-express/server.mjs)                 | Small dependency-free Node server: derive payload + QR SVG on the server   | Node 22+, `pnpm build`            |
| [`../python/examples/derive_svg.py`](../python/examples/derive_svg.py) | Python: decode → derive an amount → SVG with `segno`                       | Python 3.9+, `pip install segno`  |

## Prerequisites

From the repo root:

```bash
pnpm install
pnpm build   # builds the single package: packages/deshiqr/dist/
```

That produces one npm package, `deshiqr`:

- main entry `deshiqr` — payload library + QR encoder and SVG/terminal renderers;
- subpath `deshiqr/element` — the `<deshiqr-pay>` web component;
- `dist/deshiqr.global.js` — one IIFE bundle for plain `<script src>` pages (global `DeshiQR`, which
  also registers `<deshiqr-pay>`).

The public API contracts are in [`docs/architecture.md`](../docs/architecture.md).

## 1. `checkout.html`

Open the file directly in a browser after `pnpm build` (it loads
`../packages/deshiqr/dist/deshiqr.global.js`), or serve the repo root with any static server. Enter a
cart total and it derives the dynamic payload and renders the QR — no backend, no network:

```html
<script src="../packages/deshiqr/dist/deshiqr.global.js"></script>
<script>
  const payload = DeshiQR.withAmount(MERCHANT_PAYLOAD, cartTotal);
  document.querySelector("#qr").innerHTML = DeshiQR.toSvg(DeshiQR.encode(payload), {
    margin: 4,
    scale: 8,
  });
</script>
```

In production, load the same file from jsDelivr/unpkg
(`https://cdn.jsdelivr.net/npm/deshiqr@0.1.0/dist/deshiqr.global.js`) or self-host it. If you prefer the
stateless HTTP path instead, see [`docs/amount-qr.md`](../docs/amount-qr.md).

## 2. `vanilla.html`

Open the file directly in a browser after `pnpm build` (it loads the same
`../packages/deshiqr/dist/deshiqr.global.js`), or serve the repo root. It sets the demo payload, wires
`deshiqr-ready` / `deshiqr-change` / `deshiqr-error`, and prints the derived payload + reference. Amount
presets come from the `presets` attribute.

```html
<deshiqr-pay
  payload="00020101021126…"
  title="DEMO STORE"
  presets="100,500,1000"
  ref-prefix="DEMO"
  ref-length="25"
></deshiqr-pay>
```

In production, either self-host the built `deshiqr.global.js` or load it from a CDN (jsDelivr/unpkg —
the package's `unpkg`/`jsdelivr` fields point at the IIFE bundle).

## 3. `react/App.tsx`

A single-file example that copies into a React app. It includes:

- a `forwardRef` wrapper (`DeshiQrPay`) exposing `refresh()`, `setAmount()`, `getPayload()`, `getSvg()`,
  `downloadPng()` and the underlying element;
- JSX intrinsic declarations for the `<deshiqr-pay>` tag (React 19 `React.JSX` and the older global
  `JSX` namespace);
- explicit `addEventListener` wiring for the element's events (React does not map `on*` props to
  custom-element events), with typed `CustomEvent` details;
- a tiny demo app using the synthetic payload.

The wrapper imports `react` only — the web component stays dependency-free. Make sure the element module
is imported once somewhere in your app (`import "deshiqr/element"`) or the global bundle is loaded,
otherwise the tag never upgrades.

## 4. `node-express/server.mjs`

A small, dependency-free server (Node's built-in `node:http`; no Express is installed in this repo, and
the routes map 1:1 to Express — see the snippet below). It imports the single `deshiqr` package (with a
fallback to `packages/deshiqr/dist/index.js` when the workspace package is not linked in
`node_modules`).

```bash
pnpm build
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
- **the confirmation gap**: `POST /order/:id/paid` just flips a flag. deshiQR never holds or moves funds
  and cannot verify a bKash/Nagad/Rocket payment; confirmation is manual (or, in future, provider APIs).

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

- The **server** is the trust boundary: derive and validate payloads there, and don't forward a payload
  string supplied by a visitor to a customer.
- The amount is not proof of payment. Match payments against your provider statement manually until you
  have an official confirmation channel.
- Keep the base payload in a place visitors cannot edit. A static payload is public _once printed_, but
  your pay page still has to render the merchant's own payload, not one a visitor swapped in.
