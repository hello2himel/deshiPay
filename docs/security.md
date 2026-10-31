# Security model and threat notes

deshiQR is a toolkit for **Bangla QR** payment payloads: you can parse/verify/derive payloads,
render QR codes, host pay pages, and create token-addressed invoices. This document is honest
about what that does and does not protect. It is not legal, financial or compliance advice.

> **deshiQR is not a payment service provider and never holds, moves, escrows or settles
> funds.** It generates QR codes and records what a customer _claims_ they paid. The actual
> payment happens entirely inside the customer's bKash/Nagad/Rocket/bank app, between the
> customer and the provider, against the merchant's own account. deshiQR has no custody, no
> API connection to the providers, no ability to reverse or confirm a payment, and no access to
> anyone's funds.
>
> Taking payments and making payment services available in Bangladesh is regulated (Bangladesh
> Bank rules for payment service providers, payment aggregators and payment gateways).
> **Consult a qualified lawyer and, if needed, Bangladesh Bank before deploying anything
> commercial.** Nothing in this repository makes you compliant or exempt.

---

## Assets and attackers

Assets: merchant identity (whose shop a pay page belongs to), the merchant's base payload
(account number + name + NPSB tokens — public once printed, but must not be swapped), invoice
tokens (`/#/i/<token>` capability links), invoice metadata (amount, reference, note), the
customer's transaction id (`txid`), and the Supabase service-role key.

Attackers: a scammer impersonating a business, a squatter taking a route-like slug, someone who
can swap a printed QR sticker, an anonymous client spamming the public invoice API, a customer
(or anyone) pressing "I paid" falsely, and anyone who gets hold of a leaked link or key.

---

## Threat model

| Threat                                  | What could happen                                                                                                                 | What this repo does about it                                                                                                                                                                                                                                                                                                                                                                  | Residual risk                                                                                                                                                                                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Impersonation**                       | Someone creates a shop named like a real business and collects payments to _their own_ bKash account.                             | Addressed structurally: the payload's account/name/tokens come from the merchant's own QR and are preserved verbatim; the pay page shows the account masked and the merchant name. A `verified` badge exists for manually reviewed merchants.                                                                                                                                                 | **No identity verification is implemented.** Unverified shops are indistinguishable from a newly created page. Do not trust a payment link just because it is hosted here; check the account/name and the merchant's own channels.                            |
| **Slug squatting**                      | Attacker registers `login`, `dashboard`, `bkash`, `deshiqr`, `demo`, etc.                                                         | Reserved slugs are rejected by a trigger (`deshiqr.guard_reserved_slug`) and slugs are unique.                                                                                                                                                                                                                                                                                                | Slugs are first-come-first-served; `my-real-shop` can still be taken by someone else. Business names are not tied to slugs (that is the verified-badge work).                                                                                                 |
| **QR swapping**                         | Attacker replaces a printed QR/poster or edits the payload in an embedding page to point at their own account.                    | a. Derived payloads are built from the **merchant's stored base payload** and preserve account/name/tokens verbatim — the server never accepts an arbitrary QR from the browser and forwards it. b. Every payload is CRC-validated by the library, in the database CHECK constraint, and re-validated server-side. c. The QR SVG is generated locally with no external references or scripts. | **CRC only proves integrity, not ownership.** A swapped sticker with a valid QR still works. deshiQR cannot detect a physical swap. Use tamper-evident posters, verify your printed material, and never let a client-side string override the stored payload. |
| **Fake "verified" badge**               | An owner sets `verified = true` on their own row to look reviewed.                                                                | `verified` defaults to `false`; the `authenticated` role has **no column grant** for it, so writes are rejected; a guard trigger also blocks changes from non-admin roles; the public view exposes the badge read-only.                                                                                                                                                                       | The onboarding review itself is a human/process control that does not exist yet; `verified` means "someone with service-role access marked this row", not a background check.                                                                                 |
| **Invoice API abuse**                   | Anonymous clients spam invoice creation, enumeration or claim attempts; that could inflate the DB or enable cheap phishing links. | Fixed-window rate limits on create (per merchant + IP), claim (per IP) and read (per IP), stored atomically in `deshiqr.rate_limits`; the limiter **fails closed**. Invoice tokens are 244 bits of randomness (two v4 UUIDs). Claiming is one-way and once-only. No account data is returned.                                                                                                 | IP-based limits are weak against distributed abuse/proxies; there is no CAPTCHA, no per-merchant API key and no WAF in this repo. Monitor usage and add edge/WAF controls for production.                                                                     |
| **Invoice enumeration / token leakage** | Someone lists all hosted invoices and gets every capability link, amount and note.                                                | `public.invoices` and the `public.public_invoices` view are **not readable by `anon`** (or `authenticated`); the only public read is token-addressed `get_public_invoice(token)` and the edge function, which requires the exact 64-hex token. `public_merchants` is deliberately listable (shops are public pages). `txid` is never exposed publicly.                                        | A token shared in a screenshot, chat, referrer URL or proxy log is a working link to that invoice (status + payload while pending). Tokens are not secrets against someone you sent the link to.                                                              |
| **False "I paid" claim**                | Anyone can `POST /invoice/claim` with a made-up `txid` and turn an invoice `claimed`.                                             | The claim is explicitly a **customer signal**, not proof; it is gated by `pending → claimed`, once, before expiry, with a validated txid format; the merchant dashboard can only mark `paid` manually.                                                                                                                                                                                        | **This is the primary unresolved gap.** Anyone with an invoice link can fake a claim. Never deliver goods/services based only on `claimed`; confirm the money in your provider statement.                                                                     |
| **Direct RPC bypass of edge limits**    | The `claim_invoice` RPC is callable with the anon key directly and skips the edge function's per-IP limiter.                      | One-way/once-only transition bounds abuse; docs recommend the edge function.                                                                                                                                                                                                                                                                                                                  | Add your own proxy/limiter or `revoke execute on function public.claim_invoice from anon` if you don't expose the RPC.                                                                                                                                        |
| **Service-role key leak**               | Full database access bypassing RLS.                                                                                               | The key exists only in Supabase's function environment; the repo never contains keys, and examples/docs use placeholders.                                                                                                                                                                                                                                                                     | If it leaks, rotate it (Project Settings → API) and redeploy the function. Treat it like a password.                                                                                                                                                          |
| **SQL injection / stored XSS**          | Malicious strings break queries or execute script in dashboards/pay pages.                                                        | Database access from the function uses PostgREST JSON routes (no string-built SQL); security-definer functions pin `search_path = pg_catalog`; the schema does **not** accept arbitrary payloads (CRC CHECK); titles/notes are plain text and rendered as text by the app (no `innerHTML`); SVG is generated by the local encoder with escaped attributes.                                    | Application rendering is a separate trust boundary; audit the UI when you add rich text or custom HTML.                                                                                                                                                       |
| **DoS on the function**                 | Flooding the function exhausts quotas or DB connections.                                                                          | Rate limits + small bundle + bounded body sizes (note ≤160, reference ≤32).                                                                                                                                                                                                                                                                                                                   | No WAF/bot protection here; Supabase and your proxy provide that layer.                                                                                                                                                                                       |
| **Stolen token / leaked invoice link**  | Anyone with `/#/i/<token>` can read status and see the QR while pending.                                                          | Expected by design: the QR/amount are the payer's data, and `txid`/owner data are never exposed; nothing sensitive is behind the token beyond that invoice.                                                                                                                                                                                                                                   | An invoice link is a capability URL; don't treat it as a secret.                                                                                                                                                                                              |

