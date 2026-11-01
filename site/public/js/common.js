/* Shared helpers for every page: DOM builder, icons, toast, clipboard, QR drawing, Supabase client. */
(function () {
  "use strict";

  var cfg = window.DESHIQR_CONFIG || {};
  var configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && !/YOUR-/i.test(cfg.supabaseUrl + cfg.supabaseAnonKey));
  var _client = null;

  // Keep in sync with public.is_reserved_username() in supabase/migrations/
  var RESERVED = new Set(
    (
      "2fa","about","abuse","account","admin","admin-team","administrator","affiliate","affiliates","agrani","alpha","amex",
      "api","app","assets","auth","bank","banks","beta","billing","binance","bkash","blog","brac",
      "bracbank","callback","careers","cart","cause","causes","checkout","citybank","coming-soon","complaint","complaints","contact",
      "cookies","copyright","css","customer-service","customerservice","dashboard","dbbl","demo","deshi-pay","deshi-qr","deshipay","deshipays",
      "deshiqr","dev","develop","development","dmca","docs","documentation","donate","donation","donations","email","emv",
      "emvco","error","errors","eula","false","faq","favicon","features","fonts","forgot","fraud","fund",
      "funding","funds","gdpr","hello","help","helpdesk","home","hostmaster","how","how-it-works","hsbc","icons",
      "images","img","impersonation","index","info","internal","invite","invites","invoice","invoices","islami","janata",
      "jobs","js","legal","license","login","logout","mail","maintenance","manifest","marketing","mastercard","mcash",
      "media","mfa","moderation","moderator","moderators","mycash","nagad","new","nil","no-reply","none","noreply",
      "npsb","null","oauth","official","okwallet","order","orders","otp","partner","partners","password","pathaopay",
      "pay","pay-now","paylink","payment","payment-link","payments","paynow","payoneer","paypal","policy","postmaster","press",
      "pricing","privacy","private","prod","production","profile","qr","qr-code","qrcode","receipt","receipts","redirect",
      "referral","referrals","register","report","reset","return","robots","rocket","root","rupali","sales","scam",
      "scan","secret","secure","security","service-worker","settings","sign-out","signin","signout","signup","sitemap","sonali",
      "sso","staff","staging","static","status","stripe","subscription","support","surecash","system","taka-qr","takaqr",
      "tap","team","terms","test","testing","tests","tip","tips","tos","true","trust","trust-safety",
      "undefined","upay","uploads","vendor","verification","verify","visa","wallet","wallets","webmaster","wise","www"
    ).split(",")
  );

  function client() {
    if (!configured || !window.supabase) return null;
    if (!_client) {
      _client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    }
    return _client;
  }

  /* ---------------- backend health ----------------
   * Free-tier Supabase projects pause when they are idle and then answer with
   * HTTP 540; 402 means the project is restricted. The site checks this once per
   * page load so the landing and the dashboard can pick online vs local mode.
   * Any HTTP answer at all means the project is reachable, so a configured site
   * that is still being set up (no tables yet) counts as online.
   */

  var _backend = null;

  // Resolves { network, status } and never rejects. A timeout or a CORS failure
  // is { network: true }.
  function probeFetch(url, headers, ms) {
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = 0;
    var timeout = new Promise(function (resolve) {
      timer = setTimeout(function () {
        if (ctrl) { try { ctrl.abort(); } catch (e) { /* already aborted */ } }
        resolve({ network: true, status: null });
      }, ms);
    });
    var opts = { method: "GET", cache: "no-store", credentials: "omit" };
    if (headers) opts.headers = headers;
    if (ctrl) opts.signal = ctrl.signal;
    var request;
    try {
      request = fetch(url, opts).then(
        function (res) { return { network: false, status: res.status }; },
        function () { return { network: true, status: null }; }
      );
    } catch (e) {
      request = Promise.resolve({ network: true, status: null });
    }
    return Promise.race([request, timeout]).then(function (r) {
      clearTimeout(timer);
      return r;
    });
  }

  function backendResult(r) {
    if (!r || r.network) return null;
    if (r.status === 540) return { configured: true, online: false, reason: "paused", status: 540 };
    if (r.status === 402) return { configured: true, online: false, reason: "restricted", status: 402 };
    return { configured: true, online: true, reason: "online", status: r.status };
  }

  // Promise<{ configured, online, reason, status }>, cached for this page load.
  // checkBackend({ force: true }) drops the cache and probes again (used by a
  // "Try again" button); calling it without options keeps the cached answer.
  function checkBackend(options) {
    if (!(options && options.force) && _backend) return _backend;
    _backend = null;
    if (!configured) {
      _backend = Promise.resolve({ configured: false, online: false, reason: "not-configured", status: null });
      return _backend;
    }
    var base = String(cfg.supabaseUrl).replace(/\/+$/, "");
    // Primary: the public auth health endpoint as a simple request, so there is
    // no CORS preflight. Some proxies/hosts fail this even when the project is
    // fine, so a network-level failure falls back to the API the site already
    // uses cross-origin (PostgREST supports CORS from browsers).
    _backend = probeFetch(base + "/auth/v1/health", null, 4000).then(backendResult).then(function (r) {
      if (r) return r;
      return probeFetch(base + "/rest/v1/", {
        apikey: cfg.supabaseAnonKey,
        Authorization: "Bearer " + cfg.supabaseAnonKey
      }, 4000).then(backendResult).then(function (r2) {
        return r2 || { configured: true, online: false, reason: "unreachable", status: null };
      });
    });
    return _backend;
  }

  /* ---------------- DOM ---------------- */

  var PROPS = { value: 1, checked: 1, selected: 1, disabled: 1, hidden: 1, readOnly: 1, textContent: 1 };

  // h("button", {class: "btn", onClick: fn}, "Label", iconEl). Text is always set as text, never as HTML.
  function h(tag, props) {
    var el = document.createElement(tag);
    var k;
    if (props) {
      for (k in props) {
        var v = props[k];
        if (v == null || v === false) continue;
        if (k === "class") el.className = v;
        else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (PROPS[k]) el[k] = v;
        else el.setAttribute(k, v === true ? "" : v);
      }
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) kid.forEach(function (x) { append(el, x); });
    else if (kid instanceof Node) el.appendChild(kid);
    else el.appendChild(document.createTextNode(String(kid)));
  }

  // fill(el, a, [b, c], null, "text"): replace el's children, flattening arrays and skipping nulls
  function fill(el) {
    el.replaceChildren();
    for (var i = 1; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  var NS = "http://www.w3.org/2000/svg";
  var ICONS = {
    qr: '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.4"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.4"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.4"/><path d="M14 14h3.2v3.2M20.5 14v.01M14 20.5h.01M17.2 20.5h3.3v-3.3"/>',
    wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H17a2 2 0 0 1 2 2v1.5"/><path d="M4 7.5v9.8A2.7 2.7 0 0 0 6.7 20H18a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2H6.5A2.5 2.5 0 0 1 4 5.5"/><circle cx="16" cy="14" r="1.1" fill="currentColor" stroke="none"/>',
    bank: '<path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2.2"/><path d="M5.5 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v.5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.2-2h6.6l1.2 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.4"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 3.5 3L16 12l4 4"/>',
    scan: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M8 12h8"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l.9 11.2A2 2 0 0 0 8.9 20h6.2a2 2 0 0 0 2-1.8L18 7M9 7V4.5h6V7"/>',
    share: '<path d="M12 15V3.5M8 7l4-3.5L16 7M5 12.5v6A2 2 0 0 0 7 20.5h10a2 2 0 0 0 2-2v-6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4.5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.1 0 1.9-.8 1.9-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a3.8 3.8 0 0 0 3.8-3.8C20.8 6.9 17 3.5 12 3.5z"/><circle cx="7.6" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="10.2" cy="7.4" r="1" fill="currentColor" stroke="none"/><circle cx="14.6" cy="7.4" r="1" fill="currentColor" stroke="none"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    eyeoff: '<path d="M3 3l18 18M10.6 6c.5-.1.9-.1 1.4-.1 6 0 9.5 6.1 9.5 6.1a16 16 0 0 1-2.8 3.4M6.5 7.6A15.600 15.600 0 0 0 2.500 12S6 18.100 12 18.100c1.400 0 2.700-.3 3.800-.8M9.900 9.900a2.800 2.800 0 0 0 4 4"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    next: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/>',
    logout: '<path d="M14 4h3.5A1.500 1.500 0 0 1 19 5.500v13a1.500 1.500 0 0 1-1.500 1.500H14M10 8l-4 4 4 4M6 12h9.500"/>',
    download: '<path d="M12 4v11M8 11.500l4 4 4-4M5 19.500h14"/>',
    shield: '<path d="M12 3.500 5 6v5.500c0 4.200 3 7.400 7 9 4-1.600 7-4.800 7-9V6z"/><path d="m9 12 2.200 2.200L15.500 10"/>',
    store: '<path d="M4 9.500 5.500 4.500h13L20 9.500M4 9.500a2.700 2.700 0 0 0 5.300 0 2.700 2.700 0 0 0 5.400 0 2.700 2.700 0 0 0 5.300 0M5.500 12.500V20h13v-7.500"/>',
    user: '<circle cx="12" cy="8.500" r="3.800"/><path d="M4.500 20a7.500 7.500 0 0 1 15 0"/>'
  };
  function icon(name, cls) {
    var s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("class", "ic" + (cls ? " " + cls : ""));
    s.setAttribute("aria-hidden", "true");
    s.innerHTML = ICONS[name] || ""; // static, trusted strings from the table above
    return s;
  }

  /* ---------------- feedback ---------------- */

  var toastEl = null, toastTimer = 0;
  function toast(msg, opts) {
    opts = opts || {};
    if (!toastEl) {
      toastEl = h("div", { class: "toast", role: "status", "aria-live": "polite" });
      document.body.appendChild(toastEl);
    }
    toastEl.replaceChildren(opts.error ? icon("alert") : icon("check"), document.createTextNode(msg));
    toastEl.classList.toggle("lift", !!opts.lift);
    void toastEl.offsetWidth;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, opts.ms || 2200);
  }

  function copyText(text) {
    var done = function () { return true; };
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(done, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  /* ---------------- formatting ---------------- */

  // Bangladeshi digit grouping: 1,00,000
  function taka(n) {
    return "৳" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }
  function bnToEn(s) {
    return String(s == null ? "" : s).replace(/[০-৯]/g, function (d) { return String(d.charCodeAt(0) - 0x09e6); });
  }
  function monogram(s) {
    var c = Array.from(String(s || "").trim().replace(/^[^\p{L}\p{N}]+/u, ""))[0];
    return c ? c.toUpperCase() : "•";
  }
  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s_-]/g, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30);
  }
  function usernameError(u) {
    if (!u) return "Pick a name for your link";
    if (u.length < 3) return "Use at least 3 characters";
    if (u.length > 30) return "Use 30 characters or fewer";
    if (!/^[a-z0-9]/.test(u)) return "Start with a letter or number";
    if (!/^[a-z0-9_-]+$/.test(u)) return "Only lowercase letters, numbers, - and _";
    if (RESERVED.has(u)) return "That name is reserved, try another";
    return "";
  }
  // "+880 1700-000000" / "8801700000000" / "০১৭০০০০০০০০" -> "01700000000"
  function normalizePhone(s) {
    var d = bnToEn(s).replace(/\D/g, "");
    if (d.length === 13 && d.indexOf("880") === 0) d = "0" + d.slice(3);
    else if (d.length === 10 && d.charAt(0) === "1") d = "0" + d;
    return d;
  }
  var PHONE_RE = /^01[3-9]\d{8}$/;
  function showPhone(n) {
    return /^\d{11}$/.test(n) ? n.slice(0, 5) + " " + n.slice(5) : n;
  }
  function debounce(fn, ms) {
    var t = 0;
    return function () {
      var a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  }
  function pageUrl(username) {
    return location.origin + "/" + username;
  }

  /* ---------------- QR drawing (uses the vendored qrcode-generator) ---------------- */

  function qrMatrix(text) {
    var q = window.qrcode(0, "M");
    q.addData(text);
    q.make();
    return { n: q.getModuleCount(), dark: function (r, c) { return q.isDark(r, c); } };
  }

  // Crisp SVG: horizontal runs of dark modules merged into single rectangles.
  function qrSvg(text, margin) {
    margin = margin == null ? 4 : margin;
    var m = qrMatrix(text), size = m.n + margin * 2, d = "", r, c, start;
    for (r = 0; r < m.n; r++) {
      start = -1;
      for (c = 0; c <= m.n; c++) {
        var on = c < m.n && m.dark(r, c);
        if (on && start < 0) start = c;
        if (!on && start >= 0) {
          d += "M" + (start + margin) + " " + (r + margin) + "h" + (c - start) + "v1h-" + (c - start) + "z";
          start = -1;
        }
      }
    }
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + size + " " + size);
    svg.setAttribute("shape-rendering", "crispEdges");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "QR code");
    var bg = document.createElementNS(NS, "rect");
    bg.setAttribute("width", size);
    bg.setAttribute("height", size);
    bg.setAttribute("fill", "#fff");
    var p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", "#000");
    svg.appendChild(bg);
    svg.appendChild(p);
    return svg;
  }

  // PNG with whole-pixel modules (no blur) and a proper quiet zone.
  function qrPng(text, target) {
    var margin = 4, m = qrMatrix(text), total = m.n + margin * 2;
    var k = Math.max(4, Math.floor((target || 1000) / total)), side = total * k;
    var cv = document.createElement("canvas");
    cv.width = cv.height = side;
    var g = cv.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, side, side);
    g.fillStyle = "#000";
    for (var r = 0; r < m.n; r++) for (var c = 0; c < m.n; c++) if (m.dark(r, c)) g.fillRect((c + margin) * k, (r + margin) * k, k, k);
    return new Promise(function (res) { cv.toBlob(res, "image/png"); });
  }

  // On phones this opens the share sheet (which has "Save Image"); elsewhere it downloads.
  function saveImage(blob, filename) {
    var file = typeof File === "function" ? new File([blob], filename, { type: "image/png" }) : null;
    var touch = window.matchMedia && matchMedia("(pointer: coarse)").matches;
    var viaShare = touch && file && navigator.canShare && navigator.canShare({ files: [file] });
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

  window.Deshi = {
    cfg: cfg, configured: configured, client: client, checkBackend: checkBackend, RESERVED: RESERVED,
    h: h, fill: fill, icon: icon, toast: toast, copyText: copyText,
    taka: taka, bnToEn: bnToEn, monogram: monogram, slugify: slugify, usernameError: usernameError,
    normalizePhone: normalizePhone, PHONE_RE: PHONE_RE, showPhone: showPhone, debounce: debounce, pageUrl: pageUrl,
    qrSvg: qrSvg, qrPng: qrPng, saveImage: saveImage
  };
})();
