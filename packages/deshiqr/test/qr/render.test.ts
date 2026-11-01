/**
 * SVG and terminal renderer tests: structure, dimensions, colours,
 * accessibility, determinism, XML well-formedness and terminal layout.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { encode, toSvg, toSvgPath, toTerminal } from "../../src/qr/index.ts";
import { assertWellFormedXml } from "./helpers.ts";

const matrix = encode("render test payload", { level: "M" });
const dimension = matrix.size + 8; // default margin 4 on both sides

test("toSvg emits a complete, self-contained SVG", () => {
  const svg = toSvg(matrix);
  assert.ok(svg.startsWith("<svg "), "starts with an <svg> element");
  assert.ok(svg.endsWith("</svg>"), "ends with </svg>");
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.includes(`viewBox="0 0 ${dimension} ${dimension}"`));
  assert.ok(svg.includes(`width="${dimension}"`));
  assert.ok(svg.includes(`height="${dimension}"`));
  assert.ok(svg.includes("<path "), "has a dark-module path");
  assert.equal(svg.includes("<script"), false, "must not contain scripts");
  assert.equal(svg.includes("<foreignObject"), false);
  assert.equal(svg.includes("href="), false, "must not reference external resources");
  assertWellFormedXml(svg);
});

test("toSvg respects margin, scale, colours, radius, class and title", () => {
  const svg = toSvg(matrix, {
    margin: 2,
    scale: 3,
    dark: "#123456",
    light: "#eeeeee",
    title: "Demo store payment QR",
  });
  const scaledDimension = matrix.size + 4;
  assert.ok(svg.includes(`viewBox="0 0 ${scaledDimension} ${scaledDimension}"`));
  assert.ok(svg.includes(`width="${scaledDimension * 3}"`));
  assert.ok(svg.includes('fill="#eeeeee"'), "background colour");
  assert.ok(svg.includes('fill="#123456"'), "dark colour");
  assert.ok(svg.includes("<title>Demo store payment QR</title>"));
  assert.ok(svg.includes('aria-label="Demo store payment QR"'), "title doubles as the accessible name");
  assert.equal(/rx="/.test(svg), false, "no rounding by default");
  assertWellFormedXml(svg);

  const rounded = toSvg(matrix, { radius: 3, className: "qr", ariaLabel: "Payment code" });
  assert.ok(rounded.includes('class="qr"'));
  assert.ok(rounded.includes('aria-label="Payment code"'));
  assert.ok(rounded.includes('rx="3"'), "rounded quiet-zone corners");
  assert.ok(rounded.includes('ry="3"'));
  assertWellFormedXml(rounded);
});

test("toSvg with light: null is transparent (no background rectangle)", () => {
  const svg = toSvg(matrix, { light: null });
  assert.equal(svg.includes("<rect"), false);
  assert.equal(svg.includes('fill="#fff"'), false);
  assert.ok(svg.includes("<path "));
  assertWellFormedXml(svg);
});

test("toSvg escapes XML in titles and labels", () => {
  const title = 'A & B <script>alert("x")</script>';
  const svg = toSvg(matrix, { title, ariaLabel: 'label "quoted" & <angled>' });
  assert.equal(svg.includes("<script"), false, "title markup must be escaped");
  assert.ok(svg.includes("A &amp; B &lt;script&gt;"));
  assert.ok(svg.includes("&quot;quoted&quot;"));
  assertWellFormedXml(svg);
});

test("toSvg is deterministic", () => {
  assert.equal(toSvg(matrix), toSvg(matrix));
  const again = encode("render test payload", { level: "M" });
  assert.equal(toSvg(matrix), toSvg(again));
});

test("toSvgPath returns just a dark-module path element", () => {
  const path = toSvgPath(matrix, { margin: 1, dark: "#0a0" });
  assert.ok(path.startsWith("<path d=\"M"), "path starts with a move command");
  assert.ok(path.endsWith("/>"));
  assert.ok(path.includes('fill="#0a0"'));
  assert.ok(path.includes('shape-rendering="crispEdges"'));
  assert.equal(path.includes("<svg"), false);
  assert.equal(path.includes("<rect"), false);
  // The path must contain enough sub-paths to draw every dark module run.
  const moveCommands = path.split("M").length - 1;
  assert.ok(moveCommands > 10, `expected many sub-paths, got ${moveCommands}`);
});

test("toTerminal renders a scannable-shape half-block symbol", () => {
  const output = toTerminal(matrix);
  const lines = output.split("\n");
  const paddedDimension = matrix.size + 8 + ((matrix.size + 8) % 2);
  assert.equal(lines.length, paddedDimension / 2, "one terminal line per two module rows");

  // Top quiet zone: margin 4 = two blank terminal lines, then the symbol.
  assert.equal(lines[0], "");
  assert.equal(lines[1], "");
  assert.notEqual(lines[2], "");

  // Only half-block characters (and spaces) are used.
  for (const line of lines) {
    assert.match(line, /^[█▀▄ ]*$/u);
  }
  // A QR symbol always has dark modules, so at least one full block shows up.
  assert.ok(output.includes("█"));
  assert.equal(output.includes("\x1b["), false, "plain output carries no ANSI escapes");
});

test("toTerminal respects the margin option", () => {
  const small = toTerminal(matrix, { margin: 2 });
  const lines = small.split("\n");
  assert.equal(lines.length, (matrix.size + 4 + 1) / 2);
  assert.equal(lines[0], "");
  const large = toTerminal(matrix, { margin: 4 });
  assert.ok(lines.length < large.split("\n").length);
});

test("toTerminal colour mode emits ANSI background sequences", () => {
  const output = toTerminal(matrix, { dark: "#000", light: "#fff" });
  const lines = output.split("\n");
  const paddedDimension = matrix.size + 8 + ((matrix.size + 8) % 2);
  assert.equal(lines.length, paddedDimension, "colour mode renders one line per module row");
  assert.ok(output.includes("\x1b[48;2;0;0;0m"), "truecolor dark background");
  assert.ok(output.includes("\x1b[48;2;255;255;255m"), "truecolor light background");
  for (const line of lines) assert.ok(line.endsWith("\x1b[0m"), "every line resets the style");

  const named = toTerminal(matrix, { dark: "black", light: "white" });
  assert.ok(named.includes("\x1b[40m"));
  assert.ok(named.includes("\x1b[47m"));
});

test("renderers reject invalid options", () => {
  assert.throws(() => toSvg(matrix, { margin: -1 }), RangeError);
  assert.throws(() => toSvg(matrix, { margin: 1.5 }), RangeError);
  assert.throws(() => toSvg(matrix, { scale: 0 }), RangeError);
  assert.throws(() => toSvg(matrix, { scale: Number.POSITIVE_INFINITY }), RangeError);
  assert.throws(() => toSvg(matrix, { radius: -2 }), RangeError);
  assert.throws(() => toTerminal(matrix, { margin: -1 }), RangeError);
  assert.throws(() => toTerminal(matrix, { dark: "not-a-colour" }), RangeError);
});
