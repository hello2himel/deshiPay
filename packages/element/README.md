# deshiqr-element

`<deshiqr-pay>` — a dependency-free web component that turns a **Bangla QR** payload into a complete
payment panel: amount input, quick amounts, the QR code, a "save QR" button and a reference display.

- Shadow DOM, no framework, no runtime dependencies (bundles `deshiqr` + `deshiqr-qr`).
- Works offline when given a `payload` — the QR is generated in the browser.
- ESM build for bundlers, IIFE build for a plain `<script>` tag.
- Honest copy built in: **bKash verified today, more providers planned**; any app that accepts Bangla
  QR can scan the generated code.

## Install

```sh
npm install deshiqr-element
```

```js
import "deshiqr-element"; // registers <deshiqr-pay>
```

Or with a script tag (IIFE, global `DeshiQrElement`, auto-registers):

```html
<script type="module" src="https://unpkg.com/deshiqr-element"></script>
```

Self-hosting the bundle is recommended for production; the file has no external references.

## Usage

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

`payload` is the merchant's **static** Bangla QR payload (the string inside the QR printed at the
counter). It is public data by design — it is what the customer's banking app reads anyway. deshiQR
only derives the amount and reference; it never changes the account, name, city or NPSB tokens.

### Attributes

| Attribute | Description |
| --- | --- |
| `payload` | Static Bangla QR payload. Required unless `config-url` is used. |
| `config-url` | URL returning JSON `{ base_payload, title, note, presets, ref_prefix, ref_len }`. |
| `amount` | Pre-set amount in BDT. Omit to show an amount input. |
| `lock-amount` | Hide the amount input and use `amount`. |
| `reference` | Explicit reference (bill number) to embed. |
| `ref-prefix` | Prefix for a generated reference. |
| `ref-length` | Generated reference length (1–32). Omit or `0` for none. Real bKash dynamic QRs use 25. |
| `title`, `note` | Headline and supporting text. |
| `presets` | Comma-separated quick amounts, e.g. `100,500,1000`. |
| `theme` | `auto` (default), `light` or `dark`. |
| `size` | QR size in CSS pixels (default `280`, min `96`, max `1024`). |
| `bare` | Remove the card chrome, for embedding into your own layout. |

### JavaScript API

```js
const el = document.querySelector("deshiqr-pay");

el.setAmount(500);               // number or null
el.getPayload();                 // current dynamic payload ("" until an amount is set)
el.getSvg();                     // current QR as an SVG string
await el.downloadPng("pay.png"); // 800×800 PNG
el.refresh();                    // re-read attributes and re-render
```

### Events

All events bubble and are composed; details live in `event.detail`.

```js
el.addEventListener("deshiqr-ready", (event) => {
  // { payload, amount, reference }
});
el.addEventListener("deshiqr-change", (event) => {
  // { amount, payload, reference } — fires when the amount/reference changes
});
el.addEventListener("deshiqr-error", (event) => {
  // { code, message } — e.g. CHECKSUM_MISMATCH, BAD_AMOUNT
});
```

Invalid input renders an inline error state; the component does not throw into the host page.

### Theming

The shadow DOM exposes CSS custom properties:

```css
deshiqr-pay {
  --deshiqr-accent: #e2136e;
  --deshiqr-ink: #1b1030;
  --deshiqr-surface: #ffffff;
  --deshiqr-radius: 20px;
  --deshiqr-font: "Figtree", system-ui, sans-serif;
}
```

Accessibility: the amount input is labelled, the QR has an accessible name, focus styles are visible,
and animations respect `prefers-reduced-motion`.

## Provider support

Every QR built by this component is a standard **Bangla QR** payload, so any app that accepts Bangla
QR can pay it. Decoding/derivation is **verified for bKash today**; Nagad, Rocket and bank/NPSB apps
are planned and unverified until real payloads are pinned in the test suite. The component says so in
its footnote — please keep that honest.

## License

MIT © Himel Das. Not affiliated with bKash, Nagad, Rocket or NPSB.
