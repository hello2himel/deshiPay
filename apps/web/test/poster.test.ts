import { test } from "node:test";
import assert from "node:assert/strict";

import {
  A4_HEIGHT,
  A4_WIDTH,
  buildPosterSvg,
  embedQrSvg,
  escapeXml,
  wrapText,
} from "../src/lib/poster.ts";

const QR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 390 390" width="390" height="390"><rect width="390" height="390" fill="#fff"/><path d="M30 30h20v20H30z" fill="#000"/></svg>';

const POSTER_INPUT = {
  qrSvg: QR_SVG,
  title: "DEMO STORE",
  merchantName: "DEMO STORE",
  note: "Pay before 6pm",
  city: "Dhaka",
  accountMasked: "01000•••000",
  amount: 500,
  reference: "DEMOQR0VZeK2MfbVRI6w36osd",
  payUrl: "https://deshiqr.example/#p=000201",
};

test("poster is a complete A4 SVG", () => {
  const svg = buildPosterSvg(POSTER_INPUT);
  assert.ok(svg.startsWith("<svg xmlns=\"http://www.w3.org/2000/svg\""));
  assert.ok(svg.includes(`width="${A4_WIDTH}"`));
  assert.ok(svg.includes(`height="${A4_HEIGHT}"`));
  assert.ok(svg.includes(`viewBox="0 0 ${A4_WIDTH} ${A4_HEIGHT}"`));
  assert.ok(svg.endsWith("</svg>"));
  assert.equal((svg.match(/<svg\b/g) ?? []).length, 2); // poster + embedded QR
});

test("poster includes the QR, amount, account and honest copy", () => {
  const svg = buildPosterSvg(POSTER_INPUT);
  assert.ok(svg.includes('fill="#000"'));
  assert.ok(svg.includes("৳500"));
  assert.ok(svg.includes("AMOUNT TO PAY"));
  assert.ok(svg.includes("01000•••000"));
  assert.ok(svg.includes("Dhaka"));
  assert.ok(svg.includes("DEMOQR0VZeK2MfbVRI6w36osd"));
  assert.ok(svg.includes("Scan with bKash or any Bangla QR app"));
  assert.ok(svg.includes("বিকাশ বা যেকোনো বাংলা QR অ্যাপ দিয়ে স্ক্যান করুন"));
  assert.ok(svg.includes("bKash verified"));
  assert.ok(svg.includes("more providers planned"));
  assert.ok(svg.includes("never holds funds"));
  assert.ok(svg.includes("stroke-dasharray"));
  assert.ok(svg.includes("https://deshiqr.example/#p=000201"));
});

test("poster shows any-amount copy and works without a reference", () => {
  const svg = buildPosterSvg({
    qrSvg: QR_SVG,
    title: "Tea Stall",
    amount: null,
  });
  assert.ok(svg.includes("Any amount"));
  assert.ok(svg.includes("THE PAYER TYPES THE AMOUNT"));
  assert.ok(!svg.includes("Bill no. / reference"));
});

test("poster escapes merchant-controlled text", () => {
  const svg = buildPosterSvg({
    qrSvg: QR_SVG,
    title: '<script>alert("x")</script>',
    merchantName: 'AT&T "Shop"',
    note: "<b>bold</b>",
  });
  assert.ok(!svg.includes("<script>"));
  assert.ok(svg.includes("&lt;script&gt;"));
  assert.ok(svg.includes("AT&amp;T &quot;SHOP&quot;"));
  assert.ok(svg.includes("&lt;b&gt;bold&lt;/b&gt;"));
});

test("embedQrSvg never duplicates attributes (the poster must be valid XML)", () => {
  const embedded = embedQrSvg(QR_SVG, 10, 20, 300);
  const opening = /<svg\b([^>]*)>/i.exec(embedded)?.[1] ?? "";
  const names = [...opening.matchAll(/([A-Za-z_:][-A-Za-z0-9_:.]*)=/g)].map((match) => match[1].toLowerCase());
  assert.equal(new Set(names).size, names.length, `duplicate attribute in <svg ${opening}>`);
  for (const name of ["viewBox".toLowerCase(), "width", "height", "x", "y"]) {
    assert.ok(names.includes(name), `missing ${name} attribute`);
  }
});

test("embedQrSvg positions a nested SVG at the requested box", () => {
  const embedded = embedQrSvg(QR_SVG, 147.5, 350, 300);
  assert.ok(embedded.includes('x="147.5"'));
  assert.ok(embedded.includes('y="350"'));
  assert.ok(embedded.includes('width="300"'));
  assert.ok(embedded.includes('height="300"'));
  assert.ok(embedded.includes('viewBox="0 0 390 390"'));
  // The original outer width/height are replaced, not duplicated.
  assert.equal((embedded.match(/<svg\b[^>]*width="390"/) ?? []).length, 0);
});

test("escapeXml and wrapText are reusable", () => {
  assert.equal(escapeXml('<a & "b">'), "&lt;a &amp; &quot;b&quot;&gt;");
  assert.deepEqual(wrapText("DEMO STORE", 26, 2), ["DEMO STORE"]);
  assert.deepEqual(wrapText("one two three four five", 10, 2), ["one two", "three four"]);
  assert.deepEqual(wrapText("   ", 10), []);
  assert.deepEqual(wrapText("supercalifragilistic", 5, 2), ["supercalifragilistic"]);
});
