# deshiQR architecture & internal contract

This document is the internal contract for the repo. Code, tests and docs are built against it.

## Purpose and scope

deshiQR has one job:

> **Given a merchant's static Bangla QR payload and an amount, return the dynamic payload and a QR.**

A Bangla QR is an EMVCo-style TLV payload (NPSB template) printed by bKash, bank apps and other Bangla
QR apps. Deriving an amount-specific payload means editing two fields and re-sealing the CRC; that is
all deshiQR does. In scope: payload parsing/validation/derivation, QR encoding/rendering, a web
component, a Python port, and one stateless HTTP endpoint. Out of scope: accounts, databases, merchant
records, payment confirmation, and any form of custody of funds.

## Repository layout

```
packages/deshiqr    → npm: deshiqr               (payload + QR + element, one package)
  src/core/         → payload library             (main entry)
  src/qr/           → QR encoder + renderers      (main entry)
  src/element/      → <deshiqr-pay>               (deshiqr/element subpath)
  src/global.ts     → IIFE browser bundle         (window.DeshiQR)
  test/{core,qr,element}/
python/             → PyPI: deshiqr               (stdlib-only payload port)
supabase/functions/qr/        → stateless amount→QR HTTP endpoint
supabase/functions/_vendor/   → generated copies of src/core + src/qr for the edge function
cdn/                → demo page + source of the GitHub Pages bundle
examples/           → checkout, vanilla, React and Node integrations
docs/               → public documentation
scripts/            → repo tooling (browser-bundle checks, edge vendoring)
```

Workspace: pnpm. Node >= 22.18. TypeScript >= 5.9, strict. Python >= 3.9 for `python/`.

## The `deshiqr` package

One package per platform. `packages/deshiqr` publishes `deshiqr`, with zero runtime dependencies and no
DOM side effects in the main entry. `python/` publishes a payload-only port under the same name.

### Entry points

| Entry             | Built files                                          | Contents                                                                                                                                                                   |
| ----------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deshiqr` (main)  | `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts` | payload library + QR encoder/renderers. Pure: no DOM, no element registration, no network.                                                                                 |
| `deshiqr/element` | `dist/element.js`, `dist/element.d.ts`               | `<deshiqr-pay>` web component; importing it registers the element (guarded no-op outside a browser). ESM only.                                                             |
| IIFE bundle       | `dist/deshiqr.global.js`                             | one global, `window.DeshiQR`: payload + QR + element, and it auto-registers `<deshiqr-pay>`. Used by plain `<script src>` pages and pinned by `scripts/check-globals.mjs`. |

`package.json` sets `unpkg`/`jsdelivr` to `./dist/deshiqr.global.js`; `sideEffects` lists the element
and global builds only, so bundlers can tree-shake the pure entry.

### Payload API (main entry)

```ts
export const VERSION: string;
export const MAX_AMOUNT: number; // 99_999_999.99
export const MAX_FIELD_LENGTH: number;
export const TAGS: Record<
  | "FORMAT"
  | "INITIATION"
  | "ACCOUNT"
  | "MCC"
  | "CURRENCY"
  | "AMOUNT"
  | "COUNTRY"
  | "NAME"
  | "CITY"
  | "ADDITIONAL"
  | "CRC"
  | "TOKEN_80"
  | "TOKEN_81",
  string
>;

export type DeshiQrCode =
  | "EMPTY_PAYLOAD"
  | "BAD_TLV"
  | "CHECKSUM_MISMATCH"
  | "MISSING_FIELD"
  | "NOT_A_BANGLA_QR"
  | "BAD_AMOUNT"
  | "BAD_REFERENCE"
  | "UNSUPPORTED";

export class DeshiQrError extends Error {
  readonly code: DeshiQrCode;
  readonly detail?: string;
}

export interface Field {
  tag: string;
  value: string;
}

