# Amount→QR API (v1)

deshiQR has one job:

> **Give it a merchant's Bangla QR payload and an amount. Get back the dynamic payload and a QR.**

That is the whole contract. Use it for a checkout total, a donation amount, "pay what you want", or any
page that shows "pay ৳X". This endpoint is stateless: no database, no accounts, no merchant records, no
secrets. It is served by [`supabase/functions/qr`](../supabase/functions/qr/index.ts), and the same
derivation is available offline from the [`deshiqr` package](../packages/deshiqr).

## Request

```http
POST /functions/v1/qr
Content-Type: application/json

{
  "payload": "00020101021126470014bd.org.bb.npsb010202020420020311010000000005204601653030505802BD5910DEMO STORE6005Dhaka62060602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=6304295D",
  "amount": 500
}
```

(The payload above is the synthetic `DEMO STORE` fixture from
[`demo-payloads.md`](./demo-payloads.md) — never send real merchant data in examples or tests.)

| Field       | Type             | Required | Rules                                                                                                                                                                                                      |
| ----------- | ---------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payload`   | string           | yes      | Static Bangla QR payload. Any provider. Must be TLV with a valid CRC.                                                                                                                                      |
| `amount`    | number \| string | yes      | BDT, `0.01`–`99,999,999.99`, at most 2 decimals (no silent rounding).                                                                                                                                      |
| `reference` | string           | no       | 1–32 printable ASCII (bKash calls it the bill number). Omit (or send `null`) to keep any reference the payload already has — a static payload has none, so none is added. Send a string to set/replace it. |

## Response

`200 OK`:

```json
{
  "ok": true,
  "payload": "00020101021226470014bd.org.bb.npsb010202020420020311010000000005204601653030505406500.005802BD5910DEMO STORE6005Dhaka62060602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=6304F835",
  "amount": 500,
  "amountText": "500.00",
  "reference": null,
  "qr_svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" …></svg>"
}
```

- `payload` — the derived dynamic payload: tag `01` is `12`, tag `54` is the amount, everything else is
  byte-identical to the input.
- `qr_svg` — a complete, self-contained SVG (no scripts, no external references, deterministic). Put it
  in an `<img>` with a data URL, or inline it.
- `amountText` — the exact BDT string embedded in the payload.
- `reference` — the reference now embedded in the payload (`null` for none).

### What changes, what doesn't

| Field                                                                                            | Changed?                                      |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `01` point of initiation                                                                         | `11` (static) → `12` (dynamic)                |
| `54` amount                                                                                      | inserted/replaced                             |
| `62/01` reference                                                                                | only added/replaced when you send `reference` |
| `63` checksum                                                                                    | re-sealed (CRC-16/CCITT-FALSE)                |
| `00`, `26` (AID/account/sub-tags), `52`, `53`, `58`, `59`, `60`, `80`, `81`, other `62` sub-tags | **untouched, byte for byte**                  |

This is why the API works with **any** provider: it never needs to interpret the account AID, the
provider tokens or the merchant name. It validates only TLV well-formedness and the CRC. Proven by
tests on a synthetic non-bKash layout
([`provider-agnostic.test.ts`](../packages/deshiqr/test/core/provider-agnostic.test.ts),
[`qr-core.test.mts`](../supabase/functions/qr/qr-core.test.mts),
[`test_provider_agnostic.py`](../python/tests/test_provider_agnostic.py)).

## Frontend examples

### Checkout page (amount from the cart)

```js
async function showPaymentQr(merchantPayload, cartTotal) {
  const res = await fetch("https://<project-ref>.supabase.co/functions/v1/qr", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: merchantPayload, amount: cartTotal }),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(body.error.message);

  document.querySelector("#qr").src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(body.qr_svg);
  return body.payload; // the exact payload the customer scans
}
```

### Donation / "pay anything" page

The amount comes from the visitor. Either call the endpoint on each change, or skip the network
entirely and derive in the browser — the payload math and the QR encoder ship in one package. One
`<script src>` gives you `window.DeshiQR` (payload + QR; it also registers `<deshiqr-pay>`):

```html
<script src="https://cdn.jsdelivr.net/npm/deshiqr@0.1.0/dist/deshiqr.global.js"></script>
<input id="amount" type="number" min="1" value="100" />
<img id="qr" alt="Payment QR" />

