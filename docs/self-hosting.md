# Self-hosting deshiQR

This guide deploys the whole stack yourself: Supabase (database, RLS, edge function) and a
static host for the web app. Everything here has been kept boring on purpose — no Docker
required for the hosted path, no third-party runtime services.

**What you need:** a [Supabase](https://supabase.com) project (free tier works for a demo), a
static host (Netlify is the documented default; GitHub Pages/Cloudflare Pages work too), Node
`>= 22.18` and pnpm for building the repo.

> **No real data.** This repo is built around synthetic payloads from
> [`demo-payloads.md`](./demo-payloads.md). The seed data is fake (`01000000000`, `DEMO STORE`,
> dummy NPSB tokens). Do not replace seeds, fixtures or examples with a real merchant QR. The
> payload is public data _once printed_, but keeping real samples out of the repo is a hard
> rule.

---

## 1. Build the repo

```bash
pnpm install
pnpm build                 # libs + web
node scripts/check-sql.mjs # optional but recommended: proves the SQL/RLS layer is sane
```

`scripts/check-sql.mjs` boots a throwaway PostgreSQL (PGlite), applies `supabase/schema.sql`
and `supabase/seed.sql`, and runs ~60 assertions (CRC vectors, RLS, views, claims, rate
limiting). It does not touch any real database.

---

## 2. Create the Supabase project

1. Create a project in the Supabase dashboard. Pick a region close to your users (for
   Bangladesh: Singapore or Mumbai).
2. Note these values (Project Settings → API):
   - **Project URL** → `VITE_SUPABASE_URL` for the web app and `SUPABASE_URL` for tools
   - **anon public key** → `VITE_SUPABASE_ANON_KEY` (safe in a browser; RLS is the gate)
   - **service_role key** → server-side only, never in a browser or a committed file
3. (Dashboard → Authentication → URL configuration) set **Site URL** to your app URL and add
   `<app-url>/login` to the redirect allow-list so magic-link login works.

> Never commit keys. `.env` is gitignored; use `.env.example` as the template.

---

## 3. Apply the schema

`supabase/schema.sql` is a single, **idempotent** migration: extensions, the `deshiqr` helper
schema, `merchants`, `invoices`, `public_merchants`, `public_invoices`, RLS policies,
`claim_invoice()`, `get_public_invoice()`, `take_rate_limit()` and indexes. Re-running it is
safe.

### Option A — SQL editor (easiest)

Paste the whole file into the dashboard SQL editor and run it. Then optionally seed:

```text
# paste supabase/seed.sql and run it (demo data only — skip in production)
```

### Option B — CLI / psql

```bash
# with the Supabase CLI
supabase link --project-ref <project-ref>
# psql against the project's connection string
psql "$DATABASE_URL" -f supabase/schema.sql
psql "$DATABASE_URL" -f supabase/seed.sql   # optional, demo data only
```

To make it part of a migration workflow instead, copy it to
`supabase/migrations/<timestamp>_init.sql` and run `supabase db push`.

What the schema creates:

| Object                                       | Purpose                                                                                                                                      |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `deshiqr.crc16(text)`                        | CRC-16/CCITT-FALSE, used to enforce valid payloads in the DB                                                                                 |
| `public.merchants`                           | one row per hosted pay page; `user_id` = owner                                                                                               |
| `public.invoices`                            | token-addressed payment requests (created by the edge function)                                                                              |
| `public.public_merchants`                    | anon-readable **published** merchants, public columns only                                                                                   |
| `public.public_invoices`                     | service-role-only invoice columns, no txid/owner data (capability tokens must not be listable; public reads use `get_public_invoice(token)`) |
| `public.claim_invoice(token, txid)`          | one-way `pending → claimed`, anon-callable                                                                                                   |
| `public.get_public_invoice(token)`           | token-addressed single-invoice read                                                                                                          |
| `public.take_rate_limit(key, limit, window)` | PostgREST wrapper for the limiter                                                                                                            |
| `deshiqr.take_rate_limit(...)`               | fixed-window counter (service role only)                                                                                                     |

### Seed (demo only)

`supabase/seed.sql` is idempotent and creates:

- a fake auth user `demo@deshiqr.invalid` (cannot log in — it only gives the demo merchant a
  valid `user_id`),
- the published merchant `demo` with the synthetic static payload,
- two pending invoices with obvious dummy tokens.

`demo` is a **reserved slug**, so ordinary users cannot grab it — the seed is allowed to create
it because it runs as the database owner. On a real deployment, delete the demo merchant
(or skip the seed) before inviting merchants.

---

## 4. Deploy the edge function

The function source is `supabase/functions/invoice/`. It imports the dependency-free libraries
from `supabase/functions/_vendor/` (generated with `pnpm vendor:edge`; the files are committed,
so a clean clone deploys without building the packages first).

```bash
supabase login
supabase link --project-ref <project-ref>

# Optionally regenerate the vendored library sources first:
node scripts/vendor-edge.mjs

# Public payer endpoints: disable JWT verification so anonymous customers can call them.
supabase functions deploy invoice --no-verify-jwt
```

Notes:

- `--no-verify-jwt` makes `POST /invoice`, `GET /invoice` and `POST /invoice/claim` callable
  without any key — payers are anonymous by nature. Abuse is handled by rate limiting, not
  auth. If you prefer to require the project's **anon key** on every request (the web app's
  Supabase client sends it automatically; plain `curl` must then send
  `apikey`/`Authorization`), deploy with JWT verification enabled instead — omit
  `--no-verify-jwt` (equivalently `verify_jwt = true` in `config.toml`).
