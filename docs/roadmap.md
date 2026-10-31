# deshiQR roadmap

This page is deliberately conservative. Anything not marked **done** is **not built yet**, and
anything not verified against real provider payloads is not claimed as supported. No dates —
this is a volunteer project; the order below is the intended order.

## Where things stand

**Done today**

- `deshiqr` (core): parse, verify, derive (static ↔ dynamic, amount + bill-number reference),
  validation, BDT formatting. Zero dependencies.
- `deshiqr-qr`: QR encoder (versions 1–40, EC L/M/Q/H, automatic version+mask) and SVG/terminal
  renderers, cross-checked against an independent encoder and round-tripped through jsQR.
- `deshiqr-element`: `<deshiqr-pay>` web component (amount, presets, generated references, events,
  PNG download).
- `apps/web`: static-first pay pages, setup wizard, posters, embeds, dashboard (Supabase mode),
  local demo mode with no backend.
- `supabase/`: schema + RLS + public read surfaces, token-addressed invoices, one-way
  `pending → claimed` claim, fixed-window rate limiting, edge function `POST/GET /invoice`,
  `POST /invoice/claim`.
- Documentation: payload format, invoice API, self-hosting, security model, demo payloads.

**Not built yet:** automatic payment confirmation, provider-specific verification for anything
except bKash, merchant identity verification, wildcard subdomains, per-merchant API keys,
webhooks, cancel/refund flows, audit logs. Details below.

## 1. Provider coverage

Every QR deshiQR generates is a standard **Bangla QR** payload. It can be paid from any app that
accepts Bangla QR. The matrix says which providers we have actually validated.

| Provider                | Scan & pay a deshiQR QR           | Decode / derive in deshiQR | Notes                                                    |
| ----------------------- | --------------------------------- | -------------------------- | -------------------------------------------------------- |
| bKash                   | Yes                               | **Verified today**         | Payloads decoded against real bKash QRs; pinned by tests |
| Nagad                   | Yes, if the app accepts Bangla QR | Planned                    | Needs real sample payloads before we claim support       |
| Rocket                  | Yes, if the app accepts Bangla QR | Planned                    | Needs real sample payloads                               |
| Bank / NPSB apps        | Yes, if the app accepts Bangla QR | Planned                    | Shared `bd.org.bb.npsb` account template                 |
| Other Bangla QR wallets | Depends on the app                | Planned                    | Generic parser, unverified                               |

**Verified** means we have decoded and derived real payloads from that provider and our tests
pin the behaviour. **Planned** means the parser is provider-agnostic but we have not validated
real payloads yet, so we do not claim support. Do not overstate this in any README, doc, UI copy
or metadata.

The parser is already provider-agnostic: it reads EMVCo-style TLV, preserves the account
template/tokens verbatim, and applies the same CRC. Adding a provider is mostly _verification
work_, not new parsing code:

1. Obtain real, current sample payloads (static + dynamic, amount + bill number).
2. Review/value them privately — **never** commit real payloads, account numbers or tokens.
   The no-real-data rule in [`demo-payloads.md`](./demo-payloads.md) and
   [`security.md`](./security.md) is absolute.
3. Add **synthetic fixtures shaped like** the real ones (fake account prefix `01000000000`,
   `DEMO STORE`) and pin them in tests.
4. Check derivation round-trips in the provider's app (small real amounts, real accounts, done
   by the person who owns the account).
5. Only then flip the row to _Verified_ in tests, docs and UI.

## 2. Payment confirmation

