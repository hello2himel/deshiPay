/**
 * A4 poster generation.
 *
 * Pure string building: the same SVG can be previewed in the browser, downloaded as
 * SVG, or rasterised to PNG with a canvas. No external references, no scripts.
 */
import { formatTaka } from "deshiqr";

export const A4_WIDTH = 595;
export const A4_HEIGHT = 842;

export interface PosterInput {
  /** Complete `<svg>` from `deshiqr-qr`. */
  qrSvg: string;
  title: string;
  merchantName?: string | null;
  note?: string | null;
  city?: string | null;
  accountMasked?: string | null;
  amount?: number | null;
  reference?: string | null;
  payUrl?: string | null;
  verified?: boolean;
}

/** Escape text for XML content and attributes. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Word-wrap a single line to at most `maxChars` characters per line. */
export function wrapText(value: string, maxChars: number, maxLines = 3): string[] {
  const words = value.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!word) continue;
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

/**
 * Re-parent a self-contained QR SVG into the poster at the exact box we want.
 * Nested `<svg x y width height>` keeps the original viewBox and quiet zone.
 */
export function embedQrSvg(qrSvg: string, x: number, y: number, size: number): string {
  const opening = /<svg\b([^>]*)>/i.exec(qrSvg);
  if (!opening) return "";
  const attributes = opening[1].replace(/\s(width|height|x|y|viewBox)="[^"]*"/gi, "");
  const viewBox = /viewBox="([^"]+)"/i.exec(qrSvg)?.[1] ?? `0 0 ${size} ${size}`;
  const svg = qrSvg.replace(
    /<svg\b[^>]*>/i,
    `<svg xmlns="http://www.w3.org/2000/svg" x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${viewBox}"${attributes.replace(/\sxmlns="[^"]*"/i, "")}>`,
  );
  return svg;
}

