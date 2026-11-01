/*
 * Standalone export: turns a page object into ONE self-contained HTML file.
 *
 * The owner downloads that file from the dashboard (Share tab) or from the
 * offline wizard, then hosts it anywhere a static file can live. The file keeps
 * the exact customer-page experience of /<username>: the same CSS, the same
 * vendored engines, the same PayView/pay.js, with the page data embedded as
 * window.DESHIQR_PAGE. No Supabase, config.js, auth or jsQR is needed.
 *
 * Load order on app.html: /js/common.js (creates window.Deshi), then this file.
 * Node: require() returns the same three functions so the builder can be tested
 * without a browser. The pure path (buildPageHtml) never touches the DOM.
 *
 * Browser API (attached to window.Deshi):
 *   Deshi.buildPageHtml(page, assets) -> string
 *   Deshi.exportPage(page)            -> Promise<string>
 *   Deshi.downloadPage(page)          -> Promise<{ filename }>
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root);
  else factory(root);
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  // Same font stack pay.html loads. A custom assets.fontUrl replaces it; "" skips it.
  var FONT_URL =
    "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Figtree:wght@400..800&display=swap";

  var CSS_ASSETS = ["themes", "base", "pay"];
  var CSS_FILES = { themes: "/css/themes.css", base: "/css/base.css", pay: "/css/pay.css" };
  var JS_ASSETS = ["qrcode", "engine", "payload", "common", "providers", "payview", "pay"];
  var JS_FILES = {
    qrcode: "/vendor/qrcode.js",
    engine: "/vendor/deshiqr.global.js",
    payload: "/js/payload.js",
    common: "/js/common.js",
    providers: "/js/providers.js",
    payview: "/js/payview.js",
    pay: "/js/pay.js"
  };
  var FAVICON_FILE = "/favicon.svg";

  // Themes are ids from public/js/providers.js. Anything else falls back to rose,
  // so page.theme can never break out of the attribute.
  var THEME_RE = /^[a-z0-9-]{1,32}$/;

  var _assets = null; // Promise<assets> cache for exportPage()

  /* ---------------- escaping / safety ---------------- */

  // JSON for an inline <script>: a literal "<" becomes \u003c (so "</script",
  // "<!--" and every other markup-ish sequence stays inert), and the two
  // line separators that are valid JSON but not always valid in script source.
  function jsonForScript(value) {
    return JSON.stringify(value)
      .replace(/</g, "\\u003c")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  }

  // Inlined JS must not contain a literal "</script" either, or the browser
  // would end the element early. In a string literal "<\/script" is identical.
  function guardScript(src) {
    return String(src).replace(/<\/script/gi, "<\\/script");
  }

  function guardStyle(src) {
    return String(src).replace(/<\/style/gi, "<\\/style");
  }

  function attr(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function dataUri(svg) {
    var source = String(svg || "");
    if (!source) return "";
    if (/^data:/i.test(source)) return source;
    return "data:image/svg+xml," + encodeURIComponent(source);
  }

  function themeId(theme) {
    return typeof theme === "string" && THEME_RE.test(theme) ? theme : "emerald";
  }

  function footerHref(assets) {
    var href = assets && assets.footerHref;
    return typeof href === "string" && href ? href : "/";
  }

  /* ---------------- asset access (pure builder) ---------------- */

  function assetText(assets, group, key, file) {
    var bucket = assets && assets[group];
    var value = bucket && bucket[key];
    if (typeof value !== "string" || !value) {
      throw new Error(
        "DeshiPay export: missing " + group + "." + key + " asset. Pass the contents of " + file + " as assets." + group + "." + key
      );
    }
    return value;
  }

  /* ---------------- the generated file ---------------- */

  // page: { username, title, message, theme, presets, qr_payload, qr_name, qr_city,
  //         ref_prefix, ref_len, wallets[], banks[] }
  // assets: { css:{themes,base,pay}, js:{qrcode,engine,payload,common,providers,payview,pay},
  //           favicon?, fontUrl?, footerHref? }
  function buildPageHtml(page, assets) {
    if (!page || typeof page !== "object" || Array.isArray(page)) {
      throw new Error("DeshiPay export: a page object is required");
    }
    assets = assets || {};

    var css = "";
    for (var i = 0; i < CSS_ASSETS.length; i++) {
      var cssKey = CSS_ASSETS[i];
      css += "<style>\n" + guardStyle(assetText(assets, "css", cssKey, CSS_FILES[cssKey])) + "\n</style>\n";
    }

    var js = "";
    for (var j = 0; j < JS_ASSETS.length; j++) {
      var jsKey = JS_ASSETS[j];
      js += "<script>\n" + guardScript(assetText(assets, "js", jsKey, JS_FILES[jsKey])) + "\n</script>\n";
    }

    // The page data is injected as escaped JSON only: user text never lands in markup.
    var pageJson = jsonForScript(page);
    var footer = footerHref(assets);
    var fontUrl = typeof assets.fontUrl === "string" ? assets.fontUrl : FONT_URL;
    var icon = typeof assets.favicon === "string" ? dataUri(assets.favicon) : "";

    var head = [
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
      '<meta name="robots" content="noindex">',
      "<title>Payment page · DeshiPay</title>",
      '<meta name="theme-color" content="#E6F0ED">',
      '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#141F25">',
      icon ? '<link rel="icon" href="' + attr(icon) + '" type="image/svg+xml">' : "",
      fontUrl ? '<link rel="preconnect" href="https://fonts.googleapis.com">' : "",
      fontUrl ? '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' : "",
      fontUrl ? '<link rel="stylesheet" href="' + attr(fontUrl) + '">' : ""
    ];

    // The three <style> blocks keep pay.html's order: themes, base, pay.
    var lines = ["<!doctype html>", '<html lang="en" data-theme="' + attr(themeId(page.theme)) + '">', "<head>"];
    lines = lines.concat(head);
    lines.push(css.replace(/\n$/, ""));
    lines.push("</head>");
    lines.push('<body class="pay-page">');
    lines.push('<div id="root"></div>');
    lines.push(
      '<noscript><div class="pv-state"><h1>JavaScript needed</h1><p>This payment page needs JavaScript to draw the QR code.</p></div></noscript>'
    );
    // pay.html's script order, all inlined; the data comes first so pay.js sees it.
    lines.push("<script>");
    lines.push("window.DESHIQR_PAGE = " + pageJson + ";");
    lines.push("window.DESHIQR_FOOTER_HREF = " + jsonForScript(footer) + ";");
    lines.push("</script>");
    lines.push(js.replace(/\n$/, ""));
    lines.push("</body>");
    lines.push("</html>");
    lines.push("");
    return lines.join("\n");
  }

  /* ---------------- browser wiring: fetch the real assets once ---------------- */

  function fetchText(url) {
    if (typeof fetch !== "function") {
      return Promise.reject(new Error("DeshiPay export: fetch() isn’t available in this browser"));
    }
    return fetch(url, { cache: "no-store", credentials: "same-origin" }).then(function (res) {
      if (!res.ok) throw new Error("DeshiPay export: couldn’t load " + url + " (HTTP " + res.status + ")");
      return res.text();
    });
  }

  function loadAssets() {
    if (_assets) return _assets;
    var files = [
      fetchText(CSS_FILES.themes),
      fetchText(CSS_FILES.base),
      fetchText(CSS_FILES.pay),
      fetchText(JS_FILES.qrcode),
      fetchText(JS_FILES.engine),
      fetchText(JS_FILES.payload),
      fetchText(JS_FILES.common),
      fetchText(JS_FILES.providers),
      fetchText(JS_FILES.payview),
      fetchText(JS_FILES.pay),
      fetchText(FAVICON_FILE)
    ];
    _assets = Promise.all(files).then(
      function (texts) {
        return {
          css: { themes: texts[0], base: texts[1], pay: texts[2] },
          js: {
            qrcode: texts[3],
            engine: texts[4],
            payload: texts[5],
            common: texts[6],
            providers: texts[7],
            payview: texts[8],
            pay: texts[9]
          },
          favicon: texts[10],
          fontUrl: FONT_URL
        };
      },
      function (error) {
        _assets = null; // a later attempt can retry
        throw error;
      }
    );
    return _assets;
  }

  function originHref() {
    var loc = typeof location !== "undefined" ? location : null;
    // location.origin is the string "null" on file:, fall back to the safe relative root.
    return loc && loc.origin && loc.origin !== "null" ? loc.origin + "/" : "/";
  }

  // Resolves with the complete standalone HTML for the page object.
  function exportPage(page) {
    if (!page || typeof page !== "object" || Array.isArray(page)) {
      return Promise.reject(new Error("DeshiPay export: a page object is required"));
    }
    return loadAssets().then(function (assets) {
      return buildPageHtml(page, {
        css: assets.css,
        js: assets.js,
        favicon: assets.favicon,
        fontUrl: assets.fontUrl,
        footerHref: originHref()
      });
    });
  }

  /* ---------------- save (mirrors Deshi.saveImage for the HTML blob) ---------------- */

  function slug(value) {
    var T = root.Deshi || {};
    var out = typeof T.slugify === "function" ? T.slugify(value) : "";
    if (out) return out;
    return String(value == null ? "" : value)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  }

  function fileNameFor(page) {
    // The dashboard usually passes a username, but the offline wizard may not ask
    // for one: fall back to the title ("Demo Shop" -> demo-shop), then "page".
    var name = slug(page && page.username) || slug(page && page.title) || "page";
    return "deshiqr-" + name + ".html";
  }

  // Touch devices get the share sheet (it has "Save to Files"), everything else
  // an anchor download, the same pattern as Deshi.saveImage.
  function saveHtml(html, filename) {
    var blob = new Blob([html], { type: "text/html;charset=utf-8" });
    var file = typeof File === "function" ? new File([blob], filename, { type: "text/html" }) : null;
    var touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    var viaShare = !!(touch && file && navigator.canShare && navigator.canShare({ files: [file] }));
    function download() {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      return "saved";
    }
    if (!viaShare) return Promise.resolve(download());
    return navigator.share({ files: [file] }).then(function () { return "shared"; }, function (e) {
      return e && e.name === "AbortError" ? "cancelled" : download();
    });
  }

  // exportPage() + save it as deshiqr-<username>.html; resolves with the filename.
  function downloadPage(page) {
    var filename = fileNameFor(page);
    var T = root.Deshi || {};
    return exportPage(page).then(function (html) {
      return saveHtml(html, filename).then(function (result) {
        if (typeof T.toast === "function") {
          if (result === "shared") T.toast("Payment page shared");
          else if (result === "saved") T.toast("Payment page downloaded");
        }
        return { filename: filename };
      });
    });
  }

  var api = {
    buildPageHtml: buildPageHtml,
    exportPage: exportPage,
    downloadPage: downloadPage
  };

  if (root.Deshi && typeof root.Deshi === "object") {
    root.Deshi.buildPageHtml = buildPageHtml;
    root.Deshi.exportPage = exportPage;
    root.Deshi.downloadPage = downloadPage;
  } else if (!(typeof module === "object" && module.exports)) {
    throw new Error("DeshiPay export: window.Deshi is missing. Load /js/common.js before /js/export.js.");
  }

  return api;
});
