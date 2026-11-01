# deshiQR

**One job: load a Bangla QR payload, edit any tag, and get the updated payload back.** A Bangla QR (the
NPSB/EMVCo-style format printed by bKash, bank apps and other Bangla QR apps) is a TLV payload with a
CRC. deshiQR parses it, applies your edits, keeps the point-of-initiation flag consistent, re-seals the
checksum (CRC-16/CCITT-FALSE), and returns the new payload. You render the QR yourself, however you
like.

deshiQR does not generate QR codes, read merchant semantics, or handle payments. It ships as
zero-dependency libraries for JavaScript/TypeScript and Python, plus one stateless HTTP endpoint. It
never holds funds, stores data, or confirms payments.

[![CI](https://github.com/hello2himel/deshiQR/actions/workflows/ci.yml/badge.svg)](https://github.com/hello2himel/deshiQR/actions/workflows/ci.yml)
[![npm: deshiqr](https://img.shields.io/npm/v/deshiqr?label=deshiqr)](https://www.npmjs.com/package/deshiqr)
[![PyPI: deshiqr](https://img.shields.io/pypi/v/deshiqr?label=deshiqr)](https://pypi.org/project/deshiqr/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

## The API: two functions

```ts
import { update, validate } from "deshiqr";

// Payload in, edited payload out. Throw on invalid input.
const updated: string = update(payload, { amount: 500, reference: "BILL123" });

// Never throws: collects every error and warning.
const report = validate(updated);
// { ok: true, errors: [], warnings: [] }
```

The same two functions exist in Python (`pip install deshiqr`) and over HTTP (`POST
/functions/v1/update`).

`update(payload, edits, options?)`:

- `edits` keys are named aliases or tag paths; values are `string | number | null`.
- `null` removes the tag (or sub-tag). `63` is rejected — the checksum is always recomputed.
- `update(payload)` / `update(payload, {})` is **validate-only**: the payload comes back exactly as it
  went in (surrounding whitespace trimmed; warnings still surface).
- When the edits target the amount, tag `01` is kept consistent: `54` present → `01` is `12`, `54`
  absent → `01` is `11` (unless you edit `01` explicitly). Other edits leave `01` untouched.
- Only the tags you edit (plus `01` for amount edits and the re-sealed `63`) change. Everything else —
  account template, merchant name/city, currency, country, opaque token templates — is carried over
  byte for byte.
- Invalid input throws a `DeshiQrError` with a `.code`; duplicate tags are rejected (`DUPLICATE_TAG`).
  Warnings never block an edit: the new payload is still returned. See
  [docs/api.md](./docs/api.md#errors).

| Alias           | Tag path | Meaning                         |
| --------------- | -------- | ------------------------------- |
| `amount`        | `54`     | amount, exactly 2 decimals      |
| `currency`      | `53`     | ISO 4217 numeric (e.g. `050`)   |
| `country`       | `58`     | ISO 3166-1 alpha-2 (e.g. `BD`)  |
| `mcc`           | `52`     | merchant category code          |
| `name`          | `59`     | merchant name                   |
| `city`          | `60`     | merchant city                   |
| `reference`     | `62/01`  | bill number / payment reference |
| `customerLabel` | `62/06`  | customer label                  |
| `account`       | `26/03`  | account identifier              |
| `institution`   | `26/00`  | institution AID                 |

Any other key matching `^[0-9]{2}(/[0-9]{2})*$` is treated as a tag path (for example `"80/01"`).
Every field, its syntax and known values are in [docs/format.md](./docs/format.md#field-table); the full
editing rules are in [docs/api.md](./docs/api.md#update).

## Warnings and suppression

After applying edits, `update` validates the result and surfaces warnings. By default they go to
`console.warn`; `validate` returns them in the report. Warnings never block the edit.

```ts
update(payload, edits); // default: surface all warnings
update(payload, edits, { warnings: false }); // silence all warnings
update(payload, edits, { warnings: ["59", "62/01"] }); // suppress these tags/paths
update(payload, edits, { onWarning: (issue) => logger.warn(issue.code, issue.tag) });

validate(payload, { warnings: false }); // report without warnings; errors always present
```

Python takes the same options as a dict or a dataclass:

```python
from deshiqr import UpdateOptions, update

update(payload, edits, {"warnings": ["59"]})
update(payload, edits, UpdateOptions(warnings=False))
```

The `warnings` option matches an issue's `tag`/`path` exactly (`"59"`, `"62"`, `"62/01"`, `"26/03"`).
Warning codes include `MISSING_TAG`, `UNKNOWN_TAG`, `BAD_FIELD_VALUE`, `FIELD_TOO_LONG`,
`UNKNOWN_CURRENCY`, `NON_BD_COUNTRY`, `UNKNOWN_INSTITUTION`, `UNKNOWN_MCC`, `STATIC_WITH_AMOUNT`,
`DYNAMIC_WITHOUT_AMOUNT`, and `RISKY_EDIT`. The full table is in
[docs/api.md](./docs/api.md#warnings).

> **Editing identity fields is risky.** Changing `26/03` (account), `26/00` (institution) or `59`
> (merchant name) can mislead payers. `update` warns with `RISKY_EDIT`, but it does not stop you: only
> edit payloads you own. Read [SECURITY.md](./SECURITY.md).

## HTTP endpoint

One stateless function: `POST /functions/v1/update`. No database, no secrets, no merchant records.

```http
POST /functions/v1/update
Content-Type: application/json

{
  "payload": "00020101021126…6304295D",
  "edits": { "amount": 500, "currency": "050", "62/01": "BILL123" },
  "warnings": true
}
```

`200 OK`:

```json
{
  "ok": true,
  "payload": "00020101021226…6304DB6A",
  "warnings": []
}
```

Errors are `{ "ok": false, "error": { "code": "BAD_AMOUNT", "message": "…", "tag": "54" } }` with HTTP
`400` for input errors, `413` for oversized bodies, and `500` for internal failures (unknown
routes/methods return `404`/`405`). `edits` is optional — omitted, `null` or `{}` means validate-only:
the same payload comes back with its warnings — and `warnings` accepts the same
`true | false | ["59"]` filter as the libraries. CORS is `*` by default (`DESHIQR_CORS_ORIGIN`).
Contract and deploy steps: [docs/api.md](./docs/api.md#http-endpoint) and
[docs/self-hosting.md](./docs/self-hosting.md).

## Install

| Where                      | Install                       | How you call it                                           |
| -------------------------- | ----------------------------- | --------------------------------------------------------- |
| Node, bundlers, TypeScript | `npm install deshiqr`         | `import { update, validate } from "deshiqr"`              |
| Browser, no build step     | one `<script src>`            | `window.DeshiQR.update(…)` / `window.DeshiQR.validate(…)` |
| Python 3.9+                | `pip install deshiqr`         | `from deshiqr import update, validate`                    |
| Deno / Bun                 | `import … from "npm:deshiqr"` | the npm package resolves                                  |

Everything is zero-dependency and does no I/O. The library is synchronous and runs in browsers, Node,
Deno, workers and edge functions.

> These packages are released from this repo on a `v*` tag (see
> [CONTRIBUTING.md](./CONTRIBUTING.md#releases)). If a version is not on the registry yet, build from
> source (`pnpm build` and `pip install ./python`) or use the Pages bundle URL below.

### Plain JS, no build step

```html
<script src="https://cdn.jsdelivr.net/npm/deshiqr@0.1.0/dist/deshiqr.global.js"></script>
<script>
  const updated = DeshiQR.update(payload, { amount: 500 });
  document.querySelector("#payload").textContent = updated;
</script>
```

**GitHub-hosted URL (no npm publish needed).** The same bundle is published to GitHub Pages on every
`v*` tag (or manually from the Actions tab), see [`.github/workflows/cdn.yml`](./.github/workflows/cdn.yml):

```
https://hello2himel.github.io/deshiQR/deshiqr.global.js
```

`raw.githubusercontent.com` **cannot** be used in `<script src>`: it serves `text/plain` with
`X-Content-Type-Options: nosniff`, so browsers refuse to execute it. Use jsDelivr, unpkg or the Pages
URL above — or `raw.githack.com` if you need a URL pointing into the GitHub tree.

## Examples

One runnable example per platform. All of them use the synthetic `DEMO STORE` fixture from
[docs/demo-payloads.md](./docs/demo-payloads.md) — never a real merchant payload.

| Example                                            | Platform                              |
| -------------------------------------------------- | ------------------------------------- |
| [`examples/browser.html`](./examples/browser.html) | browser, single bundle, no build step |
| [`examples/node.mjs`](./examples/node.mjs)         | Node (ESM)                            |
| [`examples/python.py`](./examples/python.py)       | Python 3.9+                           |
| [`examples/http.sh`](./examples/http.sh)           | `curl` against the stateless endpoint |
| [`cdn/index.html`](./cdn/index.html)               | the GitHub Pages bundle demo          |

See [`examples/README.md`](./examples/README.md) for how to run each one.

## Repository layout

| Path                                                         | What                                                                          |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| [`packages/deshiqr`](./packages/deshiqr)                     | npm `deshiqr` — `update` + `validate`, zero deps, ESM/CJS/types + IIFE bundle |
| [`python`](./python)                                         | PyPI `deshiqr` — Python 3.9+ port of the same two functions                   |
| [`supabase/functions/update`](./supabase/functions/update)   | the stateless HTTP endpoint (no database, no secrets)                         |
| [`supabase/functions/_vendor`](./supabase/functions/_vendor) | generated copy of the payload core the edge function imports                  |
| [`cdn`](./cdn)                                               | demo page for the GitHub Pages browser bundle                                 |
| [`examples`](./examples)                                     | one example per platform                                                      |
| [`docs`](./docs)                                             | format, API reference, self-hosting, demo payloads                            |
| [`scripts`](./scripts)                                       | repo tooling: browser-bundle check and edge-function vendoring                |

## Documentation

- [Payload format](./docs/format.md) — every field, the checksum rule, a worked edit.
- [API reference](./docs/api.md) — `update`/`validate`, edit rules, warning and error codes, HTTP
  contract.
- [Self-hosting](./docs/self-hosting.md) — deploy the `update` function yourself.
- [Demo payloads](./docs/demo-payloads.md) — the synthetic fixtures used in tests and docs.
- [Python package](./python/README.md) — `pip install deshiqr`, same two functions.
- [Security policy](./SECURITY.md) — what deshiQR does and does not protect.
- [Contributing](./CONTRIBUTING.md) — setup, conventions, releases.

## Status

`0.1.0` — early and deliberately small. The payload editor is provider-agnostic by construction: it
only changes the tags you edit plus `01` and the checksum, so it works with any Bangla QR payload that
is well-formed TLV. There is no QR encoding, no payload reading, no merchant lookup, and no payment
confirmation. The packages are published from this repo on a `v*` tag; until a version is on the
registry, use the GitHub Pages bundle or build from source.

## License

[MIT](./LICENSE) © Himel Das. Not affiliated with bKash, Nagad, Rocket or NPSB.