- The function uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, which Supabase injects
  automatically. Do not set them yourself.

Set the public app origin so `pay_url` points at your site:

```bash
supabase secrets set \
  DESHIQR_APP_ORIGIN=https://pay.example.com \
  DESHIQR_CORS_ORIGIN=https://pay.example.com
```

Optional tuning (defaults in brackets):

```bash
supabase secrets set \
  DESHIQR_CREATE_RATE_LIMIT=10 \
  DESHIQR_CLAIM_RATE_LIMIT=20 \
  DESHIQR_READ_RATE_LIMIT=120
```

Changing secrets requires redeploying the function to take effect:

```bash
supabase functions deploy invoice --no-verify-jwt
```

Smoke test after deployment (synthetic demo merchant must exist — run the seed first):

```bash
curl -sS -X POST "https://<project-ref>.supabase.co/functions/v1/invoice" \
  -H 'content-type: application/json' \
  -d '{"merchant":"demo","amount":500}'
```

You should get `201` with `ok: true`, a `payload`, a `qr_svg` and a `pay_url` on your
`DESHIQR_APP_ORIGIN`. The full API is in [`api.md`](./api.md).

---

## 5. Deploy the web app (Netlify)

The repo already contains `netlify.toml`, `apps/web/public/_redirects` and `_headers`.

1. New site from Git, repo root as the base directory.
2. Build command: `pnpm build:web`
3. Publish directory: `apps/web/dist`
4. Environment variables (build-time, Vite):
   - `VITE_SUPABASE_URL` = your project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
   - `NODE_VERSION` = `22` (or newer; the repo requires `>= 22.18`)
5. Deploy. Without the two `VITE_*` variables the app runs in **local demo mode** (no accounts,
   no publishing) and says so — that is intentional, not a bug.

GitHub Pages alternative: `DESHIQR_BASE=/<repo>/ pnpm build:web`, copy
`apps/web/dist/index.html` → `404.html`, add `.nojekyll` (routes are hash/fallback friendly).

---

## 6. Custom domains

- **Web app**: add the domain in Netlify (Domain management → Add domain) and point DNS at
  Netlify. HTTPS certificates are provisioned automatically.
- **Edge function**: stays on `https://<project-ref>.supabase.co/functions/v1/invoice`.
  You can put it behind your own domain with a proxy/CDN rule (e.g. Netlify redirect
  `/api/*` → function URL) if you want everything on one origin. Keep the service role key
  server-side — a proxy must not expose it.
- After attaching the domain, update `DESHIQR_APP_ORIGIN` (and `DESHIQR_CORS_ORIGIN`) and
  redeploy the function, or `pay_url`s will point at the old origin.
