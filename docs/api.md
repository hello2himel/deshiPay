# deshiQR invoice API (v1)

The invoice API turns a merchant's static Bangla QR payload into a **dynamic** payment request
with an exact amount and a bill-number reference, and gives the payer a QR code and a status
page. Everything here is served by the `invoice` Supabase edge function in
[`supabase/functions/invoice/index.ts`](../supabase/functions/invoice/index.ts).

- **deshiQR never touches money.** An invoice records what a payer _intended_ to pay. It does
  not prove that a payment happened; confirmation is manual today (see
  [`security.md`](./security.md)).
- Payload mechanics (TLV fields, CRC-16/CCITT-FALSE, derivation rules) are documented in
  [`format.md`](./format.md). This page only describes the HTTP API.
- All examples use synthetic data from [`demo-payloads.md`](./demo-payloads.md): demo merchant
  `demo`, fake account `01000000000`, `DEMO STORE`, dummy tokens. Never call this API with a
  real merchant's payload in a test.

## Base URL and auth

After deployment the function is served by your Supabase project:

```
https://<project-ref>.supabase.co/functions/v1/invoice
```

The payer-facing endpoints are **public by design** — a customer scanning a QR has no account.
Deploy with JWT verification disabled (see [`self-hosting.md`](./self-hosting.md#deploy-the-edge-function))
so anonymous clients can call them. If you instead keep JWT verification enabled, every request
must carry the project's **anon key**:

```http
apikey: <SUPABASE_ANON_KEY>
Authorization: Bearer <SUPABASE_ANON_KEY>
```

The function uses the **service role** key internally (to read merchants and write invoices).
Never ship the service role key to a browser. Requests without a valid key when verification is
enabled receive Supabase's own `401`, not the JSON error format below.

CORS: `*` by default. Set `DESHIQR_CORS_ORIGIN` to your app origin to restrict it.

Configuration (set with `supabase secrets set`, see [`self-hosting.md`](./self-hosting.md)):

| Variable                    | Default                 | Meaning                                                                    |
| --------------------------- | ----------------------- | -------------------------------------------------------------------------- |
| `DESHIQR_APP_ORIGIN`        | `http://localhost:5173` | Public web app origin used to build `pay_url`. **Set this in production.** |
| `DESHIQR_CORS_ORIGIN`       | `*`                     | `Access-Control-Allow-Origin` value                                        |
| `DESHIQR_CREATE_RATE_LIMIT` | `10`                    | invoices per merchant + client IP per 60 s window                          |
| `DESHIQR_CLAIM_RATE_LIMIT`  | `20`                    | claim attempts per client IP per 60 s window                               |
| `DESHIQR_READ_RATE_LIMIT`   | `120`                   | invoice reads per client IP per 60 s window                                |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase automatically.

## Amounts and references

- **Amount**: number (or numeric string) in BDT, `0.01` – `99,999,999.99`, at most 2 decimals.
  Values like `12.345` are rejected (`INVALID_AMOUNT`) rather than silently rounded.
- **Reference** (bKash calls it the _bill number_): optional string, 1–32 printable ASCII
  characters. When omitted, the function generates one using the merchant's stored `ref_prefix`
  and `ref_len`. Real bKash dynamic QRs use **25-character** bill numbers, which is the default
  when the merchant has no configured length; `ref_len` in `0–32` overrides it. The generated
  reference is always embedded in the derived payload and stored on the invoice.

  > **Caveat for generated references.** When a merchant's QR carries no bill number
  > (`ref_len = 0`), the invoice function generates a 25-character reference itself and embeds
  > it in tag `62`/`01`. That mirrors the shape of real bKash dynamic QRs, but the reference is
  > **derived by deshiQR, not issued by bKash**. Before relying on generated references for
  > reconciliation, test with a small amount on each account type you support.

- **Note**: optional, ≤160 characters. Shown to the payer; not personal data.
- **Expiry**: optional `expires_in` seconds, integer `60` – `604800` (7 days), default `1800`
  (30 minutes).

## Error format

Every error uses HTTP status + this body:

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_AMOUNT",
    "message": "Amount must be between 0.01 and 99999999.99 BDT with at most 2 decimals."
  }
}
```

| `code`               | HTTP | When                                                               |
| -------------------- | ---- | ------------------------------------------------------------------ |
| `MERCHANT_NOT_FOUND` | 404  | no published merchant with that slug                               |
| `INVALID_AMOUNT`     | 400  | missing/non-numeric, ≤ 0, > `99999999.99`, or more than 2 decimals |
| `BAD_REQUEST`        | 400  | malformed JSON, bad `note`/`reference`/`expires_in`, unknown route |
| `RATE_LIMITED`       | 429  | rate limit hit (see below)                                         |
| `INVOICE_NOT_FOUND`  | 404  | unknown/malformed token, or the invoice/merchant was deleted       |
| `EXPIRED`            | 410  | claim on an expired (or canceled) invoice                          |
| `ALREADY_PAID`       | 409  | claim on an invoice that is already claimed or paid                |
| `INTERNAL`           | 500  | misconfiguration or upstream database failure                      |

`INTERNAL` messages are deliberately vague; details go to the edge function logs.

## Create an invoice

```http
POST /functions/v1/invoice
Content-Type: application/json
```

| Field        | Type             | Required | Notes                                        |
| ------------ | ---------------- | -------- | -------------------------------------------- |
| `merchant`   | string           | yes      | merchant slug (`demo`), must be published    |
| `amount`     | number \| string | yes      | BDT, 2 dp, see rules above                   |
| `note`       | string           | no       | ≤160 chars                                   |
| `reference`  | string           | no       | 1–32 printable ASCII; generated when omitted |
| `expires_in` | integer          | no       | seconds, `60`–`604800`, default `1800`       |

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/invoice" \
  -H 'content-type: application/json' \
  -d '{"merchant":"demo","amount":500,"note":"Order #42"}'
```

