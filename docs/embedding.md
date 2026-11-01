# Embedding deshiQR

deshiQR does one thing: **payload + amount → dynamic payload + QR**. There are three levels at which
you can use it, depending on how much control you want. None of them require an account or a server of
ours — deshiQR runs no hosted service.

> **Just need "payload + amount → QR"?** That is the one-call [`qr` API](./amount-qr.md) (HTTP) or the
> browser bundle below. Everything on this page is the same derivation, at different levels of control.

1. **Library** — payload and QR in one package, computed offline.
2. **Web component** — drop `<deshiqr-pay>` on a page; it renders the amount form and the QR.
3. **Stateless HTTP API** — call a `qr` function you deploy; it returns the payload and an SVG.

## No build step: one script tag

The single browser bundle exposes `window.DeshiQR` with the payload library, the QR encoder and
renderers, and it registers `<deshiqr-pay>`:

```html
<script src="https://cdn.jsdelivr.net/npm/deshiqr@0.1.0/dist/deshiqr.global.js"></script>
<script>
  const payload = DeshiQR.withAmount(staticPayload, 500, {
    reference: DeshiQR.newReference({ prefix: "ORD" }),
  });
  document.querySelector("#qr").innerHTML = DeshiQR.toSvg(DeshiQR.encode(payload), {
    margin: 4,
    scale: 8,
  });
</script>
```

No npm publish needed for the GitHub Pages mirror:
`https://hello2himel.github.io/deshiQR/deshiqr.global.js` (same file, published by
`.github/workflows/cdn.yml`). `raw.githubusercontent.com` cannot be used in `<script src>` — it serves
`text/plain` with `X-Content-Type-Options: nosniff` and browsers refuse to execute it; use jsDelivr,
unpkg, Pages or `raw.githack.com`.

## Level 1: the library

```sh
npm install deshiqr
```

The main entry is pure: no DOM side effects, no network, no registering `<deshiqr-pay>`. It exports the
payload library **and** the QR encoder/renderers, so one dependency covers both steps.

```ts
import { decode, withAmount, toStatic, newReference, validate, encode, toSvg } from "deshiqr";

// 1. Load the merchant's static payload (the one from their QR).
const qr = decode(staticPayload); // throws DeshiQrError on bad input

// 2. Derive a payload for a specific amount.
const payload = withAmount(staticPayload, 500, {
  reference: newReference({ prefix: "ORD" }), // optional
});

// 3. Render the QR.
const svg = toSvg(encode(payload, { level: "M" }), { margin: 4, scale: 8 });

// 4. Back to a static payload (amount + reference removed):
const baseAgain = toStatic(payload);
```

Use `validate(payload)` instead of `decode` when you want **every** problem at once — it never throws
and returns `{ ok, errors, warnings, qr }`.

Everything is synchronous, has no I/O and no dependencies. It runs in browsers, Node, Deno, Cloudflare
Workers and Supabase edge functions. A Python port with the same payload API is available as
`pip install deshiqr` — see [`../python/README.md`](../python/README.md). The Python package is
payload-only: render with `segno`/`qrcode`, or call the HTTP API.

### Choosing a QR renderer

The payload is just a string, so any QR encoder works. `deshiqr` ships a dependency-free one with SVG,
path and terminal renderers:

```ts
import { encode, toSvg, toTerminal } from "deshiqr";

const matrix = encode(payload, { level: "M" }); // auto version + mask
console.log(toTerminal(matrix)); // print a QR in the terminal
const svg = toSvg(matrix, { margin: 4, scale: 10, dark: "#1b1030", light: "#ffffff" });
```

## Level 2: the web component

The element bundles the library and a QR encoder and renders a complete payment panel. It works with no
network when you pass `payload` directly.

```html
<script src="https://cdn.jsdelivr.net/npm/deshiqr@0.1.0/dist/deshiqr.global.js"></script>
<!-- or, with a bundler: import "deshiqr/element"; (registers the element as a side effect) -->
```

