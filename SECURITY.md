# Security policy

## What deshiQR is, in security terms

deshiQR is a **payload toolkit and static web app** for Bangla QR payment codes. It parses and
derives QR payloads, renders them, and (optionally) stores them in your own Supabase project.

It is **not** a payment service provider:

- deshiQR never takes custody of funds, holds balances, or routes money.
- deshiQR does not confirm that a payment happened. The dashboard's "mark paid" action is a manual
  bookkeeping step by the merchant, and the invoice API records customer claims, not settlements.
- deshiQR is not affiliated with bKash, Nagad, Rocket, or NPSB.
- Running a payment service in Bangladesh may require a Bangladesh Bank licence. Get local legal
  advice before building a business that handles money. The project deliberately stops at payloads.

## What we protect

- **Merchant accounts** (Supabase Auth + Row Level Security): drafts, invoices, and account metadata
  are owner-only. Public read surfaces (`public_merchants`, `public_invoices`) only expose published
  merchants and token-addressed invoices, never `user_id`.
- **The QR payload itself is public by design.** The account number is printed on shop walls and is
  meant to be scanned and shared. Masking it in the UI is cosmetic.
- **The invoice token** is a 256-bit random value; treat the hosted invoice URL as a capability link.

## What deshiQR cannot protect against

- **Impersonation.** Anyone can copy a QR from a shop and publish a page with the same account. The
  QR carries the real account holder's name; deshiQR preserves the name, city, account and tokens
  verbatim when deriving payloads, and never lets a user override them. A page that shows a different
  name is a scam, not a supported feature. Merchants are `unverified` until a real verification flow
  exists.
- **QR swapping.** A printed poster can be replaced. Always compare the name shown by the banking app
  with the shop's name before paying.
- **Payment confirmation.** Nothing here proves money moved. Treat "claimed" as a customer statement.
- **Hosting misconfiguration.** If you deploy with the Supabase service-role key in client code, you
  own that breach. Never ship the service key; the anon key is the only public key.

## No real data in this repository

Fixtures are synthetic: account `01000000000`, `DEMO STORE`, dummy NPSB tokens. Never open a pull
request containing a real QR payload, screenshot, account number, or NPSB token.

## Reporting a vulnerability

Email **hello2himel@proton.me** with:

- a description and impact,
- reproduction steps or a minimal proof of concept,
- the affected package/version and, if relevant, the deployment URL.

Please do not open a public issue for a live vulnerability. We aim to acknowledge within 72 hours and
to ship a fix or mitigation within 14 days for confirmed issues. Coordinated disclosure is
appreciated; credit will be given unless you prefer otherwise.

## Hardening checklist for self-hosters

- Keep the `invoice` function's service-role key server-side (Supabase injects it as an env var; do
  not print it).
- Apply `supabase/schema.sql` completely — the RLS policies and column grants are part of the
  security model, not optional extras.
- Set `DESHIQR_APP_ORIGIN` for the edge function so invoice links point at your real domain.
- Configure a custom SMTP sender for Supabase magic links if you expect real users.
- Rate limiting in this repo is best-effort (per-IP/per-merchant via the `take_rate_limit` helper). A
  public deployment should add provider-level protection (e.g. Cloudflare) in front of the function.
- Keep dependencies updated; the libraries themselves are dependency-free on purpose.
