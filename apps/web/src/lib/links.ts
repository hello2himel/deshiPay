/**
 * Self-contained pay links: `#p=<payload>&t=<title>&pr=<presets>`.
 *
 * These render a working pay page with no backend at all — the Bangla QR payload
 * is public data by nature (it is the QR printed on the shop wall). Optional keys
 * `n` (note), `a` (locked amount), `rf`/`rl` (reference prefix/length) extend the
 * basic link; unknown keys are ignored.
 */
import { formatPresets, normalizeAmount, parsePresets } from "./amounts.ts";

export interface InlinePayLink {
  payload: string;
  title: string;
  note: string;
  presets: number[];
  /** When set, the pay page locks this amount into the QR. */
  amount: number | null;
  refPrefix: string;
  refLen: number;
}

export const EMPTY_INLINE_LINK: InlinePayLink = {
  payload: "",
  title: "",
  note: "",
  presets: [],
  amount: null,
  refPrefix: "",
  refLen: 0,
};

function readLength(value: string | null): number {
  if (value === null || value.trim() === "") return 0;
  const length = Number.parseInt(value, 10);
  if (!Number.isFinite(length)) return 0;
  return Math.min(32, Math.max(0, length));
}

/** Build the hash fragment for a self-contained pay link. */
export function encodeInlineFragment(
  input: Partial<InlinePayLink> & { payload: string },
): string {
  const params = new URLSearchParams();
  params.set("p", input.payload.trim());
  const title = input.title?.trim();
  if (title) params.set("t", title);
  const note = input.note?.trim();
  if (note) params.set("n", note);
  const presets = input.presets ?? [];
  if (presets.length > 0) params.set("pr", formatPresets(presets));
  const amount = normalizeAmount(input.amount ?? null);
  if (amount !== null) params.set("a", String(amount));
  const refPrefix = input.refPrefix?.trim();
  if (refPrefix) params.set("rf", refPrefix);
  const refLen = input.refLen ?? 0;
  if (refLen > 0) params.set("rl", String(refLen));
  return `#${params.toString()}`;
}

/** Parse `#p=…&t=…&pr=…`; returns `null` for any other hash (or no payload). */
export function decodeInlineLink(hash: string | null | undefined): InlinePayLink | null {
  if (!hash) return null;
  const text = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!text) return null;
  const params = new URLSearchParams(text);
  const payload = params.get("p")?.trim() ?? "";
  if (!payload) return null;

  const presetsRaw = params.get("pr") ?? params.get("presets");
  return {
    payload,
    title: (params.get("t") ?? params.get("title") ?? "").trim(),
    note: (params.get("n") ?? params.get("note") ?? "").trim(),
    presets: parsePresets(presetsRaw),
    amount: normalizeAmount(params.get("a")),
    refPrefix: (params.get("rf") ?? "").trim(),
    refLen: readLength(params.get("rl")),
  };
}

/** Absolute share URL for a self-contained link. */
export function inlineLinkUrl(
  input: Partial<InlinePayLink> & { payload: string },
  originAndBase: string,
): string {
  const root = originAndBase.endsWith("/") ? originAndBase.slice(0, -1) : originAndBase;
  return `${root}/${encodeInlineFragment(input)}`;
}

/** Does this hash look like one of our self-contained links? */
export function isInlinePayHash(hash: string | null | undefined): boolean {
  return decodeInlineLink(hash) !== null;
}