```html
<deshiqr-pay
  payload="00020101021126…"
  title="Demo Store"
  note="Pay before 6pm"
  presets="100,500,1000,5000"
  theme="auto"
  size="280"
></deshiqr-pay>
```

`import { DeshiQrPay, defineDeshiQrPay } from "deshiqr/element"` is also available if you want the class
(or an idempotent registration call) rather than only the side effect.

### Attributes

| Attribute       | Description                                                                       |
| --------------- | --------------------------------------------------------------------------------- |
| `payload`       | Static Bangla QR payload (required unless `config-url` is used).                  |
| `config-url`    | URL returning JSON `{ base_payload, title, note, presets, ref_prefix, ref_len }`. |
| `amount`        | Pre-set amount in BDT. Omit to show an amount input.                              |
| `lock-amount`   | Hide the amount input and use `amount`.                                           |
| `reference`     | Explicit reference to embed in the payload.                                       |
| `ref-prefix`    | Prefix for a generated reference.                                                 |
| `ref-length`    | Generated reference length (`0` or absent = no reference).                        |
| `title`, `note` | Headline and supporting text.                                                     |
| `presets`       | Comma-separated quick amounts, e.g. `100,500,1000`.                               |
| `theme`         | `auto` (default), `light` or `dark`.                                              |
| `size`          | QR size in CSS pixels (default 280).                                              |
| `bare`          | Remove the card chrome, for embedding in your own layout.                         |

Theming uses CSS custom properties (`--dq-*`), so you can restyle without shadow DOM hacks:

```css
deshiqr-pay {
  --dq-accent: #e2136e;
  --dq-accent-2: #7c3aed;
  --dq-accent-soft: #fdf2f8;
  --dq-surface: #ffffff;
  --dq-text: #1b1030;
  --dq-radius: 20px;
  --dq-font: "Figtree", system-ui, sans-serif;
}
```

### JavaScript API

```js
const el = document.querySelector("deshiqr-pay");
el.setAmount(500); // update the amount (number or null)
el.getPayload(); // current dynamic payload
el.getSvg(); // current QR as an SVG string
await el.downloadPng("pay.png"); // save the QR as a PNG
el.refresh(); // re-read attributes and re-render
```

Events bubble and are composed (`event.detail`):

```js
el.addEventListener("deshiqr-change", (event) => {
  const { amount, payload, reference } = event.detail;
  // log analytics, keep the reference for reconciliation, etc.
});
el.addEventListener("deshiqr-error", (event) => console.warn(event.detail.code));
el.addEventListener("deshiqr-ready", () => {});
```

If the payload is invalid, the element renders the error message instead of a broken QR — it does not
throw into your page.

## Level 3: the stateless HTTP `qr` API

When you want the server to do the derivation (or you are not using JavaScript), call the `qr` function
you deploy. It is stateless: no database, no secrets, no merchant records.

```js
const res = await fetch("https://<project-ref>.supabase.co/functions/v1/qr", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ payload: merchantPayload, amount: 500 }),
});
const { ok, payload, qr_svg, error } = await res.json();
if (!ok) throw new Error(error.message);
document.querySelector("#qr").src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(qr_svg);
```

Request/response contract, error codes and deploy steps: [`amount-qr.md`](./amount-qr.md) and
[`self-hosting.md`](./self-hosting.md).

## Security notes

- **Payloads are public data.** The account number is printed on shop walls; it is not a secret.
- **Treat payloads as untrusted input.** Always `validate()` / `decode()` before you store or render
  one; both verify the CRC. Verify where the payload came from — the endpoint renders whatever it is
  given.
- **Impersonation is the real risk.** The QR carries the account holder's real name; a page that shows
  a different name is a scam, not a feature. deshiQR derives amounts and references only — it does not
  rewrite account, name or city.
- **CSP:** neither the library nor the element requires inline script. `script-src 'self'` works if you
  self-host the bundle.
- **No funds, no custody.** deshiQR is not a payment service provider and cannot confirm payments.
  Read [`../SECURITY.md`](../SECURITY.md).
