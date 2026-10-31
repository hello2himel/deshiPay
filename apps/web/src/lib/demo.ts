/**
 * Synthetic demo data only (docs/demo-payloads.md).
 *
 * Fake account `01000000000`, name `DEMO STORE`, dummy NPSB tokens. Never replace
 * these with a real merchant QR, account number or token.
 */
import type { MerchantView, InvoiceView } from "./merchant.ts";

export const DEMO_STATIC_PAYLOAD =
  "00020101021126470014bd.org.bb.npsb010202020420020311010000000005204601653030505802BD5910DEMO STORE6005Dhaka62060602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=6304295D";

export const DEMO_DYNAMIC_PAYLOAD =
  "00020101021226470014bd.org.bb.npsb010202020420020311010000000005204601653030505406500.005802BD5910DEMO STORE6005Dhaka62350125DEMOQR0VZeK2MfbVRI6w36osd0602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=6304F835";

/** 25 characters — the shape real bKash dynamic QRs use. Synthetic. */
export const DEMO_REFERENCE = "DEMOQR0VZeK2MfbVRI6w36osd";

export const DEMO_TITLE = "DEMO STORE";
export const DEMO_NOTE = "Demo merchant — synthetic Bangla QR, not a real shop.";
export const DEMO_PRESETS = [100, 500, 1000];
export const DEMO_SLUG = "demo";
export const DEMO_CITY = "Dhaka";
export const DEMO_INSTITUTION = "bd.org.bb.npsb";
export const DEMO_ACCOUNT_MASKED = "01000•••000";

export const DEMO_MERCHANT: MerchantView = {
  slug: DEMO_SLUG,
  title: DEMO_TITLE,
  note: DEMO_NOTE,
  basePayload: DEMO_STATIC_PAYLOAD,
  name: DEMO_TITLE,
  city: DEMO_CITY,
  accountMasked: DEMO_ACCOUNT_MASKED,
  institution: DEMO_INSTITUTION,
  refPrefix: "FT80",
  refLen: 25,
  presets: DEMO_PRESETS,
  verified: true,
  status: "published",
  createdAt: null,
  updatedAt: null,
};

/** 64 lowercase hex — the same format the edge function issues. Synthetic token. */
export const DEMO_INVOICE_TOKEN = `${"0".repeat(60)}de70`;

export const DEMO_INVOICE: InvoiceView = {
  token: DEMO_INVOICE_TOKEN,
  amount: 500,
  reference: DEMO_REFERENCE,
  note: "Demo invoice — synthetic order.",
  status: "pending",
  txid: null,
  createdAt: null,
  expiresAt: null,
  claimedAt: null,
  paidAt: null,
  merchantSlug: DEMO_SLUG,
  merchantTitle: DEMO_TITLE,
  payload: DEMO_DYNAMIC_PAYLOAD,
  qrSvg: null,
  payUrl: null,
};