---

## What this repository does protect

- **Owner isolation by RLS.** `anon` has no direct access to `merchants` or `invoices`. Logged-in
  owners can only see/edit their own merchants (and their invoices) — enforced in Postgres, not
  in app code.
- **Server-managed fields.** Owners cannot set `verified`, transfer a merchant to another user,
  or edit invoice amount/reference/txid via column grants + a guard trigger.
- **Public read surface minimisation.** `public_merchants` only exposes published shops and never
  `user_id`/internal ids. Invoice reads are token-addressed only; the `public_invoices` view is
  service-role-only. `txid` never leaves the database through any anon surface.
- **Payload integrity.** A wrong/truncated/edited payload fails CRC validation in the library,
  in the database CHECK constraint, and again in the edge function before a QR is rendered.
- **Capability tokens.** 64 hex characters from two v4 UUIDs (~244 random bits) — not guessable
  or enumerable; unique index; only created by the service role.
- **One-way claims.** `pending → claimed` happens once, before expiry, with a validated txid and
  a row lock (concurrent claims cannot both win). Expired invoices are committed as `expired`.
- **Rate limiting.** Shared, atomic, fail-closed counters; configurable per deployment.
- **Reserved slugs.** Route names and provider/demo names cannot be registered by ordinary
  owners.
- **No secrets or real payment data in the repo.** No `.env`, no real account numbers, names,
  tokens or payloads; everything testable is synthetic (`docs/demo-payloads.md`).

## What it does **not** protect

- It does **not** verify that a merchant is who they claim to be. The badge is a manual review
  flag, not KYC.
- It does **not** confirm payments. `claimed` means "the customer said so"; `paid` means a
  merchant pressed a button.
- It does **not** detect a swapped/printed QR, or a compromised merchant device/browser.
- It does **not** provide escrow, refunds, chargebacks, dispute handling or customer support
  obligations — none of that exists in a QR transfer, and deshiQR cannot create it.
- It does **not** protect against a leaked invoice link or a leaked service-role key.
- It does **not** provide WAF/DDoS protection, bot detection, audit logging, or per-merchant API
  credentials (all roadmap/deployment concerns).
- It does **not** guarantee that any provider app accepts every payload; see the provider matrix
  below.
- It does **not** make you a licensed/regulated payment provider.

---

## The manual payment-confirmation gap

This is the most important operational limitation, so it is called out explicitly:

