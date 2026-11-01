/*
 * Printable DeshiPay poster, A4 / A5 portrait.
 *
 * The QR is the owner's static Bangla QR (or an amount-bearing version for a
 * Payment request). It is never a link to the DeshiPay page. Output is a
 * self-contained SVG in millimetres, with local/system fonts and embedded
 * Play-store app icons from poster-logos.js.
 *
 * Design: payee name is the hero, "Pay here." is a small supporting line,
 * QR is ~55-60% of the width, three-step hint, one row each of MFS and bank
 * apps, and a quiet footer. No external assets, no filters or foreignObject.
 */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg", XLINK = "http://www.w3.org/1999/xlink";
  var DISPLAY = 'Bricolage Grotesque, Hind Siliguri, Noto Sans Bengali, Nirmala UI, Arial, sans-serif';
  var BODY = 'Figtree, Hind Siliguri, Noto Sans Bengali, Nirmala UI, Segoe UI, Arial, sans-serif';
  var INK = "#181D2B", HERO = "#0F172A", MUTED = "#4A5260", LINE = "#D8E6E0", GREEN = "#0B6B4F", MINT = "#E6F0ED", PAPER = "#FFFFFF";
  var MARK = "M42.89 35.39A12 12 0 0 0 22.4 43.87L22.4 67.6A10 10 0 0 0 32.4 77.6L56.13 77.6A12 12 0 0 0 64.61 57.11Z";

  var FORMATS = {
    a4: {
      w: 210, h: 297, m: 16, cx: 105,
      deco: { cx: 189, cy: 17, r: 39 },
      markX: 16, markY: 16, markSize: 9, wordX: 28.6, wordY: 22.8, wordPt: 16,
      headlineY: 46, headlinePt: 34, headlineLS: -0.5,
      payToY: 54, payToPt: 10, payToLS: 1.15,
      nameY: 76, namePt: 48, nameMinPt: 28, nameTwoLinePt: 36,
      qr: { plateX: 40, plateY: 84, plateW: 130, plateR: 7, cardX: 42.5, cardY: 86.5, cardW: 125, cardR: 4.5, x: 45, y: 89, size: 120 },
      stepsY: 225, stepsPt: 10,
      logos: { top: 238, tile: 12, gapX: 3.5, rowGap: 3 },
      footer: { lineY: 271, markX: 16, markY: 274, markSize: 6, textX: 25, textY: 280, textPt: 7.5 }
    },
    a5: {
      w: 148, h: 210, m: 10, cx: 74,
      deco: { cx: 134, cy: 10, r: 31 },
      markX: 10, markY: 10, markSize: 6.5, wordX: 19.2, wordY: 16.0, wordPt: 12,
      headlineY: 31, headlinePt: 24, headlineLS: -0.35,
      payToY: 38.5, payToPt: 8, payToLS: 0.9,
      nameY: 57, namePt: 32, nameMinPt: 19, nameTwoLinePt: 24,
      qr: { plateX: 29, plateY: 64, plateW: 90, plateR: 5, cardX: 31, cardY: 66.5, cardW: 86, cardR: 3.2, x: 33.5, y: 69, size: 82 },
      stepsY: 159, stepsPt: 8,
      logos: { top: 168, tile: 9, gapX: 3, rowGap: 2.4 },
      footer: { lineY: 192, markX: 10, markY: 194.5, markSize: 5, textX: 17, textY: 200, textPt: 6.5 }
    }
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
    measure.font = (weight || 400) + " " + (size * PX) + "px " + family;
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
  function fit(text, maxW, baseSize, minSize, weight, maxLines, family) {
    var size = baseSize;
    while (size > minSize) {
      var lines = wrap(text, maxW, size, weight, family);
      if (lines.length <= maxLines) return { size: size, lines: lines };
      size = Math.max(minSize, size - 0.25);
    }
    var out = wrap(text, maxW, minSize, weight, family);
    if (out.length > maxLines) {
      out = out.slice(0, maxLines);
      out[maxLines - 1] = out[maxLines - 1].replace(/[.,;:!?]?$/, "…");
    }
    return { size: minSize, lines: out };
  }
  function centeredText(cx, lastBaseline, lines, size, lineRatio, attrs, tspans) {
    var t = el("text", Object.assign({ x: cx, y: lastBaseline, "text-anchor": "middle", "xml:space": "preserve" }, attrs));
    var lh = size * lineRatio;
    lines.forEach(function (line, i) {
      t.appendChild(el("tspan", { x: cx, y: lastBaseline - (lines.length - 1 - i) * lh }, line));
    });
    if (tspans) tspans.forEach(function (s) { t.appendChild(s); });
    return t;
  }
  function mark(x, y, size, fill) {
    var g = el("g", { transform: "translate(" + x + " " + y + ") scale(" + (size / 100) + ")" });
    g.appendChild(el("rect", { width: 100, height: 100, rx: 32.4, fill: fill || GREEN }));
    g.appendChild(el("path", { d: MARK, fill: PAPER }));
    return g;
  }

  /* ---------- app logos (rounded tiles, Play icons + Bangla QR mark) ---------- */
  var logoSeq = 0;
  function logoClip(defs, x, top, size) {
    var id = "logo-clip-" + (++logoSeq);
    var clip = el("clipPath", { id: id });
    clip.appendChild(el("rect", { x: x, y: top, width: size, height: size, rx: size * 0.29 }));
    defs.appendChild(clip);
    return { id: id, tile: el("rect", { x: x, y: top, width: size, height: size, rx: size * 0.29, fill: "#E9EDEB" }) };
  }
  function logoImage(svg, defs, item, x, top, size) {
    // Transparent brand marks keep their own shape; only app icons get a tile.
    var bare = item.name === "Nagad" || item.name === "upay";
    var c = bare ? null : logoClip(defs, x, top, size);
    var g = el("g", { "data-logo": item.name, "aria-label": item.name });
    if (c) {
      g.setAttribute("clip-path", "url(#" + c.id + ")");
      g.appendChild(c.tile);
    }
    var img = el("image", { x: x, y: top, width: size, height: size, preserveAspectRatio: "xMidYMid meet" });
    img.setAttribute("href", item.src);
    img.setAttributeNS(XLINK, "xlink:href", item.src);
    g.appendChild(img);
    svg.appendChild(g);
  }
  function logoBanglaQr(svg, defs, item, x, top, size) {
    var doc = new DOMParser().parseFromString(item.svg, "image/svg+xml");
    var src = doc.documentElement;
    var vb = (src.getAttribute("viewBox") || "0 0 1 1").split(/\s+/).map(Number);
    var ratio = vb[2] && vb[3] ? vb[2] / vb[3] : 1;
    var h = size, w = h * ratio;
    // Bangla QR is the official standard mark, not an app tile: no rounded box.
    var g = el("g", { "data-logo": item.name, "aria-label": item.name });
    var nested = el("svg", { x: x + (size - w) / 2, y: top, width: w, height: h, viewBox: vb.join(" "), preserveAspectRatio: "xMidYMid meet" });
    Array.prototype.forEach.call(src.childNodes, function (n) { nested.appendChild(document.importNode(n, true)); });
    g.appendChild(nested);
    svg.appendChild(g);
  }
  function appLogos(svg, f, defs) {
    var L = window.DeshiPosterLogos;
    if (!L) return;
    var row1 = L.mfs.concat([L.banglaqr]);
    var row2 = L.banks;
    var width = row1.length * f.logos.tile + (row1.length - 1) * f.logos.gapX;
    var x0 = (f.w - width) / 2;
    function row(items, top) {
      items.forEach(function (item, i) {
        var x = x0 + i * (f.logos.tile + f.logos.gapX);
        if (item === L.banglaqr) logoBanglaQr(svg, defs, item, x, top, f.logos.tile);
        else logoImage(svg, defs, item, x, top, f.logos.tile);
      });
    }
    row(row1, f.logos.top);
    row(row2, f.logos.top + f.logos.tile + f.logos.rowGap);
  }

  function build(page, format) {
    var f = FORMATS[format] || FORMATS.a4;
    if (!page || !page.qr_payload) return null;
    var svg = el("svg", { xmlns: NS, width: f.w + "mm", height: f.h + "mm", viewBox: "0 0 " + f.w + " " + f.h,
      version: "1.1", role: "img", "aria-label": "Printable DeshiPay poster: pay " + (page.title || "this business") });
    svg.appendChild(el("title", null, "Pay " + (page.title || "here") + " · DeshiPay poster"));
    svg.appendChild(el("rect", { x: 0, y: 0, width: f.w, height: f.h, fill: PAPER }));
    svg.appendChild(el("circle", { cx: f.deco.cx, cy: f.deco.cy, r: f.deco.r, fill: MINT }));
    var defs = el("defs");
    svg.appendChild(defs);

    // header
    svg.appendChild(mark(f.markX, f.markY, f.markSize));
    svg.appendChild(el("text", { x: f.wordX, y: f.wordY, "font-family": DISPLAY, "font-weight": 800, "font-size": mm(f.wordPt),
      "letter-spacing": -0.03, fill: INK }, "DeshiPay"));

    // supporting headline; amount-specific posters put the amount here
    var headText = page.amountLabel ? "Pay " + page.amountLabel : "Pay here";
    var headFit = fit(headText, f.w - f.m * 2, mm(f.headlinePt), mm(f.headlinePt) * 0.55, 800, 1, DISPLAY);
    var head = el("text", { x: f.cx, y: f.headlineY, "text-anchor": "middle", "font-family": DISPLAY, "font-weight": 800,
      "font-size": headFit.size, "letter-spacing": f.headlineLS, fill: INK }, headFit.lines[0] || headText);
    head.appendChild(el("tspan", { fill: GREEN }, "."));
    svg.appendChild(head);

    // PAY TO + payee name (the hero)
    svg.appendChild(el("text", { x: f.cx, y: f.payToY, "text-anchor": "middle", "font-family": BODY, "font-weight": 700,
      "font-size": mm(f.payToPt), "letter-spacing": f.payToLS, fill: MUTED }, "PAY TO"));
    var maxNameW = f.w - f.m * 2;
    var name = fit(page.title || "Your business", maxNameW, mm(f.namePt), mm(f.nameMinPt), 800, 2, DISPLAY);
    if (name.lines.length > 1 && name.size > mm(f.nameTwoLinePt)) {
      name = fit(page.title || "Your business", maxNameW, mm(f.nameTwoLinePt), mm(f.nameMinPt), 800, 2, DISPLAY);
    }
    svg.appendChild(centeredText(f.cx, f.nameY, name.lines, name.size, 1.08,
      { "font-family": DISPLAY, "font-weight": 800, "font-size": name.size, "letter-spacing": -0.01, fill: HERO }));

    // QR plate: minimal padding, pure white card, merchant QR
    var q = f.qr;
    svg.appendChild(el("rect", { x: q.plateX, y: q.plateY, width: q.plateW, height: q.plateW, rx: q.plateR, fill: MINT }));
    svg.appendChild(el("rect", { x: q.cardX, y: q.cardY, width: q.cardW, height: q.cardW, rx: q.cardR, fill: PAPER }));
    var qr = window.Deshi.qrSvg(page.qr_payload);
    qr.setAttribute("x", q.x); qr.setAttribute("y", q.y);
    qr.setAttribute("width", q.size); qr.setAttribute("height", q.size);
    svg.appendChild(qr);

    // three-step hint row
    var steps = el("text", { x: f.cx, y: f.stepsY, "text-anchor": "middle", "font-family": BODY, "font-weight": 500,
      "font-size": mm(f.stepsPt), fill: MUTED });
    [["Open your app", false], [" → ", true], ["Tap Scan QR", false], [" → ", true], ["Confirm name", false]].forEach(function (s) {
      steps.appendChild(el("tspan", s[1] ? { fill: GREEN, "font-weight": 800 } : null, s[0]));
    });
    svg.appendChild(steps);

    appLogos(svg, f, defs);

    // footer: hairline, mark and legal copy aligned together
    var ft = f.footer;
    svg.appendChild(el("rect", { x: f.m, y: ft.lineY, width: f.w - f.m * 2, height: 0.3, fill: LINE }));
    svg.appendChild(mark(ft.markX, ft.markY, ft.markSize));
    svg.appendChild(el("text", { x: ft.textX, y: ft.textY, "font-family": BODY, "font-weight": 400,
      "font-size": mm(ft.textPt), fill: MUTED }, "DeshiPay is not a payment processor. You pay in your own banking app."));
    return svg;
  }

  function serialize(svg) { return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg); }
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