- **Wildcard subdomains per merchant** (e.g. `shop.deshiqr.example`) are on the
  [roadmap](./roadmap.md), not implemented today; merchants are addressed by slug
  (`/p/<slug>`) and invoices by token (`/#/i/<token>`).

---

## 7. How the security model works (plain language)

- The database tables (`merchants`, `invoices`) are **locked down**. The anonymous `anon` role
  has no direct access at all.
- Published pay pages are readable through the **`public_merchants` view**, which selects only
  public columns (never `user_id`) and only published merchants.
- Invoices are addressed by unguessable token. The only anonymous invoice read path is the
  token-addressed `get_public_invoice(token)` RPC (or the `invoice` edge function). The
  `public_invoices` view exists for service-role tooling only and is **not** granted to `anon`
  or `authenticated`, because invoice tokens are capability URLs — a listable view would hand
  anonymous callers every invoice link plus amounts, notes and timestamps.
- Logged-in owners can read/update/delete **their own merchants only**, and read + mark-paid
  (status change only) the invoices belonging to their own merchants. This is enforced by
  Postgres **Row Level Security** policies comparing `user_id` to the JWT `sub` (`auth.uid()`),
  not by app code.
- Column grants keep server-managed fields out of owners' reach: an owner cannot set
  `verified = true`, cannot move a merchant to another user, and cannot edit invoice amounts or
  references.
- Invoice creation and all service-role reads happen **inside the edge function**; the service
  role key never leaves the server.
- Claiming a payment is a **security-definer RPC** with a pinned `search_path` that only moves
  `pending → claimed` once, before expiry. It cannot mark anything `paid` — that is a manual
  merchant action today.
- The invoice API is rate limited per client IP; the limiter fails closed if it breaks.
- The **payload itself is public by design** (it is the QR printed on the shop wall), so the
  public read surfaces exposing it are not a leak. What is not public: owners' identities,
  customer txids, and drafts/suspended shops.

For the threat model, what this does _not_ protect, and the manual confirmation gap, read
[`security.md`](./security.md).

---

## 8. Maintenance and hardening

- **Rotate keys** if the service role key or anon key leaks (Project Settings → API). The anon
  key is public by definition; RLS protects it. The service role key is not.
- **Rate-limit table growth**: `deshiqr.rate_limits` keeps one row per active window/key. Purge
  old rows with pg_cron if you run for months:

  ```sql
  select cron.schedule(
    'deshiqr-rate-limit-cleanup',
    '17 * * * *',
    $$delete from deshiqr.rate_limits where expires_at < now() - interval '1 day'$$
  );
  ```

- **Expired invoices** stay `pending` until read/claimed or swept. A periodic sweep
  (`update public.invoices set status = 'expired' where status = 'pending' and expires_at < now();`)
  keeps dashboards tidy; the API already _reports_ them as expired.
- **Disable public sign-ups** (Authentication → Providers → Email) if only invited merchants
  should have accounts.
- **Backups**: Supabase's automated backups cover the database; `supabase db dump` for
  off-platform copies.
- **Monitoring**: function logs are in Dashboard → Edge Functions → Logs; database logs under
  Reports/Logs. Watch for `RATE_LIMITED` spikes and `INTERNAL` errors.

## Troubleshooting

| Symptom                                  | Likely cause                                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Function returns `401` with no JSON body | JWT verification is enabled; send the anon key or deploy with `--no-verify-jwt`                      |
| `500 INTERNAL` with "not configured"     | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` missing — redeploy so Supabase injects them             |
| `merchant` returns 404                   | merchant is not published, or the seed was not run                                                   |
| CORS errors in the browser               | set `DESHIQR_CORS_ORIGIN` to your app origin and redeploy                                            |
| `pay_url` points at localhost            | `DESHIQR_APP_ORIGIN` not set (its dev default is `http://localhost:5173`)                            |
| `429 RATE_LIMITED` constantly            | a proxy is not forwarding `x-forwarded-for`, so all traffic shares one key; check your proxy headers |
| Web app has no accounts/publish buttons  | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` missing at build time                                 |
