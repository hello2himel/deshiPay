# DeshiPay website

> This is the **DeshiPay website**, the [DeshiPay repo](../README.md) (served at
> <https://deshipay.netlify.app>). The payload-editing engine it runs comes from the separate
> [deshiQR](https://github.com/hello2himel/deshiQR) library repo; this directory adds the pages, the
> Supabase auth/database and the editor UI on top.

One page to **receive payments, donations and support**. Anyone signs up, adds the Bangla QR they already
use (bKash, Nagad, Rocket, Upay, any bank app) plus optional wallet/bank details, and picks a link. Their
page at `yourdomain.com/username` puts the live, amount-ready QR first and the copyable details beside
it, for a sale, an invoice, a tip, a donation or support. The QR is the headline method; the page is the
complete way to get paid.

- **Static site** (plain HTML/CSS/JS, no build step for the pages) hosted on **Netlify** at <https://deshipay.netlify.app>
- **Auth + database** on **Supabase** (email/password, Postgres with Row Level Security)
- **Light/dark toggle** in the nav: follows the OS by default, remembers an explicit light or dark choice per browser
- **Payload editing in the browser** comes from the separate [deshiQR](https://github.com/hello2himel/deshiQR) engine: the site vendors the browser bundle at `public/vendor/deshiqr.global.js`, and `public/js/payload.js` is the thin site adapter that exposes it to the pages
- **Works without the database**: if Supabase is paused or unreachable, the landing page offers a no-login wizard and the page can be downloaded as one standalone HTML file to host anywhere. The login page also always offers **"Create a page without login"** (`/app?local=1`), which opens the same account-free wizard with the Download step even when sign-in is online (see [Offline mode](#offline-mode-paused-supabase-and-the-standalone-download))
- The page **only shows payment details**, no payment confirmation and no money handling of any kind. Customers pay from their own app, whether that is a QR scan or a wallet/bank transfer.

```
site/
  public/
    index.html        landing page (hero, live payment demo, "Create your page" CTA)
    login.html        sign up / sign in page (served at /login)
    app.html          dashboard: onboarding wizard, then the editor (served at /app)
    pay.html          the customer page (served at /<username>)
    terms.html        terms of service
    privacy.html      privacy policy
    contact.html      contact + FAQ
    404.html
    sitemap.xml       static sitemap (home, terms, privacy, contact)
    css/              base, pay (customer page), studio (landing + dashboard), themes (generated)
    js/payload.js     thin site adapter over the vendored deshiqr engine (payload editing)
    js/reader.js      reads a QR out of a screenshot, in the browser
    js/payview.js     renders the customer page (also the live preview)
    js/export.js      builds the standalone single-file HTML export (see Offline mode)
    js/dashboard.js   onboarding + editor (online, and local mode when the backend is down)
    vendor/           qrcode-generator (MIT), jsQR (Apache-2.0), supabase-js (MIT),
                      deshiqr.global.js (MIT, vendored from the deshiQR engine repo)
  scripts/            build-config.js, gen-themes.js, dev-server.js
  (every page shares a site footer with product/legal/support links)
  tests/              qr.test.js (engine adapter), export.test.js (standalone export),
                      e2e/ (browser smoke test, optional)
```

The **unified sign-in/sign-up form** gets its own page at **`/login`** (the landing page only has a
"Create your page" button that links there), so the homepage stays a landing page. There is one email +
password form: it tries to sign in first, and creates the account if the email is new; the same card
offers "Forgot password?" and the no-login flow.

The database schema and Supabase config live at the **repo root**: `supabase/migrations/` (versioned SQL,
applied automatically by the Supabase GitHub integration) and `supabase/config.toml`.
The Netlify config is at the **repo root** (`netlify.toml`), with `base = "site"` and `publish = "public"`.

---

## Engine (payload editing)

The QR payload logic is not duplicated in this site. The engine is its own project:
[**deshiQR**](https://github.com/hello2himel/deshiQR) (npm [`deshiqr`](https://www.npmjs.com/package/deshiqr),
PyPI [`deshiqr`](https://pypi.org/project/deshiqr/), browser bundle on GitHub Pages). This site keeps a
committed copy of the IIFE bundle at `public/vendor/deshiqr.global.js` (global `window.DeshiQR`), and
`public/js/payload.js` adapts it to the shape the pages use.

To update the bundle: build/copy `deshiqr.global.js` (and its source map) from a deshiQR release or a
local build of that repo into `public/vendor/`, then commit the refreshed files. The site has no build
step and CI does not need the library toolchain.

---

## Setup (about 10 minutes)

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **Create the tables, automatically.** Supabase Dashboard → *Project Settings → Integrations → GitHub*, authorize this repository, set **Working directory** to `.`, and enable **Deploy to production**. Every push to `main` then applies the SQL in [`supabase/migrations/`](../supabase/migrations/) automatically. (Manual alternative: paste those files, in filename order, into the SQL editor once, safe to re-run.)
3. **Project Settings → API**: copy the **Project URL** and the **anon / publishable** key. Never use the `service_role` key in this app.
   The site URL, `/app` redirect URLs, the auth options (sign-ups on, anonymous sign-ins off,
   email confirmations on, 6-digit OTP length/expiry, JWT expiry) and the branded email templates under
   [`supabase/templates/`](../supabase/templates) are versioned in
   [`supabase/config.toml`](../supabase/config.toml) and applied by the same integration, see
   *Supabase project settings (as code)* in [`docs/website.md`](../docs/website.md).
4. **Authentication → URL Configuration**:
   - **Site URL**: the deployed site, e.g. `https://deshipay.netlify.app` (or your custom domain)
   - **Redirect URLs**: add `https://deshipay.netlify.app/app` (and `http://localhost:8888/app` for local work)
   These are used by the confirmation and password-reset emails (both send a 6-digit code).
5. **Authentication → Providers → Email**: leave on, and turn **Confirm email** on so new accounts verify with the 6-digit code. If the hosted project's templates show the default Supabase wording, paste the files from [`supabase/templates/`](../supabase/templates) into **Authentication → Emails** (or apply `config.toml` with the Supabase CLI).
6. Optional: enable **Google** under Providers, then set `GOOGLE_AUTH=true` (see below) to show the button.

### 2. Netlify

1. Push this repo to GitHub and **Add new site → Import from Git**. The repo-root `netlify.toml` points Netlify at this directory (`base = "site"`, `publish = "public"`). (Netlify Drop skips the build step, so if you use it, edit `public/js/config.js` by hand first.)
2. Build settings come from `netlify.toml`: publish directory `public` under `site/`, build command `node scripts/build-config.js` only. The engine bundle is vendored and committed (`public/vendor/deshiqr.global.js`), so Netlify does not build the library; update it from a deshiQR release when the engine changes. Nothing else to fill in.
3. **Site configuration → Environment variables**:

   | Variable | Value |
   |---|---|
   | `SUPABASE_URL` | `https://xxxx.supabase.co` |
   | `SUPABASE_ANON_KEY` | your anon key |
   | `GOOGLE_AUTH` | `true` (only if you enabled Google) |

4. Deploy. The build fails with a clear message if the two required variables are missing (unless you
   deploy offline-only: set `SITE_OFFLINE=true` instead, no accounts, but the "Create my page" flow
   and standalone HTML downloads work). The live site is <https://deshipay.netlify.app>.

The anon key is public by design; it ends up in the browser. What protects the data is Row Level Security (below). On public repos Netlify's secret scanning may flag these values once the build writes `public/js/config.js`; the repo-root `netlify.toml` sets `SECRETS_SCAN_OMIT_KEYS = "SUPABASE_URL,SUPABASE_ANON_KEY"` (or add that variable in Netlify's UI / use `SECRETS_SCAN_OMIT_PATHS = "site/public/js/config.js"`). Never expose the `service_role` key.

### 3. Local development

```bash
# from the repo root (Node >= 20; no install needed)
node site/scripts/dev-server.js          # http://localhost:8888
PORT=8889 node site/scripts/dev-server.js
```

To point the site at Supabase, either edit `site/public/js/config.js` by hand, or export the variables
and let the build script write the file:

```bash
export SUPABASE_URL=https://xxxx.supabase.co SUPABASE_ANON_KEY=your-key
node site/scripts/build-config.js        # writes site/public/js/config.js from the variables
```

From inside `site/` the equivalent scripts are `npm run dev`, `npm run build`, `npm run themes` and
`npm test`.

`netlify dev` works too if you have the Netlify CLI (run it from the repo root; the root `netlify.toml`
carries the rewrite rules). A plain static server does not, because `/<username>` needs the rewrite to
`pay.html`.

---

## How it works for users

**Onboarding (first visit to `/app`)**, four steps:

1. **Say who you are**: name or business name, and the link (`yourdomain/username`, checked live for availability).
2. **Drop your Bangla QR**: upload, take a photo, paste a screenshot, or paste the code text. It's decoded in the browser; the image is never uploaded.
3. **Other ways to pay** (optional): mobile wallets (bKash, Nagad, Rocket, Upay, Tap, mCash, OK Wallet, SureCash, MyCash, Pathao Pay, other) with account type, and bank accounts (bank, account name, number, branch, routing number, SWIFT).
4. **Make it yours**: compact rows show the current avatar, colour and quick amounts; tapping a row
   opens a picker sheet (about 40 line icons or your initials, the 10 colour themes with matching dark
   mode, and the quick-amount editor). The selected value is always visible without opening anything.

After publishing, the same sections become tabs, plus **Share** (link, link with a locked amount, a QR of the page, show/hide, delete).

**Customer page**: pick *Scan QR*, *Wallet* or *Bank* (only the ones the owner set up). For QR, type an amount (Bangla digits work) and the QR appears. On phones, *Save QR image* opens the share sheet so it can be saved and picked from the gallery inside a banking app. Wallet numbers and bank lines are tap-to-copy.

### Payments tab (links + amount poster)

Once a page is published, the dashboard has a **Payments** tab for requesting a specific amount:

- **Locked amount** → `/<username>?amount=500` (customer cannot change it). Open or copy the link.
- **Preferred amount** → `/<username>?preferred=500` (page opens prefilled, but the customer can edit).
- **Poster with this amount** → the same A4/A5 poster, but its QR is generated with the amount baked
  in, so the app opens with the amount filled. The amount is printed above the app icons.

Both amounts are capped at **৳50,000**. The Payments tab is visible after publishing; while drafting,
the same tools live in Share and the local Download step.

### Printable poster (A4 / A5)

The Share tab (and the local **Download** step) offers an **A4 or A5 portrait poster** as a
self-contained SVG: download it or use **Print / Save as PDF** (100% scale, portrait, no headers).
The poster's QR is the owner's static Bangla QR, never the DeshiPay page URL, so a customer scans it
and enters the amount in their own app. It also shows the supported app artwork (Google Play icons):
bKash, Nagad, Rocket, upay, Citytouch, BRAC Bank Astha, EBL Skybanking, NexusPay and MTB Neo, plus
the Bangla QR mark. App icons are trademarks of their owners and are used only to identify
compatibility; the artwork is embedded, so the file has no external image requests.

The customer page shows the **supported app icons under the QR** (bKash, Nagad, Rocket, upay, Citytouch,
BRAC Bank Astha, EBL Skybanking, NexusPay, MTB Neo and the Bangla QR mark); the same artwork is included
in downloaded standalone pages. **Save A5 poster** downloads the current page as the A5 print poster PNG
at 300 dpi, with the amount-specific QR when an amount is set.

`/username?amount=1500` locks the amount (amounts are capped at **৳50,000**), and `?method=wallet` / `?method=bank` (or `?method=qr`) opens the page on that tab; switching tabs updates the URL so the address can be shared.

If the database is paused or unreachable, people can still build a page without an account and download
it as one HTML file, see [Offline mode](#offline-mode-paused-supabase-and-the-standalone-download).

---

## Offline mode (paused Supabase and the standalone download)

Supabase's free tier pauses idle projects, and a paused project answers requests with **HTTP 540**. The
site is built to keep working for the person making a page even then (and whenever the database cannot
be reached at all).

**On every page load** the site checks the backend once (`public/js/common.js` → `Deshi.checkBackend()`,
cached per page):

1. No `SUPABASE_URL` / `SUPABASE_ANON_KEY` configured → offline, no network request.
2. Otherwise `GET <project>/auth/v1/health` (4 s timeout). If that request fails at the network/CORS
   level, it retries `GET <project>/rest/v1/` with the anon key (4 s timeout).
3. `540` → **paused**, `402` → **restricted**, any other HTTP answer → **online** (a project that is up
   but not set up yet still counts as online), both probes unreachable → **offline**.

When it is **online**, everything works exactly as before (sign in, publish, share). The Share tab also
has **Download your page as HTML** so a published page can always be saved as a file.

When it is **offline**:

- The landing page shows a **“Create your page”** card instead of sign-in. There is no login or sign-up,
  no database-status line, and the landing copy no longer promises a hosted address (“Take it with
  you”, “Download it”).
- **Create my page** opens `/app` with the **same four-step wizard**, without an account: name and
  title, Bangla QR upload/paste, wallets/banks, colour and quick amounts. Step 1 asks only for the
  name/business name and an optional note, **no link/username is asked at all** (there is no hosted
  address to claim); the file name is derived from the name you enter. The host/username line at the
  top of the page is hidden in the offline preview and in the downloaded file.
- The wizard gets a fifth step, **Download**. The page is saved as `deshipay-<name>.html` (the name you entered, slugified), one
  self-contained HTML file (~140 KB) with the customer page, all styles, the QR engine and the page data
  inside it. Only the web fonts are loaded from the internet; everything else works offline and from
  `file://`.
- The draft is kept in `localStorage` under `deshipay.local.v1`, so a reload does not lose the work.

**Visitors on existing pages.** While the database is down, opening any published page
(`/<username>`) shows a friendly **“Temporarily unavailable”** screen, “Sorry, payment pages can’t be
loaded right now. DeshiQR is temporarily unavailable; please try again in a little while.”, with a
**Try again** button that re-checks and loads the page once the backend is back. It is not a broken
page and it never shows the customer a database error.

**Hosting the file.** It is a plain static file: drag it onto Netlify Drop, put it in a GitHub Pages
repository, or upload it anywhere you already host files. `/page.html?amount=500` locks the amount, just
like `/<username>?amount=500`. Old copies are frozen, edit in the wizard and download a fresh file.

**How the download works.** The browser fetches this site's own CSS/JS (the vendored `deshiqr` engine,
`payload.js`, PayView, the styles) at generation time and inlines them, so the deployed site must be up
to make a file; the file itself then needs nothing but a static host. The small “Made with DeshiQR”
footer links back to the site's origin at generation time.

---

## How the QR works (and the checksum)

A Bangla QR is an EMV merchant QR: a flat list of `tag + 2-digit length + value` items, ending with a checksum. To turn *any* of them into a "pay this amount" QR, the [deshiQR](https://github.com/hello2himel/deshiQR) engine (loaded in the browser through `public/vendor/deshiqr.global.js` and `public/js/payload.js`) does exactly three things and leaves every other value alone (account, name, city, the bank's own tokens in tags 26-51 and 80-99):

| Change | Why |
|---|---|
| tag `01` goes from `11` (static) to `12` (dynamic) | tells the app an amount is included |
| tag `54` = the amount, inserted right after tag `53` (currency) | the amount |
| tag `63` is recalculated | **CRC-16/CCITT-FALSE** (poly `0x1021`, init `0xFFFF`) over everything up to and including `6304` |

So the checksum is not something you can reuse: it must be recomputed for every amount, and it is. On upload the app also **verifies the checksum of your QR** (catching blurry or fake codes), requires BDT currency and a merchant name, strips any fixed amount the QR already had, and stores the amount-free version.

Because nothing else is edited, this works for **any provider that issues a standard Bangla QR**, not just bKash. The bKash-style 11-digit number lives inside the account tag and simply travels along. Non-ASCII names (Bangla) are handled by counting lengths in bytes, with a fallback for generators that count characters.

A few intentional differences from the site's original in-page engine come from using the repo's engine as the single implementation:

- **Point of initiation is normalised.** A QR that arrives without tag `01` gets it added (`11` static, `12` with an amount) as part of the same edit, instead of being written back without it.
- **Emptied templates are dropped.** If tag `62` only carried the reference, removing the reference leaves nothing behind, so the container is removed from the stored static payload. When a fresh reference is generated for a payment QR, the container is re-created in the same engine call (`62` → sub-tag `01` = the reference), so amount-bearing QRs match the old output byte for byte.
- **Damaged payloads are rejected more strictly.** Duplicate tags and malformed nested templates (`26`/`62`) now produce "Couldn’t read this QR: …" instead of being half-read.
- **Tiny amounts are refused.** `build()` rejects an amount that would format to `0.00` (below half a poisha) instead of emitting a zero payment QR; the amount input cannot produce one.
- **A reference with no container.** `build()` is never called with a reference for a stored payload without tag `62` (the site generates one only when the uploaded QR carried a reference), but if it is, the engine re-creates the `62` container for it; the old in-page engine silently dropped the reference.

**References.** If the uploaded QR contains a reference (tag 62, sub-tag 01), the app keeps its first 10 characters and randomises the rest for each QR, same length. QRs without one are left as they are.

**Please test with a small amount.** Some banks put tokens (tags 80/81) in the QR. They have worked unchanged for amount-bearing QRs from the original prototype, but each bank's app decides what it accepts, so scan once with a real app and pay ৳10 before sharing your link.

---

## Security notes

- **Row Level Security**: `profiles` is readable/writable only by its owner. The public page never reads the table; it calls `get_public_page()`, a `SECURITY DEFINER` function that returns only public fields and only for published pages (never the user id or email).
- **Database constraints** enforce username format, a reserved-name list (`app`, `login`, `bkash`, `admin`, ...), length limits, valid theme, and "at least one payment method".
- **No inline scripts**; the repo-root `netlify.toml` ships a Content-Security-Policy limited to your own files, Google Fonts and Supabase. All user text is rendered as text, never as HTML.
- **Impersonation**: anyone can register any free name, and a page shows whatever name is in the QR. The page tells customers to check the name in their app before confirming. If you run this publicly, consider adding a way to report pages, and add a migration that updates `is_reserved_username` in **both** `supabase/migrations/` and `site/public/js/common.js` (`RESERVED`).
- **Username lookups** are open (needed for the live availability check). Pages are `noindex`.
- Deleting a page from the dashboard removes the row; to delete the sign-in account itself use *Authentication → Users* in Supabase.

---

## Customising

- **Add a theme**: add a line to `THEMES` in [`site/scripts/gen-themes.js`](scripts/gen-themes.js), run `npm run themes`, then add the id and colour to `THEMES` in [`site/public/js/providers.js`](public/js/providers.js) and to `profiles_theme_valid` in a **new** migration under [`supabase/migrations/`](../supabase/migrations/) (drop and re-add that constraint there; never edit an applied migration). Every surface is generated from that one accent, page background, borders, secondary buttons/segments and soft tints (in light and dark mode), so the whole page follows the theme.
- **Add a wallet or bank**: edit `WALLETS` / `BANKS` in [`site/public/js/providers.js`](public/js/providers.js). Wallet entries are decorative colour tiles, not logos.
- **Fonts** come from Google Fonts. To self-host, download Bricolage Grotesque and Figtree, add `@font-face` rules to `base.css`, and drop the two `fonts.*` hosts from the CSP in the repo-root `netlify.toml`.
- Social-share previews (Open Graph) would need server-rendering, e.g. a Netlify Edge Function. Not included.

## Tests

```bash
cd site && npm test                                  # engine adapter (checksum, amount, references, Bangla names)
                                                     # + standalone export (inlining, escaping, file contents)
npm i --no-save puppeteer-core                       # optional browser test (install outside the repo)
NODE_PATH=/path/to/node_modules CHROME=/path/to/chrome \
  node site/tests/e2e/run.js                         # online journey + offline CTA/wizard/download, scans the
                                                     # QR it draws, and opens the downloaded standalone file
```

The engine's own tests live in the [deshiQR repo](https://github.com/hello2himel/deshiQR); this repo tests the site adapter (`site/tests/qr.test.js`) and the standalone export (`site/tests/export.test.js`).

## Troubleshooting

- *"Supabase isn't connected yet"* on the landing page: `config.js` still has the placeholders. Set the environment variables and redeploy.
- *"The database tables aren't set up yet"* in `/app`: apply the SQL in `supabase/migrations/`, enable the Supabase GitHub integration (Project Settings → Integrations → GitHub, Working directory `.`, Deploy to production) or paste the files into the SQL editor once.
- *Confirmation email link goes to the wrong place*: fix **Site URL** and **Redirect URLs** in Supabase.
- *`/username` shows a 404 from Netlify*: the rewrite rules in the repo-root `netlify.toml` weren't picked up. Check the file is at the repo root, that `base` is `site`, and that the **publish** directory is `public`.
- *"That link was just taken"* when saving: another user got the name first; pick another.
- *Landing shows "Create your page" although Supabase is configured*: the health probe could not get an answer, the project may be paused (HTTP 540) or restricted (402), the URL/anon key may be wrong, or the host is outside the CSP `connect-src` in the repo-root `netlify.toml`. That is the intended fallback; fix the project/config to get sign-in back.
- *The Download step fails*: generating the file fetches this site's own CSS/JS, so the site must be reachable; reload and retry. The downloaded file itself then works without the site.
- *Vendor engine is stale after a lib change*: copy the new `deshiqr.global.js` from the [deshiQR](https://github.com/hello2himel/deshiQR) build into `site/public/vendor/`, then commit it.

## Licences

This site's code: **AGPL-3.0-only**, in the [DeshiPay repo](../README.md) (root [LICENSE](../LICENSE)). Vendored libraries keep their own licences: qrcode-generator (MIT), jsQR (Apache-2.0), supabase-js (MIT), the `deshiqr` browser bundle (MIT, from the [deshiQR repo](https://github.com/hello2himel/deshiQR)), and **Remix Icon 4.9.1** (Apache-2.0; avatar path data in `public/js/avatars.js`, license in [`THIRD_PARTY_LICENSES/remixicon.txt`](../THIRD_PARTY_LICENSES/remixicon.txt)). The theme toggle also uses vendored Remix `sun-line.svg`/`moon-line.svg` as CSS masks.
