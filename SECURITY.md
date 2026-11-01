# Security policy

DeshiPay is the **website** (Netlify + Supabase) where people and businesses receive payments, donations and support through payment pages built on Bangla QR payloads. The
payload engine is a separate project: [deshiQR](https://github.com/hello2himel/deshiQR).

## What DeshiPay is, in security terms

- It hosts **public payment pages**: a username, a display name/note, the amount-free base of a Bangla
  QR, and optional wallet/bank details that the page owner entered. Anyone with the link can see them —
  that is the product.
- Accounts are email + password via **Supabase Auth**; page rows live in Supabase Postgres with
  **row-level security** (only the owner can update their row; public pages are read through a limited
  SQL function).
- The browser uses the Supabase **anon key**, which is designed to be public. The service key never
  ships in the site repo or the browser.
- The site **never handles money**: it generates QR payloads in the browser and shows payment details.
  It does not confirm payments, hold funds, or act as a payment service provider. Running a payment
  business in Bangladesh may require a Bangladesh Bank licence — get local legal advice.

## Protecting your page

- The QR payload and payment details you publish are public by design. Don't add anything to a page you
  are not comfortable sharing.
- Always verify the merchant name and amount in the banking app before paying; the site cannot detect
  impersonation of a QR or a page.
- Keep your account password unique. Report suspicious pages to the address below with the page URL and
  a screenshot.

## What is protected, and what is not

- HTTPS everywhere; strict CSP and security headers via `netlify.toml`.
- All user-entered strings are escaped in the DOM; the standalone export only ever receives the
  page's own stored data and inlines a fixed CSP.
- Supabase RLS and the `get_public_page` function gate reads; the schema/tests live in `supabase/`.
- The site's dependencies are deliberately small and vendored (`qrcode-generator`, `jsQR`,
  `supabase-js`, the deshiqr bundle). Keep them current.
- A misconfigured environment (e.g. exposing a service key in a build env var) is outside the code's
  protection. Never put the Supabase service key in `SUPABASE_ANON_KEY`.

## Reporting a vulnerability

Email **hello2himel@proton.me** with steps to reproduce and the affected URL. Please don't open a
public issue for a live vulnerability; we answer as quickly as we can.
