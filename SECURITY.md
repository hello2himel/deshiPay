# Security policy

## What deshiQR is, in security terms

deshiQR edits Bangla QR **payloads**: it takes a merchant's static payload and an amount, and returns
the dynamic payload plus a QR image. It ships as one npm package (`deshiqr`), one Python package
(`deshiqr`, payload only) and a stateless HTTP endpoint (`POST /functions/v1/qr`). It runs no hosted
service, stores nothing, and has no accounts.

It is **not** a payment service provider:

- deshiQR never takes custody of funds, holds balances, or routes money.
- deshiQR does not confirm that a payment happened. A QR is an instruction to pay; nothing here proves
  money moved.
- deshiQR is not affiliated with bKash, Nagad, Rocket, or NPSB.
- Running a payment service in Bangladesh may require a Bangladesh Bank licence. Get local legal advice
  before building a business that handles money. This project deliberately stops at payloads.

## What is protected, and what is not

- **The payload is public data.** The account number is printed on shop walls and is meant to be
  scanned and shared. Masking it in a UI is cosmetic. The HTTP endpoint is unauthenticated for the same
  reason: anyone can already derive a QR from a public payload.
- **Nothing secret is stored or required.** The `qr` function needs no database, no keys and no
  secrets; there is no merchant record to leak. The only optional setting is `DESHIQR_CORS_ORIGIN`.
- **Verify your payload source.** The endpoint renders whatever valid payload it is given. A swapped or
  malicious payload produces a perfectly valid QR for the wrong account, so keep the base payload on
  your own trusted side and compare the name the banking app shows with the shop's name before paying.
- **Impersonation is the real risk.** Anyone can copy a QR from a shop and publish a page with the same
  account. deshiQR preserves the name, city, account and tokens verbatim when deriving payloads and
  never lets a caller override them. A page that shows a different name is a scam, not a supported
  feature.
- **QR swapping.** A printed poster can be replaced. deshiQR cannot detect that; the payer's app shows
  the account holder name for a reason.
- **Hosting misconfiguration.** If you put credentials in client code, you own that breach. The library
  and the component need none. deshiQR is not responsible for a third-party deployment.

## No real data in this repository

Fixtures are synthetic: account `01000000000`, `DEMO STORE`, dummy NPSB tokens. Never open a pull
request containing a real QR payload, screenshot, account number, or NPSB token.

## Reporting a vulnerability

Email **hello2himel@proton.me** with:

- a description and impact,
- reproduction steps or a minimal proof of concept,
- the affected package/version (npm `deshiqr`, pip `deshiqr`) and, if relevant, the deployment URL.

Please do not open a public issue for a live vulnerability. We aim to acknowledge within 72 hours and
to ship a fix or mitigation within 14 days for confirmed issues. Coordinated disclosure is appreciated;
credit will be given unless you prefer otherwise.