export const DEFAULT_REFERENCE_LENGTH: number; // 25
export function crc16(input: string): string; // "29B1"
export function normalize(payload: string): string; // trim
export function parse(payload: string): Field[]; // throws DeshiQrError
export function encodeField(field: Field): string;
export function encodeFields(fields: Field[]): string;
export function findField(fields: Field[], tag: string): Field | undefined;
export function findValue(fields: Field[], tag: string): string | null;
export function parseSubfields(value: string): Field[];
export function insertFieldSorted(fields: Field[], field: Field): void;

export interface MerchantDetails {
  name: string; // tag 59
  city: string | null; // tag 60
  account: string; // template 26 / sub-tag 03
  institution: string; // template 26 / sub-tag 00, e.g. "bd.org.bb.npsb"
  mcc: string | null; // tag 52
}

export interface DecodedQr {
  payload: string;
  kind: "static" | "dynamic"; // from tag 01 (11 / 12)
  amount: number | null; // tag 54, in BDT
  amountText: string | null; // tag 54, raw e.g. "500.00"
  currency: string | null; // tag 53 mapped, e.g. "BDT"
  country: string | null; // tag 58, e.g. "BD"
  merchant: MerchantDetails;
  reference: string | null; // template 62 / sub-tag 01
  customerLabel: string | null; // template 62 / sub-tag 06
  additionalData: Field[]; // template 62 subtree
  accountTemplate: Field[]; // template 26 subtree
  tokens: { tag80: string | null; tag81: string | null }; // opaque NPSB tokens, preserved verbatim
  fields: Field[]; // top-level fields
  checksum: string;
}

export function decode(payload: string): DecodedQr; // throws on any error
export function decodeSafe(payload: string): { ok: true; qr: DecodedQr } | { ok: false; error: DeshiQrError };
export function verifyChecksum(payload: string): boolean;
export function isBanglaQr(payload: string): boolean;

export interface DeshiQrIssue {
  code: DeshiQrCode;
  message: string;
  tag?: string;
}
export interface ValidationReport {
  ok: boolean; // no errors (warnings allowed)
  errors: DeshiQrIssue[];
  warnings: DeshiQrIssue[];
  qr: DecodedQr | null; // best-effort decode when possible
}
export function validate(payload: string): ValidationReport;

export interface AmountOptions {
  reference?: string | null; // explicit reference to embed
  referencePrefix?: string; // used when generating a reference
  referenceLength?: number; // 0 = no reference (default: keep existing length)
  keepExistingReference?: boolean; // default false
}
export interface BuildOptions extends AmountOptions {
  amount?: number | null; // null/undefined = static payload
}

export function toStatic(payload: string): string; // drop amount + reference, tag 01 → 11
export function withAmount(payload: string, amount: number, options?: AmountOptions): string;
export function build(base: string, options?: BuildOptions): string;
export function seal(fields: readonly Field[]): string; // re-encode + append tag 63
export function referenceFrom(payload: string): string | null;
export function assertReference(reference: string): void;
export function newReference(options?: { prefix?: string; length?: number }): string; // default 25
export function amountToField(amount: number): string; // 500 → "500.00"
export function parseAmountField(text: string): number; // "500.00" → 500
export function formatTaka(amount: number, options?: { symbol?: boolean; decimals?: number }): string;
export function maskAccount(account: string): string; // "01000•••000"
export const KNOWN_INSTITUTIONS: Record<string, { id: string; label: string; verified: boolean }>;
export function institutionOf(qr: DecodedQr): { id: string; label: string; verified: boolean } | null;
```

Validation must be strict about the checksum and required fields, lenient about optional ones (collect
them as warnings, never throw in `validate`).

### QR API (main entry)

QR Code encoder (ISO/IEC 18004), byte mode, versions 1–40, EC levels L/M/Q/H, automatic version and
mask selection. Zero runtime dependencies.

```ts
export type EcLevel = "L" | "M" | "Q" | "H";
export type RawText = string;