<script>
  const merchantPayload = "00020101021126…";
  const render = () => {
    const amount = Number(document.querySelector("#amount").value);
    if (!Number.isFinite(amount) || amount <= 0) return;
    try {
      const payload = DeshiQR.withAmount(merchantPayload, amount);
      document.querySelector("#qr").src =
        "data:image/svg+xml;charset=utf-8," + encodeURIComponent(DeshiQR.toSvg(DeshiQR.encode(payload)));
    } catch (error) {
      console.warn(error.code, error.message);
    }
  };
  document.querySelector("#amount").addEventListener("input", render);
  render();
</script>
```

With a bundler or ESM, the same code imports from the package:

```js
import { withAmount, encode, toSvg } from "deshiqr";
```

Or use the web component, which renders the input and QR for you (the same script tag above already
registers it):

```html
<deshiqr-pay payload="00020101021126…" title="Support us" note="Pay any amount"></deshiqr-pay>
```

With a bundler: `import "deshiqr/element";` registers `<deshiqr-pay>` the same way.

## Errors

Every error is `{ "ok": false, "error": { "code": "…", "message": "…" } }`:

| `code`              | HTTP | When                                                        |
| ------------------- | ---- | ----------------------------------------------------------- |
| `BAD_REQUEST`       | 400  | not JSON, not an object, unknown route/method               |
| `EMPTY_PAYLOAD`     | 400  | `payload` missing/empty/not a string                        |
| `BAD_TLV`           | 400  | payload is not well-formed TLV                              |
| `MISSING_FIELD`     | 400  | payload does not end with the tag-63 checksum               |
| `CHECKSUM_MISMATCH` | 400  | CRC-16 does not match (damaged QR, or not a Bangla QR)      |
| `BAD_AMOUNT`        | 400  | missing, non-numeric, ≤ 0, > 99,999,999.99, or > 2 decimals |
| `BAD_REFERENCE`     | 400  | reference is not 1–32 printable ASCII                       |
| `UNSUPPORTED`       | 413  | payload or request body is absurdly large                   |
| `INTERNAL`          | 500  | unexpected server error (details only in logs)              |

## Deploy

```sh
supabase link --project-ref <project-ref>
supabase functions deploy qr --no-verify-jwt
```

- No database and no secrets are required. The function is stateless; there is no schema to apply.
- `--no-verify-jwt` lets browsers call the endpoint without the anon key (the payload is public data).
  Omit the flag if you want every request to carry the project anon key.
- CORS: `*` by default; set `DESHIQR_CORS_ORIGIN` to your site origin to tighten it.
- There is deliberately **no rate limiting or per-app credential** here: the function is stateless and
  cheap, and anyone can derive a QR from a public payload. If you expose it at scale, put your edge/WAF
  limits in front.

Full walkthrough: [`self-hosting.md`](./self-hosting.md).

## Guarantees and limits

- **Provider-agnostic:** only `01`, `54`, the checksum, and an optional `62/01` are edited.
- **No payment confirmation.** A QR is an instruction to pay; deshiQR cannot tell whether money moved.
- **No merchant verification.** The API renders whatever payload you send. Payloads are public data,
  but a swapped/malicious payload produces a valid QR for the wrong account — verify your own source of
  payloads.
- **No idempotency/state.** Same input → same output (the SVG is deterministic). Nothing is stored.
- **Provider formats can change.** Test a small amount in the provider app before relying on it in
  production.

## Related

- [`format.md`](./format.md) — the payload fields and derivation rules
- [`demo-payloads.md`](./demo-payloads.md) — synthetic fixtures used above
- [`embedding.md`](./embedding.md) — library and web-component usage
- [`self-hosting.md`](./self-hosting.md) — deploying the `qr` function
