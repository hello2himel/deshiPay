/*
 * Reads a QR code out of an image file (screenshot or photo), entirely in the browser.
 * Tries the native BarcodeDetector when present, then jsQR, over a few crops and sizes,
 * because screenshots from payment apps often have a lot of UI around the code.
 */
(function () {
  "use strict";

  function grayVariants(id) {
    var d = id.data, n = d.length / 4, gr = new Uint8ClampedArray(n), i;
    for (i = 0; i < n; i++) gr[i] = Math.min(d[4 * i], d[4 * i + 1], d[4 * i + 2]);
    var hs = new Array(256).fill(0), sum = 0;
    for (i = 0; i < n; i++) hs[gr[i]]++;
    for (i = 0; i < 256; i++) sum += i * hs[i];
    // Otsu threshold
    var sb = 0, wb = 0, mx = 0, th = 128;
    for (var t = 0; t < 256; t++) {
      wb += hs[t];
      if (!wb) continue;
      var wf = n - wb;
      if (!wf) break;
      sb += t * hs[t];
      var mb = sb / wb, mf = (sum - sb) / wf, v = wb * wf * (mb - mf) * (mb - mf);
      if (v > mx) { mx = v; th = t; }
    }
    function mk(f) {
      var o = new Uint8ClampedArray(d.length);
      for (var j = 0; j < n; j++) {
        var val = f(gr[j]);
        o[4 * j] = o[4 * j + 1] = o[4 * j + 2] = val;
        o[4 * j + 3] = 255;
      }
      return o;
    }
    return [mk(function (v) { return v; }), mk(function (v) { return v > th ? 255 : 0; })];
  }

  var tick = function () { return new Promise(function (r) { setTimeout(r); }); };

  async function decode(file) {
    var bmp = await createImageBitmap(file);
    try {
      var W = bmp.width, H = bmp.height;
      var regions = [[0, 0, W, H], [W * 0.08, H * 0.1, W * 0.84, H * 0.65], [0, H * 0.2, W, H * 0.5]];
      for (var ri = 0; ri < regions.length; ri++) {
        var sx = regions[ri][0], sy = regions[ri][1], sw = regions[ri][2], sh = regions[ri][3];
        var widths = [1000, 1500, 640];
        for (var wi = 0; wi < widths.length; wi++) {
          var sc = widths[wi] / sw, w = Math.round(sw * sc), h = Math.round(sh * sc);
          if (w * h > 9e6) continue;
          var c = document.createElement("canvas");
          c.width = w; c.height = h;
          var g = c.getContext("2d", { willReadFrequently: true });
          g.fillStyle = "#fff";
          g.fillRect(0, 0, w, h);
          g.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);

          if ("BarcodeDetector" in window) {
            try {
              var found = await new BarcodeDetector({ formats: ["qr_code"] }).detect(c);
              if (found.length) return found[0].rawValue;
            } catch (e) { /* fall through to jsQR */ }
          }
          if (!window.jsQR) continue;
          var id = g.getImageData(0, 0, w, h);
          var r = window.jsQR(id.data, w, h, { inversionAttempts: "attemptBoth" });
          if (r) return r.data;
          var vars = grayVariants(id);
          for (var vi = 0; vi < vars.length; vi++) {
            r = window.jsQR(vars[vi], w, h, { inversionAttempts: "dontInvert" });
            if (r) return r.data;
          }
          await tick(); // keep the page responsive between attempts
        }
      }
      return null;
    } finally {
      if (bmp.close) bmp.close();
    }
  }

  window.Deshi.reader = { decode: decode, hasJsQR: function () { return !!window.jsQR; } };
})();