export interface QrMatrix {
  size: number; // modules per side
  version: number; // 1..40
  level: EcLevel;
  mask: number; // 0..7
  data: Uint8Array; // size*size, 1 = dark, row-major
  get(x: number, y: number): boolean;
}

export interface EncodeOptions {
  level?: EcLevel; // default "M"
  version?: number; // force version; default auto
  minVersion?: number;
  mask?: number; // force mask 0..7; default auto (penalty)
  eager?: boolean; // skip minimal-version search (internal use)
}

export function encode(text: string, options?: EncodeOptions): QrMatrix;
export function getVersionCapacity(version: number, level: EcLevel): number; // byte capacity

export interface SvgOptions {
  margin?: number; // default 4
  scale?: number; // default 1 (1 module = 1 unit)
  dark?: string; // default "#000"
  light?: string | null; // null = transparent; default "#fff"
  title?: string; // accessible <title>
  radius?: number; // quiet-zone corner radius, default 0
  className?: string;
  ariaLabel?: string;
}
export function toSvg(matrix: QrMatrix, options?: SvgOptions): string;
export function toSvgPath(matrix: QrMatrix, options?: SvgOptions): string; // <path d="..."/>
export interface TerminalOptions {
  margin?: number;
  dark?: string;
  light?: string;
}
export function toTerminal(matrix: QrMatrix, options?: TerminalOptions): string;
```

`toSvg` output must be a complete, self-contained `<svg>` string with `viewBox`, no external references,
no scripts, and deterministic output (no timestamps/ids).

### Element API (`deshiqr/element`)

Custom element with shadow DOM, zero runtime dependencies (it bundles this package's payload + QR code).
Importing the subpath registers the element; `deshiqr.global.js` does the same automatically.

```html
<deshiqr-pay
  payload="00020101021126…"        <!-- static base payload (required unless config-url) -->
  config-url="https://…/config.json" <!-- optional JSON config: {base_payload,title,note,presets,ref_prefix,ref_len} -->
  amount="500"                     <!-- optional; when omitted the user types an amount -->
  lock-amount                      <!-- optional boolean -->
  reference="DEMOQR0VZeK2MfbVRI6w36osd" <!-- optional explicit reference -->
  ref-prefix="FT80"                <!-- optional generated reference prefix -->
  ref-length="25"                  <!-- optional generated reference length; 0/absent = none -->
  title="Demo Store"
  note="Pay before 6pm"
  presets="100,500,1000"
  theme="auto|light|dark"
  size="280"                       <!-- QR px size -->
  bare                             <!-- optional: no card chrome -->
></deshiqr-pay>
```

Exports: `DeshiQrPay` (the class), `defineDeshiQrPay(registry?)` (idempotent; no-op without
`customElements`), and the event-detail types `DeshiQrReadyDetail`, `DeshiQrChangeDetail`,
`DeshiQrErrorDetail`.

Methods: `refresh(): void`, `setAmount(amount: number | null): void`, `getPayload(): string`,
`getSvg(): string`, `downloadPng(filename?: string): Promise<void>`.

Events (bubble, composed, dispatched on the element):

- `deshiqr-ready` — `{ payload, amount, reference }`
- `deshiqr-change` — `{ amount, payload, reference }`
- `deshiqr-error` — `{ code, message }`

Accessibility: the amount input has a label, the QR has an accessible name, focus styles are visible,
reduced motion is respected. The component must work with no network access when `payload` is provided.

### Derivation rules

1. Start from the parsed fields, drop tag `63` and any existing tag `54`.
2. `toStatic`: set tag `01` to `11`, drop sub-tag `01` from template `62`, re-seal.
3. `withAmount`: set tag `01` to `12`, insert `54` = `amount.toFixed(2)` immediately before the first
   top-level tag numerically greater than `54`, add/replace template `62` sub-tag `01` when a reference
   is requested, re-seal.
4. Everything else (template `26`, MCC `52`, currency `53`, country `58`, name `59`, city `60`, NPSB
   tokens `80`/`81`, other `62` sub-tags) is preserved **verbatim**.
5. Re-seal by appending `"6304"` and the uppercase CRC-16/CCITT-FALSE of the payload so far.

Rule 4 is the provider-agnostic invariant: derivation never needs provider-specific logic. Any change
that breaks it belongs in decode/validate instead, and
`packages/deshiqr/test/core/provider-agnostic.test.ts` must keep passing.

## The `qr` edge function

`supabase/functions/qr/` is the only HTTP API. It is **stateless**: no database, no secrets, no merchant
lookup. It validates generic TLV + CRC, applies `withAmount`, re-seals, and renders an SVG. It never
decodes merchant semantics.

```
POST /functions/v1/qr
  body: { payload: string, amount: number | string, reference?: string }
  200:  { ok: true, payload: string, amount: number, amountText: string,
          reference: string | null, qr_svg: string }