The current model is manual: a customer presses "I paid", the invoice becomes `claimed`, and the
merchant confirms against their provider statement and marks it `paid`. That is honest but
labour-heavy, and `claimed` is not evidence (see [`security.md`](./security.md#the-manual-payment-confirmation-gap)).

Order of work:

1. **Manual (today).** Dashboard "mark paid" + the claim flow. Keep it good: copy shows a clear
   "unconfirmed" state, reconciliation fields (amount, reference, txid, timestamps) are stored,
   and docs tell merchants exactly how to match a payment.
2. **SMS/notification parsing (next, optional).** Many merchants get an SMS or provider push
   notification for each payment. A companion app could parse that on-device and mark an invoice
   `paid`. Risks to solve first: spoofed SMS, forwarding, duplicate/late messages, partial
   amounts, privacy of the merchant's notification feed, and the need for a trusted device —
   it should be advisory (needs merchant confirmation) before it is authoritative.
3. **Official provider merchant API (the real fix).** bKash/Nagad/Rocket merchant APIs (where
   available to your merchant account) with signed webhooks or polling let the server confirm
   amount, reference and txid. This requires provider onboarding, credentials, sandbox testing,
   and a signature/replay-protection design. It also means deshiQR would store provider
   credentials — a significant security commitment; likely opt-in and self-hosted-only.
4. **Reconciliation tools.** Import a statement/CSV, suggest matches by reference/amount/time,
   bulk-confirm. Useful even after APIs land.

Until (2) or (3) exists, the hosted invoice page must keep saying "claimed means you said you
paid; the merchant confirms separately".

## 3. Generated references

When a merchant's QR has no bill number (`ref_len = 0`), the invoice function generates a
25-character reference and embeds it in tag `62`/`01`. That mirrors real bKash dynamic QR shape
(real bKash dynamic QRs carry a 25-character bill number today), but **it is derived by
deshiQR, not issued by bKash**.

- [ ] Test generated references with a small amount on each account type you support before
      relying on them for reconciliation.
- [ ] Prefer the merchant's own reference scheme when they have one (`ref_prefix` / `ref_len` in
      the merchant row, or an explicit `reference` per invoice).
- [ ] Document provider-specific reference behaviour as we verify each provider.

## 4. Verification badges

`verified` exists as an admin-only field (default `false`, owners cannot write it, the public
view exposes it read-only). What is missing is the _process_:

- [ ] A review checklist before a merchant gets the badge: who they are, that the payload
      belongs to them, a contactable channel, and that the shop page describes a real business.
- [ ] An admin workflow/tool for reviewing and toggling badges (service role only; no
      self-service).
- [ ] Copy that says the badge means "manually reviewed", not "guaranteed/escrow-protected".
- [ ] Public anti-impersonation guidance ("check the account/name in your payment app, use the
      merchant's official channel").
- [ ] Revocation flow (e.g. `suspended` status already hides a shop from the public view).

## 5. Custom domains and wildcard subdomains

Today merchants are addressed by slug (`/p/<slug>`, `#/p/...` fallbacks) and invoices by token
(`/#/i/<token>`). Planned:

- [ ] **Custom domains** for the hosted app (documented in [`self-hosting.md`](./self-hosting.md)):
      one domain per deployment, configured via env. Mostly a hosting/ops task.
- [ ] **Wildcard subdomains** for merchants (e.g. `<slug>.deshiqr.example`): wildcard DNS + a
      wildcard TLS certificate at the static host/proxy, tenant resolution from the hostname,
      and careful canonical redirects (also for link previews/QRs already printed). Netlify and
      similar hosts support wildcard domains on paid plans; Vercel/Cloudflare differ.
- [ ] Custom domains _for merchants_ (their own `pay.brand.com`): requires per-domain TLS,
      verification of domain ownership, and a DNS/proxy story for static hosting — likely a
      Cloudflare Workers-style edge router. Not started.
- [ ] Changes here must not break printed QR codes or shared `/#/...` links.

## 6. Hosted API hardening

The invoice API is intentionally small (create, read, claim) and public-IP rate limited. Planned
hardening, roughly in order:

- [ ] **Per-merchant API keys** for server-to-server invoice creation (today anyone can create an
      invoice for any published merchant; rate limits are per IP). Keys would be hashed,
      rotatable, scoped to one merchant, and sent by the merchant's backend — not a browser.
- [ ] **Idempotency keys** on `POST /invoice` (a retried request should not create a second
      invoice).
- [ ] **Webhooks** (`invoice.claimed`, `invoice.paid`) with HMAC signatures + retries, so
      merchant backends stop polling.
- [ ] **Cancel / expire endpoints and a sweep** — `canceled`/`expired` statuses exist; a cron
      sweep (pg_cron) should close stale pending invoices, and a merchant endpoint should cancel.
- [ ] **Audit log** for admin actions (`verified` changes, suspensions) — the guard trigger is
      the only control today.
- [ ] **Stronger abuse controls:** CAPTCHA/bot detection on create, per-token claim limits,
      anomaly alerts, optional `anon` revocation of the direct `claim_invoice` RPC.
- [ ] **Observability:** structured logs, metrics for created/claimed/paid, rate-limit
      denials, error rates.
- [ ] **Versioned OpenAPI schema** for `v1`, with compatibility policy (additive changes only;
      breaking changes get `/v2`).
- [ ] **Policy for retention/deletion** of invoice metadata and merchant data (data
      minimisation + export/delete on request).

## 7. Non-goals

To be explicit, these are **not** planned, because a QR transfer between two accounts cannot
provide them:

- Custody of funds, escrow, or "hold until delivery".
- Refunds, chargebacks, reversals created by deshiQR (only the provider can do those, in the
  merchant's/customer's app).
- Being a payment service provider / payment gateway / payment aggregator under Bangladesh Bank
  rules. See the notice in [`security.md`](./security.md).
- Storing or transmitting real merchant payment credentials.
- Automatic merchant identity/KYC checks beyond a manual review process.

## 8. How to help

- **Provider samples:** if you own a Nagad/Rocket/bank Bangla QR account, you can help verify
  support — review the payload privately with the maintainers and contribute **synthetic**
  fixtures. Never open a PR/issue with real account data.
- **Testing:** run `pnpm test`, `pnpm typecheck`, and `node scripts/check-sql.mjs`, and report
  reproducible failures.
- **Docs:** the security/self-hosting docs should stay accurate; if reality differs from these
  pages, that is a bug.

## 9. Versioning

The invoice API is `v1`: fields may be added, but existing fields, error codes and status
transitions will not be removed/changed without a new version. The library packages follow
semver; `deshiqr`/`deshiqr-qr`/`deshiqr-element` are `0.x` until the contract in
[`architecture.md`](./architecture.md) settles.
