/*
 * Printable "Pay here" poster, A4 / A5 portrait.
 *
 * The QR is the owner's amount-free Bangla QR (page.qr_payload): the same
 * static payload customers scan on the payment page, never a DeshiPay URL.
 * Output is a self-contained SVG in millimetres (inline QR, system-font stack,
 * no external assets) that prints at 100% or opens in a vector app.
 *
 * Layout follows the print spec: white paper to trim, safe margins, 117 mm QR
 * on A4 / 78 mm on A5, a 9 mm / 7 mm white quiet zone, pure black QR, ink text,
 * green only for accents. No filters, patterns, foreignObject or images.
 */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg", XLINK = "http://www.w3.org/1999/xlink";
  var DISPLAY = 'Bricolage Grotesque, Hind Siliguri, Noto Sans Bengali, Nirmala UI, Arial, Helvetica, sans-serif';
  var BODY = 'Figtree, Hind Siliguri, Noto Sans Bengali, Nirmala UI, Segoe UI, Arial, Helvetica, sans-serif';
  var INK = "#181D2B", MUTED = "#5F6573", GREEN = "#056B4E", MINT = "#E6F0ED", PAPER = "#FFFFFF", LINE = "#B9D6CD";
  var MARK = "M42.89 35.39A12 12 0 0 0 22.4 43.87L22.4 67.6A10 10 0 0 0 32.4 77.6L56.13 77.6A12 12 0 0 0 64.61 57.11Z";

  /* All values in millimetres / point sizes converted with pt*0.352778. */
  var FORMATS = {
    a4: { w: 210, h: 297, m: 18, cx: 105,
      markX: 18, markY: 16, markSize: 8, wordX: 28.6, wordY: 22.2, wordPt: 15, wordLS: -0.1,
      microX: 192, microY: 22.7, microPt: 7, cornerTop: 46, cornerBottom: 24, footMark: 7,
      ruleY: 31, tickW: 13,
      titleY: 60, titlePt: 76, titleLS: -0.55,
      payToY: 71, payToPt: 7.5, merchantY: 91, merchantPt: 24,
      qr: { x: 46.5, y: 107.5, size: 117, plateX: 36, plateY: 97, plateW: 138, plateR: 6, cardX: 37.5, cardY: 98.5, cardW: 135, cardR: 4.5 },
      inY: 241, inPt: 15,
      logo1Y: 249, logo1H: 12, logo2Y: 264, logo2H: 10,
      legalY: 280, legalPt: 7.5 },
    a5: { w: 148, h: 210, m: 13, cx: 74,
      markX: 13, markY: 10.5, markSize: 5.8, wordX: 20.7, wordY: 14.9, wordPt: 11, wordLS: -0.07,
      microX: 135, microY: 16.2, microPt: 6.8, cornerTop: 38, cornerBottom: 18, footMark: 5.5,
      ruleY: 22, tickW: 10,
      titleY: 40.5, titlePt: 46, titleLS: -0.34,
      payToY: 49.5, payToPt: 7, merchantY: 65, merchantPt: 16,
      qr: { x: 35, y: 79.5, size: 78, plateX: 26.5, plateY: 71, plateW: 95, plateR: 4.5, cardX: 28, cardY: 72.5, cardW: 92, cardR: 3 },
      inY: 170, inPt: 12.5,
      logo1Y: 174, logo1H: 8, logo2Y: 185, logo2H: 7,
      legalY: 199, legalPt: 7 }
  };

  var measure = document.createElement("canvas").getContext("2d");
  var PX = 96 / 25.4;
  function mm(pt) { return pt * 0.352778; }
  function el(name, attrs, text) {
    var n = document.createElementNS(NS, name);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (attrs[k] != null) n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }
  function widthOf(text, size, weight, family) {
    measure.font = (weight || 400) + " " + (size * PX) + "px " + (family || DISPLAY);
    return measure.measureText(text).width / PX;
  }
  function splitLong(word, maxW, size, weight, family) {
    var out = [], cur = "";
    for (var i = 0; i < word.length; i++) {
      var next = cur + word.charAt(i);
      if (cur && widthOf(next, size, weight, family) > maxW) { out.push(cur); cur = word.charAt(i); }
      else cur = next;
    }
    if (cur) out.push(cur);
    return out;
  }
  function wrap(text, maxW, size, weight, family) {
    var words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    var lines = [], line = "";
    words.forEach(function (word) {
      var next = line ? line + " " + word : word;
      if (widthOf(next, size, weight, family) <= maxW) { line = next; return; }
      if (line) lines.push(line);
      line = "";
      if (widthOf(word, size, weight, family) <= maxW) { line = word; return; }
      var parts = splitLong(word, maxW, size, weight, family);
      parts.slice(0, -1).forEach(function (p) { lines.push(p); });
      line = parts[parts.length - 1] || "";
    });
    if (line) lines.push(line);
    return lines;
  }
  function fit(text, maxW, base, min, weight, maxLines, family) {
    var size = base;
    while (size > min) {
      var lines = wrap(text, maxW, size, weight, family);
      if (lines.length <= maxLines) return { size: size, lines: lines };
      size = Math.max(min, size - 0.25);
    }
    var out = wrap(text, maxW, min, weight, family);
    if (out.length > maxLines) {
      out = out.slice(0, maxLines);
      out[maxLines - 1] = out[maxLines - 1].replace(/[.,;:!?]?$/, "…");
    }
    return { size: min, lines: out };
  }
  function centeredLines(cx, lastBaseline, lines, size, lineRatio, attrs) {
    var t = el("text", Object.assign({ x: cx, "text-anchor": "middle", "xml:space": "preserve" }, attrs));
    var lh = size * lineRatio;
    lines.forEach(function (line, i) {
      t.appendChild(el("tspan", { x: cx, y: lastBaseline - (lines.length - 1 - i) * lh }, line));
    });
    return t;
  }
  function mark(x, y, size) {
    var g = el("g", { transform: "translate(" + x + " " + y + ") scale(" + (size / 100) + ")" });
    g.appendChild(el("rect", { width: 100, height: 100, rx: 32.4, fill: GREEN }));
    g.appendChild(el("path", { d: MARK, fill: PAPER }));
    return g;
  }

  function logoImage(svg, item, cx, top, size) {
    var g = el("g", { "data-logo": item.name, "aria-label": item.name });
    var img = el("image", { x: cx - size / 2, y: top, width: size, height: size, preserveAspectRatio: "xMidYMid meet" });
    img.setAttribute("href", item.src);
    img.setAttributeNS(XLINK, "xlink:href", item.src);
    g.appendChild(img);
    svg.appendChild(g);
  }
  function logoBanglaQr(svg, item, cx, top, size) {
    var doc = new DOMParser().parseFromString(item.svg, "image/svg+xml");
    var src = doc.documentElement;
    var vb = (src.getAttribute("viewBox") || "0 0 1 1").split(/\s+/).map(Number);
    var ratio = vb[2] && vb[3] ? vb[2] / vb[3] : 1;
    var h = size, w = h * ratio;
    var g = el("g", { "data-logo": item.name, "aria-label": item.name });
    var nested = el("svg", { x: cx - w / 2, y: top, width: w, height: h, viewBox: vb.join(" "), preserveAspectRatio: "xMidYMid meet" });
    Array.prototype.forEach.call(src.childNodes, function (n) { nested.appendChild(document.importNode(n, true)); });
    g.appendChild(nested);
    svg.appendChild(g);
  }
  function appLogos(svg, f) {
    var L = window.DeshiPosterLogos;
    if (!L) return;
    var rowW = f.w - f.m * 2;
    function row(items, top, size, firstIsQr) {
      var slot = rowW / items.length;
      items.forEach(function (item, i) {
        var cx = f.m + slot * (i + 0.5);
        if (firstIsQr && item === L.banglaqr) logoBanglaQr(svg, item, cx, top, size);
        else logoImage(svg, item, cx, top, size);
      });
    }
    row(L.mfs.concat([L.banglaqr]), f.logo1Y, f.logo1H, true);
    row(L.banks, f.logo2Y, f.logo2H, false);
  }

  function build(page, format) {
    var f = FORMATS[format] || FORMATS.a4;
    if (!page || !page.qr_payload) return null;
    var svg = el("svg", { xmlns: NS, width: f.w + "mm", height: f.h + "mm", viewBox: "0 0 " + f.w + " " + f.h,
      version: "1.1", role: "img", "aria-label": "Printable DeshiPay poster: pay " + (page.title || "this business") });
    svg.appendChild(el("title", null, "Pay " + (page.title || "here") + " · DeshiPay poster"));
    svg.appendChild(el("rect", { x: 0, y: 0, width: f.w, height: f.h, fill: PAPER }));

    // mint corner arcs from the first visual study; kept away from the QR quiet zone
    var rt = f.cornerTop, rb = f.cornerBottom;
    svg.appendChild(el("path", { d: "M" + (f.w - rt) + " 0 A" + rt + " " + rt + " 0 0 1 " + f.w + " " + rt + " L" + f.w + " 0 Z", fill: MINT }));
    svg.appendChild(el("path", { d: "M0 " + (f.h - rb) + " A" + rb + " " + rb + " 0 0 1 " + rb + " " + f.h + " L0 " + f.h + " Z", fill: MINT }));

    // header
    svg.appendChild(mark(f.markX, f.markY, f.markSize));
    svg.appendChild(el("text", { x: f.wordX, y: f.wordY, "font-family": DISPLAY, "font-weight": 800, "font-size": mm(f.wordPt),
      "letter-spacing": f.wordLS, fill: INK }, "DeshiPay"));
    svg.appendChild(el("text", { x: f.microX, y: f.microY, "text-anchor": "end", "font-family": BODY, "font-weight": 800,
      "font-size": mm(f.microPt), "letter-spacing": 0.7, fill: GREEN }, "SCAN TO PAY"));

    // hairline + green register tick
    svg.appendChild(el("rect", { x: f.m, y: f.ruleY - 0.15, width: f.w - f.m * 2, height: 0.3, fill: LINE }));
    svg.appendChild(el("rect", { x: f.m, y: f.ruleY - 0.3, width: f.tickW, height: 0.6, fill: GREEN }));

    // "Pay here." headline
    var head = el("text", { x: f.cx, y: f.titleY, "text-anchor": "middle", "font-family": DISPLAY, "font-weight": 800,
      "font-size": mm(f.titlePt), "letter-spacing": f.titleLS, fill: INK });
    head.appendChild(el("tspan", null, "Pay here"));
    var dot = el("tspan", { fill: GREEN }, ".");
    head.appendChild(dot);
    svg.appendChild(head);

    // PAY TO + merchant (1-2 measured lines, last baseline fixed, label lifts for 2 lines)
    var merchant = fit(page.title || "Your business", f.w - f.m * 2, mm(f.merchantPt), mm(f.merchantPt) * 0.8, 700, 2, DISPLAY);
    var labelY = f.payToY - (merchant.lines.length > 1 ? 2.5 : 0);
    svg.appendChild(el("text", { x: f.cx, y: labelY, "text-anchor": "middle", "font-family": BODY, "font-weight": 700,
      "font-size": mm(f.payToPt), "letter-spacing": 0.35, fill: MUTED }, "PAY TO"));
    svg.appendChild(centeredLines(f.cx, f.merchantY, merchant.lines, merchant.size, 1.12,
      { "font-family": DISPLAY, "font-weight": 700, "font-size": merchant.size, "letter-spacing": -0.07, fill: INK }));

    // QR plate: mint ring, white quiet-zone plate, merchant's static QR
    var q = f.qr;
    svg.appendChild(el("rect", { x: q.plateX, y: q.plateY, width: q.plateW, height: q.plateW, rx: q.plateR, fill: MINT }));
    svg.appendChild(el("rect", { x: q.cardX, y: q.cardY, width: q.cardW, height: q.cardW, rx: q.cardR, fill: PAPER }));
    var qr = window.Deshi.qrSvg(page.qr_payload);
    qr.setAttribute("x", q.x); qr.setAttribute("y", q.y);
    qr.setAttribute("width", q.size); qr.setAttribute("height", q.size);
    svg.appendChild(qr);

    // single instruction line: static QR wants an amount typed in the app;
    // an amount-specific QR already carries the amount.
    var instruction = page.amountLabel
      ? "Pay " + page.amountLabel + " by scanning this QR."
      : "Scan with bKash, Nagad, Rocket or any bank app.";
    svg.appendChild(el("text", { x: f.cx, y: f.inY, "text-anchor": "middle", "font-family": BODY, "font-weight": 600,
      "font-size": mm(f.inPt), fill: INK }, instruction));

    // supported apps: Play Store icons for the four MFS + top-five bank apps,
    // plus the Bangla QR standard mark
    appLogos(svg, f);

    svg.appendChild(el("text", { x: f.cx, y: f.legalY, "text-anchor": "middle", "font-family": BODY, "font-weight": 400,
      "font-size": mm(f.legalPt), fill: MUTED }, "DeshiPay is not a payment processor. You pay in your own banking app."));
    svg.appendChild(mark(f.m - 4, f.h - f.m - f.footMark, f.footMark));
    return svg;
  }

  function serialize(svg) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg);
  }
  function slug(page) {
    return String((page && (page.username || page.title)) || "page").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "page";
  }
  function filename(page, format) {
    return "deshipay-poster-" + (format || "a4") + "-" + slug(page) + (page.amount ? "-tk" + page.amount : "") + ".svg";
  }
  function download(page, format) {
    var svg = build(page, format);
    if (!svg) return null;
    var blob = new Blob([serialize(svg)], { type: "image/svg+xml" });
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = filename(page, format);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    return a.download;
  }
  function print(page, format) {
    var svg = build(page, format);
    if (!svg) return false;
    var f = FORMATS[format] || FORMATS.a4;
    var w = window.open("", "_blank");
    if (!w) return false;
    var mmSize = f.w + "mm " + f.h + "mm";
    w.document.open();
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + filename(page, format).replace(/\.svg$/, "") +
      '</title><style>@page{size:' + mmSize + ';margin:0}html,body{margin:0;padding:0;background:#fff}' +
      'svg{width:100%;height:auto;display:block;print-color-adjust:exact;-webkit-print-color-adjust:exact}' +
      '@media print{html,body{width:' + mmSize + '}svg{width:' + f.w + 'mm;height:' + f.h + 'mm}}</style></head><body>' +
      serialize(svg) + '<script>window.addEventListener("load",function(){setTimeout(function(){window.focus();window.print();},250);});</script></body></html>');
    w.document.close();
    return true;
  }

  window.DeshiPoster = { build: build, download: download, print: print, filename: filename, FORMATS: FORMATS };
})();