Errors: { ok: false, error: { code, message } }
```

Request-independent logic lives in `qr-core.ts` (no Deno globals) and is tested with `node --test` via
`qr-core.test.mts` (`pnpm check:qr-api`). The function imports the library from
`supabase/functions/_vendor/`, which is generated by `pnpm vendor:edge` and committed. Contract and
error codes: [`amount-qr.md`](./amount-qr.md).

## Provider stance

Every QR deshiQR builds is a standard **Bangla QR** payload, so it can be paid from any app that accepts
Bangla QR. Two different statements, kept apart:

- **Amount→QR (derive): provider-agnostic.** Only tag `01`, `54`, the checksum and an optional `62/01`
  change. Proven by tests on a synthetic non-bKash layout in the library, the edge function and the
  Python port.
- **Decode / verify (read a payload): verified for one provider today.** The parser is generic, but
  merchant semantics are pinned against bKash payloads only. Other providers are reported as
  unverified — do not assert tested support we have not seen.

| Provider                | Scan & pay a deshiQR QR           | Amount→QR (derive) | Decode / verify                                         |
| ----------------------- | --------------------------------- | ------------------ | ------------------------------------------------------- |
| bKash                   | Yes                               | Yes                | **Verified today** — tested against real bKash payloads |
| Nagad                   | Yes, if the app accepts Bangla QR | Yes — amount only  | Planned — needs real sample payloads                    |
| Rocket                  | Yes, if the app accepts Bangla QR | Yes — amount only  | Planned — needs real sample payloads                    |
| Bank / NPSB apps        | Yes, if the app accepts Bangla QR | Yes — amount only  | Planned — shared `bd.org.bb.npsb` template              |
| Other Bangla QR wallets | Depends on the app                | Yes — amount only  | Planned — generic parser, unverified                    |

Do not overstate this in any README, doc, UI copy or package metadata.

## Data policy

**No real merchant or payment data is ever committed to this repo.** All fixtures, examples and docs
use the synthetic payloads in [`demo-payloads.md`](./demo-payloads.md): fake account `01000000000`
(unassignable operator prefix), name `DEMO STORE`, city `Dhaka`, and dummy NPSB tokens. Tests must
never be generated from a real merchant QR.

## Conventions and commands

- TypeScript strict, `verbatimModuleSyntax`, `moduleResolution: bundler`; relative imports use explicit
  `.ts` extensions (Node runs and tests TS directly; bundlers rewrite on build).
- Source of truth is TS source; the package publishes ESM + CJS + `.d.ts` via `tsup`.
- Tests: `node --test` with `node:test` + `node:assert/strict`. No test framework dependency.
- Zero runtime dependencies in `deshiqr` (both languages). The element bundles its own code.
- Never commit: real payloads, real account numbers, real NPSB tokens, `.env`, secrets.
- Commands: `pnpm install`, `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm check:globals`,
  `pnpm check:qr-api`, `pnpm vendor:edge`, `pnpm format`, and
  `cd python && python3 -m unittest discover -s tests -v`.