> The curl examples on this page assume the recommended deployment with JWT verification
> disabled (see [`self-hosting.md`](./self-hosting.md#deploy-the-edge-function)). If you kept
> verification enabled, add `-H "apikey: $SUPABASE_ANON_KEY"` (and the matching
> `Authorization: Bearer …`) to every request.

`201 Created`:

```json
{
  "ok": true,
  "invoice": {
    "token": "deadbeef00000000000000000000000000000000000000000000000000000001",
    "amount": 500,
    "reference": "DEMOQR0VZeK2MfbVRI6w36osd",
    "note": "Order #42",
    "status": "pending",
    "expires_at": "2026-01-01T00:30:00.000Z",
    "created_at": "2026-01-01T00:00:00.000Z",
    "claimed_at": null,
    "paid_at": null
  },
  "merchant": {
    "slug": "demo",
    "title": "DEMO STORE",
    "note": "Synthetic demo shop. Every payment here is fake — do not scan or send money.",
    "name": "DEMO STORE",
    "city": "Dhaka",
    "account_masked": "01000•••000",
    "institution": "bd.org.bb.npsb",
    "ref_prefix": "DEMO",
    "ref_len": 25,
    "presets": [100, 500, 1000],
    "verified": false
  },
  "payload": "0002010102122647…6304F835",
  "pay_url": "https://app.example.com/#/i/deadbeef00000000000000000000000000000000000000000000000000000001",
  "qr_svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" …></svg>"
}
```

Notes:

- `payload` is the dynamic Bangla QR payload derived from the merchant's static payload: same
  account/name/city/NPSB tokens, exact amount, reference embedded in tag `62`/`01`. It passes
  `deshiqr`'s checksum validation on the server before the invoice is stored.
- `qr_svg` is a self-contained SVG string (no scripts, no external references). Render it
  directly, or feed `payload` to any Bangla QR capable app / your own QR renderer.
- `pay_url` is the hosted invoice page (`https://<app-origin>/#/i/<token>`); hash routing keeps
  it working on static hosts.
- The response contains no user ids, no merchant uuid, no txid.
- There is no idempotency key: a retried request creates a second invoice. That is safe (the
  token is unique) but can confuse manual matching; generate one invoice per order.

## Read an invoice (public status)

```http
GET /functions/v1/invoice?token=<64 hex chars>
```

```bash
curl -sS "$SUPABASE_URL/functions/v1/invoice?token=deadbeef00000000000000000000000000000000000000000000000000000001"
```

`200 OK`:

```json
{
  "ok": true,
  "invoice": {
    "token": "deadbeef…0001",
    "amount": 500,
    "reference": "DEMOQR0VZeK2MfbVRI6w36osd",
    "note": "Order #42",
    "status": "claimed",
    "expires_at": "…",
    "created_at": "…",
    "claimed_at": "…",
    "paid_at": null
  },
  "merchant": { "slug": "demo", "title": "DEMO STORE", "verified": false, "…": "…" },
  "payload": "0002010102122647…6304F835",
  "pay_url": "https://app.example.com/#/i/deadbeef…0001",
  "qr_svg": "<svg …></svg>"
}
```

- `status` is the effective status: store `pending` invoices past `expires_at` read as
  `expired` even before anything sweeps them.
- `payload` / `qr_svg` are present while the invoice is `pending` or `claimed`, and `null` for
  `paid`, `expired` and `canceled` — a closed invoice no longer shows a scannable QR.
- The payload is rebuilt deterministically from the stored amount + reference, so it is
  byte-identical to the one returned at creation.
- Reads are rate limited per client IP (`DESHIQR_READ_RATE_LIMIT`, default 120/min).

## Claim "I paid"

A one-way `pending → claimed` transition, before expiry, with a payer-supplied transaction id.
`claimed` is **not** proof of payment — it only tells the merchant "this customer says they paid
with this txid". The merchant confirms manually (dashboard "mark paid") today.

```http
POST /functions/v1/invoice/claim
Content-Type: application/json

{ "token": "<64 hex chars>", "txid": "8N7A2K9XYZ" }
```

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/invoice/claim" \
  -H 'content-type: application/json' \
  -d '{"token":"deadbeef00000000000000000000000000000000000000000000000000000001","txid":"8N7A2K9XYZ"}'
```

`200 OK`:

```json
{ "ok": true, "status": "claimed" }
```

Rules:

- `txid` must be 4–64 characters of `A-Z a-z 0-9 . _ -` (`BAD_REQUEST` otherwise).
- The first successful claim wins; a second claim returns `409 ALREADY_PAID`. The customer
  cannot change the txid afterwards (the transition is one-way); the owning merchant can still
  see it in the dashboard.
- Claims after `expires_at` return `410 EXPIRED` and the invoice is marked `expired`.
- Canceled invoices also return `410 EXPIRED`.
- Claims are rate limited per client IP (`DESHIQR_CLAIM_RATE_LIMIT`, default 20/min).

## Rate limits

Fixed-window counters shared across edge-function isolates, stored in `deshiqr.rate_limits` and
incremented atomically by `deshiqr.take_rate_limit()`. The client IP is taken from
`x-forwarded-for` (Supabase sets it), then `cf-connecting-ip` / `x-real-ip`, otherwise
`unknown`.

| Operation | Key                                   | Default    |
| --------- | ------------------------------------- | ---------- |
| create    | `invoice:create:<merchant-slug>:<ip>` | 10 / 60 s  |
| claim     | `invoice:claim:<ip>`                  | 20 / 60 s  |
| read      | `invoice:read:<ip>`                   | 120 / 60 s |

The limiter **fails closed**: if it cannot record a hit (database error), the request is
rejected with `429 RATE_LIMITED` rather than allowed through. Lower the limits with the env
vars above; the window is fixed at 60 seconds.

## Using Supabase REST directly (no edge function)

Static web apps can read the public surfaces with the **anon key** — useful when you do not want
to route read traffic through the edge function. The base tables themselves are protected by
RLS and are not readable by `anon`.

**Published merchant by slug** (view `public_merchants`; never exposes `user_id`):

```bash
curl -sS "$SUPABASE_URL/rest/v1/public_merchants?select=slug,title,note,name,city,account_masked,presets,verified,base_payload&slug=eq.demo" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

**One invoice by token** (RPC `get_public_invoice`; no txid, no merchant uuid). This is the
only anonymous invoice read surface — there is deliberately no anon-readable view that lists
invoices, because invoice tokens are capability URLs:

```bash
curl -sS -X POST "$SUPABASE_URL/rest/v1/rpc/get_public_invoice" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H 'content-type: application/json' \
  -d '{"p_token":"deadbeef00000000000000000000000000000000000000000000000000000001"}'
```

**Claim directly** (RPC `claim_invoice`; same rules and errors as the edge endpoint, with
PostgreSQL error messages like `ALREADY_CLAIMED`, `EXPIRED`, `BAD_TXID`):

```bash
curl -sS -X POST "$SUPABASE_URL/rest/v1/rpc/claim_invoice" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H 'content-type: application/json' \
  -d '{"p_token":"deadbeef…0001","p_txid":"8N7A2K9XYZ"}'
```

Trade-offs of the direct REST paths:

- `get_public_invoice` is token-addressed and returns one row; `public_merchants` is
  published-only. Neither exposes owner data. `public.public_invoices` is a **service-role-only**
  view: it is not granted to `anon` or `authenticated`, precisely so nobody can list capability
  tokens, amounts or customer notes. Do not grant it back.
- `claim_invoice` called directly bypasses the edge function's per-IP rate limit. The
  one-way, once-only claim transition bounds the damage; add your own limiter if you expose it
  (see [`security.md`](./security.md)).
- **Invoice creation is not available over REST**: only the edge function (service role) can
  insert invoices. Do not grant `insert` on `public.invoices` to `anon`/`authenticated`.

## What is not here yet

No cancel/refund endpoints, no webhooks, no automatic payment confirmation, no hosted
"create invoice" UI for third parties. Provider confirmation is on the
[roadmap](./roadmap.md); the security implications are in [`security.md`](./security.md).

## Related

- [`format.md`](./format.md) — Bangla QR payload format and derivation rules
- [`demo-payloads.md`](./demo-payloads.md) — synthetic fixtures used in every example here
- [`self-hosting.md`](./self-hosting.md) — deploy the schema and function
- [`security.md`](./security.md) — threat model and limits