1. A customer creates an invoice; the QR embeds an exact amount and a bill-number reference.
2. The customer pays **inside their own bKash/Nagad/Rocket/bank app**, to the merchant's own
   account. deshiQR is not involved in the transfer and receives no notification.
3. Optionally the customer presses "I paid" on the hosted page → invoice `claimed` + a `txid`
   string. **This is unverified input.** Anyone with the link can submit any plausible txid.
4. The merchant must **manually confirm** the payment in their provider statement (amount,
   reference, time window), then mark the invoice `paid` in the dashboard.

Until a provider confirmation channel exists (see [`roadmap.md`](./roadmap.md)), do not
automatically deliver high-value goods/services on `claimed`. Practical mitigations:

- Match on **amount + reference + time window**, not just amount.
- Treat `txid` as a hint from the customer, not as evidence; verify it in the provider app.
- Keep the invoice record (it stores the txid, claim/paid timestamps) for reconciliation.
- For high values, wait for the statement/notification instead of the claim.
- Generated references (merchants with no bill number yet) are derived by deshiQR, not issued
  by the provider — test with small amounts per account type before relying on them.

---

## Rate limiting

Implemented in `deshiqr.take_rate_limit()`, a security-definer function over the
`deshiqr.rate_limits` table with an atomic `insert … on conflict do update … returning`. It is
called from the edge function with the service role. Fixed windows, 60 seconds:

| Operation      | Key                                          | Default      |
| -------------- | -------------------------------------------- | ------------ |
| Create invoice | `invoice:create:<merchant-slug>:<client-ip>` | 10 / window  |
| Claim          | `invoice:claim:<client-ip>`                  | 20 / window  |
| Read invoice   | `invoice:read:<client-ip>`                   | 120 / window |

The client IP comes from `x-forwarded-for` (Supabase's proxy sets it), then `cf-connecting-ip`
/ `x-real-ip`, else `unknown`. If the limiter errors it **denies** the request (fail closed). If
your proxy strips the IP header, all traffic collapses onto one key — configure `x-forwarded-for`
forwarding. Tune with `DESHIQR_CREATE_RATE_LIMIT`, `DESHIQR_CLAIM_RATE_LIMIT`,
`DESHIQR_READ_RATE_LIMIT`.

The anon-key RPC path (`claim_invoice` via PostgREST) is **not** behind this limiter; the
once-only transition is what bounds it. See the direct-REST notes in [`api.md`](./api.md).

## Reserved slugs and the no-real-data policy

- `admin, api, auth, dashboard, login, new, p, i, m, support, help, about, terms, privacy, docs,
status, billing, demo, bkash, nagad, rocket` are rejected for ordinary owners so app routes
  and provider names cannot be squatted. The seed/migration role may still create `demo`.
- **No real merchant or payment data is ever committed to this repository.** All fixtures, seeds,
  examples and docs use the synthetic payloads in [`demo-payloads.md`](./demo-payloads.md):
  fake account `01000000000`, `DEMO STORE`, dummy NPSB tokens. A committed real payload would
  leak someone's account number and point test QR codes at a real shop. If you need real
  samples to verify a provider, review them privately, out of band — never in a commit, issue,
  screenshot or test fixture.

## Provider support is not overclaimed

bKash payloads are the ones decoded against real QR codes and pinned by tests — that is the
only "verified" claim. Nagad, Rocket, bank/NPSB apps and other wallets are **planned/unverified**
until we have real sample payloads in a private review. Any Bangla QR generated here can be
scanned by an app that accepts Bangla QR, but we do not claim validated support for providers
whose payloads we have not seen. See [`roadmap.md`](./roadmap.md) and `docs/architecture.md` §1.

## Responsible disclosure

Found a vulnerability? Please report it **privately**:

- email the maintainer listed in the repository `package.json` (`author` field), or
- open a private GitHub security advisory on the repository.

Include a description, affected version/commit, reproduction steps and impact. **Do not send
real merchant data, real QR payloads, account numbers or tokens** — reproduce with the synthetic
fixtures. Please allow reasonable time to investigate and release a fix before public
disclosure. This is a community project maintained without a bug-bounty programme; reports are
handled on a best-effort basis.

## Deployment checklist

- [ ] Deploy the function with service-role key present; never expose that key client-side.
- [ ] Set `DESHIQR_APP_ORIGIN` and `DESHIQR_CORS_ORIGIN` to your real origin; redeploy after
      changing secrets.
- [ ] Keep the `public_invoices` view and `invoices` table ungranted to `anon`/`authenticated`.
- [ ] Keep `verified` admin-only (column grants + trigger).
- [ ] Disable public sign-ups if only invited merchants should register.
- [ ] Rotate keys if anything leaks; keep `.env` out of git.
- [ ] Monitor rate-limit/`INTERNAL` logs; add WAF/bot protection for production.
- [ ] Do not seed demo data into production, or delete the demo merchant afterwards.
- [ ] Confirm payments manually until a provider API is integrated.
- [ ] Get legal/regulatory advice before operating commercially.
