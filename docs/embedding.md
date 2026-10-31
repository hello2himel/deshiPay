# Embedding deshiQR

deshiQR is a payload toolkit first. You can use it in three levels, depending on how much control you
want. None of them require an account or a server of ours.

1. **Library** — compute payloads yourself, render the QR with any QR library. Fully offline.
2. **Web component** — drop `<deshiqr-pay>` on a page; it renders the amount form and the QR.
3. **Invoice API** — per-order amounts and references, hosted pay pages, QR images.

## Level 1: the library

```sh
npm install deshiqr
```

```ts
import { decode, withAmount, toStatic, newReference, validate } from "deshiqr";

// 1. Load the merchant's static payload (the one from their QR).
const qr = decode(staticPayload);      // throws DeshiQrError on bad input
if (qr.reference) {
  // this merchant's QR already carries a reference pattern
}

// 2. Derive a payload for a specific amount.
const payload = withAmount(staticPayload, 500, {
  reference: newReference({ prefix: "ORD" }),   // optional
});

// 3. Render with any QR library, e.g. `qrcode` or `deshiqr-qr`.
import { encode, toSvg } from "deshiqr-qr";
const svg = toSvg(encode(payload, { level: "M" }), { margin: 4, scale: 8 });

// 4. Back to a static payload (amount + reference removed):
const baseAgain = toStatic(payload);
```

Use `validate(payload)` instead of `decode` when you want **every** problem at once — it never throws
and returns `{ ok, errors, warnings, qr }`. That is what the setup wizard uses.

Everything is synchronous, has no I/O and no dependencies. Runs in browsers, Node, Deno, Cloudflare
Workers and Supabase edge functions.

### Choosing a QR renderer

The payload is just a string, so any QR encoder works. `deshiqr-qr` is a dependency-free option with
SVG, path and terminal renderers:

```ts
import { encode, toSvg, toTerminal } from "deshiqr-qr";

const matrix = encode(payload, { level: "M" });   // auto version + mask
console.log(toTerminal(matrix));                  // print a QR in the terminal
const svg = toSvg(matrix, { margin: 4, scale: 10, dark: "#1b1030", light: "#ffffff" });
```

## Level 2: the web component

The element bundles the library and a QR encoder, and renders a complete payment panel. It works
with no network when you pass `payload` directly.

```html
<script type="module" src="https://unpkg.com/deshiqr-element"></script>
<!-- or self-host: dist/deshiqr-element.global.js (IIFE, global DeshiQrElement) -->
```

```html
<deshiqr-pay
  payload="00020101021126…"
  title="Demo Store"
  note="Orders ship after payment is confirmed"
  presets="100,500,1000,5000"
  theme="auto"
  size="280"
></deshiqr-pay>
```

### Attributes

| Attribute | Description |
| --- | --- |
| `payload` | Static Bangla QR payload (required unless `config-url` is used). |
| `config-url` | URL returning JSON `{ base_payload, title, note, presets, ref_prefix, ref_len }`. |
| `amount` | Pre-set amount in BDT. Omit to show an amount input. |
| `lock-amount` | Hide the amount input and use `amount`. |
| `reference` | Explicit reference to embed in the payload. |
| `ref-prefix` | Prefix for a generated reference. |
| `ref-length` | Generated reference length (`0` or absent = no reference). |
| `title`, `note` | Headline and supporting text. |
| `presets` | Comma-separated quick amounts, e.g. `100,500,1000`. |
| `theme` | `auto` (default), `light` or `dark`. |
| `size` | QR size in CSS pixels (default 280). |
| `bare` | Remove the card chrome, for embedding in your own layout. |

Theming uses CSS custom properties, so you can restyle without shadow DOM hacks:

```css
deshiqr-pay {
  --deshiqr-accent: #e2136e;
  --deshiqr-ink: #1b1030;
  --deshiqr-surface: #ffffff;
  --deshiqr-radius: 20px;
  --deshiqr-font: "Figtree", system-ui, sans-serif;
}
```

### JavaScript API

```js
const el = document.querySelector("deshiqr-pay");
el.setAmount(500);                // update the amount (number or null)
el.getPayload();                  // current dynamic payload
el.getSvg();                      // current QR as an SVG string
await el.downloadPng("pay.png");  // 800×800 PNG
el.refresh();                     // re-read attributes and re-render
```

Events bubble and are composed (`event.detail`):

```js
el.addEventListener("deshiqr-change", (event) => {
  const { amount, payload, reference } = event.detail;
  // send the reference to your order, log analytics, etc.
});
el.addEventListener("deshiqr-error", (event) => console.warn(event.detail.code));
el.addEventListener("deshiqr-ready", () => {});
```

If the payload is invalid, the element renders the error message instead of a broken QR — it does not
throw into your page.

## Level 3: invoice API (hosted)

When you need a **locked amount and a reference per order** (and a page the customer can reopen),
create an invoice on the deshiQR backend:

```sh
curl -X POST "$SUPABASE_URL/functions/v1/invoice" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "content-type: application/json" \
  -d '{"merchant":"demo","amount":500,"note":"Order #1042","expires_in":3600}'
```

```json
{
  "ok": true,
  "invoice": { "token": "…", "amount": 500, "reference": "FT80…", "status": "pending", "expires_at": "…" },
  "merchant": { "slug": "demo", "title": "Demo Store" },
  "payload": "00020101021226…",
  "pay_url": "https://your-app.example/#/i/…",
  "qr_svg": "<svg …>"
}
```

The customer opens `pay_url`, sees the locked amount and scans. They can report the bKash
transaction ID; the merchant marks it paid in the dashboard. Full reference and error codes are in
[api.md](./api.md).

> deshiQR does not confirm that money moved. The official confirmation path is bKash's merchant
> checkout API (or a licensed gateway); the practical interim path is manual confirmation. See
> [roadmap.md](./roadmap.md).

## Security notes

- **Never put secrets in the browser.** The Supabase anon key is public by design; RLS is what
  protects data. The service-role key is only used inside the edge function.
- **Treat payloads as untrusted input.** Always `validate()` / `decode()` before store or render; both
  verify the CRC. Server-side, the database also re-checks the CRC on insert.
- **Impersonation is the real risk.** The QR carries the account holder's real name; a page that
  shows a different name is a scam, not a feature. deshiQR derives amounts and references only — it
  does not rewrite account, name or city.
- **CSP**: the element and the app have no inline requirement. `script-src 'self'` works if you
  self-host the bundles; the web app only needs Google Fonts for styling.
- **No funds, no custody.** deshiQR is not a payment service provider. Read
  [../SECURITY.md](../SECURITY.md).