function textLine(
  value: string,
  x: number,
  y: number,
  options: { size: number; weight?: number; fill?: string; anchor?: string; family?: string; letterSpacing?: string },
): string {
  const anchor = options.anchor ?? "start";
  const family = options.family ?? "'Figtree', 'Bricolage Grotesque', sans-serif";
  const weight = options.weight ?? 500;
  const fill = options.fill ?? "#17131f";
  const spacing = options.letterSpacing ? ` letter-spacing="${options.letterSpacing}"` : "";
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${options.size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${spacing}>${escapeXml(value)}</text>`;
}

/** Build the complete A4 poster SVG (595 × 842 points). */
export function buildPosterSvg(input: PosterInput): string {
  const accent = "#7c3aed";
  const accentTwo = "#db2777";
  const ink = "#17131f";
  const muted = "#6b6478";
  const border = "#e8e2f4";

  const merchant = (input.merchantName ?? input.title ?? "").trim() || "Bangla QR";
  const title = (input.title ?? merchant).trim();
  const note = input.note?.trim() ?? "";
  const amount = input.amount ?? null;

  const titleLines = wrapText(title, 26, 2);
  const noteLines = note ? wrapText(note, 56, 2) : [];

  const amountLabel = amount === null ? "Any amount" : formatTaka(amount);
  const amountCaption = amount === null ? "The payer types the amount" : "Amount to pay";

  const reference = input.reference?.trim() ?? "";
  const account = input.accountMasked?.trim() ?? "";
  const city = input.city?.trim() ?? "";
  const payUrl = input.payUrl?.trim() ?? "";

  const details: string[] = [];
  if (account) details.push(`Pay to ${merchant}${city ? ` · ${city}` : ""} · ${account}`);
  if (reference) details.push(`Bill no. / reference ${reference}`);

  const qrSize = 300;
  const cardX = A4_WIDTH / 2 - 176;
  const cardY = 320;
  const cardW = 352;
  const cardH = 380;
  const qrX = A4_WIDTH / 2 - qrSize / 2;
  const qrY = cardY + 30;

  const lines: string[] = [];

  // Background
  lines.push(`<rect width="${A4_WIDTH}" height="${A4_HEIGHT}" fill="#ffffff"/>`);

  // Brand row
  lines.push(textLine("deshiQR", 44, 68, { size: 20, weight: 800, fill: accent, family: "'Bricolage Grotesque', 'Figtree', sans-serif" }));
  lines.push(textLine("Bangla QR pay page", A4_WIDTH - 44, 68, { size: 11, weight: 500, fill: muted, anchor: "end", letterSpacing: "0.08em" }));
  lines.push(`<line x1="44" y1="88" x2="${A4_WIDTH - 44}" y2="88" stroke="${border}" stroke-width="1"/>`);

  // Merchant / title / note
  lines.push(textLine(merchant.toUpperCase(), 44, 132, { size: 12, weight: 700, fill: muted, letterSpacing: "0.14em" }));
  titleLines.forEach((line, index) => {
    lines.push(textLine(line, 44, 186 + index * 46, { size: 38, weight: 800, fill: ink, family: "'Bricolage Grotesque', 'Figtree', sans-serif" }));
  });
  noteLines.forEach((line, index) => {
    lines.push(textLine(line, 44, 186 + titleLines.length * 46 + index * 22, { size: 14, weight: 500, fill: muted }));
  });

  // Amount block
  lines.push(textLine(amountCaption.toUpperCase(), 44, 306, { size: 11, weight: 700, fill: muted, letterSpacing: "0.12em" }));
  lines.push(`<rect x="44" y="316" width="6" height="52" rx="3" fill="url(#dqBadge)"/>`);
  lines.push(textLine(amountLabel, 62, 358, { size: amount === null ? 34 : 44, weight: 800, fill: ink, family: "'Bricolage Grotesque', 'Figtree', sans-serif" }));
  if (reference) {
    lines.push(textLine(`Bill no. / reference ${reference}`, 44, 386, { size: 11, weight: 500, fill: muted }));
  }

  // QR card
  lines.push(`<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="28" fill="#ffffff" stroke="${border}" stroke-width="1.5"/>`);
  lines.push(embedQrSvg(input.qrSvg, qrX, qrY, qrSize));

  // Scan instructions
  lines.push(textLine("Scan with bKash or any Bangla QR app", A4_WIDTH / 2, 740, { size: 14, weight: 700, fill: ink, anchor: "middle" }));
  lines.push(
    textLine(
      "বিকাশ বা যেকোনো বাংলা QR অ্যাপ দিয়ে স্ক্যান করুন",
      A4_WIDTH / 2,
      762,
      { size: 13, weight: 500, fill: muted, anchor: "middle", family: "'Noto Sans Bengali', 'Figtree', sans-serif" },
    ),
  );

  // Dashed cut line
  lines.push(`<line x1="44" y1="786" x2="${A4_WIDTH - 44}" y2="786" stroke="${border}" stroke-width="1.5" stroke-dasharray="6 6"/>`);

  // Footer details
  let footerY = 808;
  for (const detail of details.slice(0, 2)) {
    lines.push(textLine(detail, 44, footerY, { size: 10, weight: 500, fill: muted }));
    footerY += 14;
  }
  if (payUrl) {
    const shown = payUrl.length > 96 ? `${payUrl.slice(0, 93)}…` : payUrl;
    lines.push(textLine(shown, 44, footerY, { size: 9, weight: 500, fill: muted }));
    footerY += 13;
  }
  lines.push(
    textLine(
      "Bangla QR · bKash verified today, more providers planned. Payments happen in your wallet app — deshiQR never holds funds.",
      A4_WIDTH / 2,
      830,
      { size: 8.5, weight: 500, fill: muted, anchor: "middle" },
    ),
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${A4_WIDTH}" height="${A4_HEIGHT}" viewBox="0 0 ${A4_WIDTH} ${A4_HEIGHT}" role="img" aria-label="${escapeXml(`Payment poster for ${title}`)}">
<defs>
  <linearGradient id="dqBadge" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${accent}"/>
    <stop offset="1" stop-color="${accentTwo}"/>
  </linearGradient>
</defs>
${lines.join("\n")}
</svg>`;
}
