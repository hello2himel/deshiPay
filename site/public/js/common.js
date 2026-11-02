/* Shared helpers for every page: DOM builder, icons, toast, clipboard, QR drawing, Supabase client. */
(function () {
  "use strict";

  var cfg = window.DESHIPAY_CONFIG || window.DESHIQR_CONFIG || {};
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
  // Remix Icon (Apache-2.0): path data embedded from remixicon 4.9.1.
  // See THIRD_PARTY_LICENSES/remixicon.txt for the license.
  var ICONS = {
    qr: "<path d=\"M16 17V16H13V13H16V15H18V17H17V19H15V21H13V18H15V17H16ZM21 21H17V19H19V17H21V21ZM3 3H11V11H3V3ZM5 5V9H9V5H5ZM13 3H21V11H13V3ZM15 5V9H19V5H15ZM3 13H11V21H3V13ZM5 15V19H9V15H5ZM18 13H21V15H18V13ZM6 6H8V8H6V6ZM6 16H8V18H6V16ZM16 6H18V8H16V6Z\"/>",
    wallet: "<path d=\"M18.0049 6.99979H21.0049C21.5572 6.99979 22.0049 7.4475 22.0049 7.99979V19.9998C22.0049 20.5521 21.5572 20.9998 21.0049 20.9998H3.00488C2.4526 20.9998 2.00488 20.5521 2.00488 19.9998V3.99979C2.00488 3.4475 2.4526 2.99979 3.00488 2.99979H18.0049V6.99979ZM4.00488 8.99979V18.9998H20.0049V8.99979H4.00488ZM4.00488 4.99979V6.99979H16.0049V4.99979H4.00488ZM15.0049 12.9998H18.0049V14.9998H15.0049V12.9998Z\"/>",
    bank: "<path d=\"M2 20H22V22H2V20ZM4 12H6V19H4V12ZM9 12H11V19H9V12ZM13 12H15V19H13V12ZM18 12H20V19H18V12ZM2 7L12 2L22 7V11H2V7ZM4 8.23607V9H20V8.23607L12 4.23607L4 8.23607ZM12 8C11.4477 8 11 7.55228 11 7C11 6.44772 11.4477 6 12 6C12.5523 6 13 6.44772 13 7C13 7.55228 12.5523 8 12 8Z\"/>",
    copy: "<path d=\"M6.9998 6V3C6.9998 2.44772 7.44752 2 7.9998 2H19.9998C20.5521 2 20.9998 2.44772 20.9998 3V17C20.9998 17.5523 20.5521 18 19.9998 18H16.9998V20.9991C16.9998 21.5519 16.5499 22 15.993 22H4.00666C3.45059 22 3 21.5554 3 20.9991L3.0026 7.00087C3.0027 6.44811 3.45264 6 4.00942 6H6.9998ZM5.00242 8L5.00019 20H14.9998V8H5.00242ZM8.9998 6H16.9998V16H18.9998V4H8.9998V6Z\"/>",
    check: "<path d=\"M9.9997 15.1709L19.1921 5.97852L20.6063 7.39273L9.9997 17.9993L3.63574 11.6354L5.04996 10.2212L9.9997 15.1709Z\"/>",
    camera: "<path d=\"M9.82843 5L7.82843 7H4V19H20V7H16.1716L14.1716 5H9.82843ZM9 3H15L17 5H21C21.5523 5 22 5.44772 22 6V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V6C2 5.44772 2.44772 5 3 5H7L9 3ZM12 18C8.96243 18 6.5 15.5376 6.5 12.5C6.5 9.46243 8.96243 7 12 7C15.0376 7 17.5 9.46243 17.5 12.5C17.5 15.5376 15.0376 18 12 18ZM12 16C13.933 16 15.5 14.433 15.5 12.5C15.5 10.567 13.933 9 12 9C10.067 9 8.5 10.567 8.5 12.5C8.5 14.433 10.067 16 12 16Z\"/>",
    image: "<path d=\"M2.9918 21C2.44405 21 2 20.5551 2 20.0066V3.9934C2 3.44476 2.45531 3 2.9918 3H21.0082C21.556 3 22 3.44495 22 3.9934V20.0066C22 20.5552 21.5447 21 21.0082 21H2.9918ZM20 15V5H4V19L14 9L20 15ZM20 17.8284L14 11.8284L6.82843 19H20V17.8284ZM8 11C6.89543 11 6 10.1046 6 9C6 7.89543 6.89543 7 8 7C9.10457 7 10 7.89543 10 9C10 10.1046 9.10457 11 8 11Z\"/>",
    scan: "<path d=\"M21 16V21H3V16H5V19H19V16H21ZM3 11H21V13H3V11ZM21 8H19V5H5V8H3V3H21V8Z\"/>",
    plus: "<path d=\"M11 11V5H13V11H19V13H13V19H11V13H5V11H11Z\"/>",
    trash: "<path d=\"M17 6H22V8H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V8H2V6H7V3C7 2.44772 7.44772 2 8 2H16C16.5523 2 17 2.44772 17 3V6ZM18 8H6V20H18V8ZM9 11H11V17H9V11ZM13 11H15V17H13V11ZM9 4V6H15V4H9Z\"/>",
    share: "<path d=\"M13.1202 17.0228L8.92129 14.7324C8.19135 15.5125 7.15261 16 6 16C3.79086 16 2 14.2091 2 12C2 9.79086 3.79086 8 6 8C7.15255 8 8.19125 8.48746 8.92118 9.26746L13.1202 6.97713C13.0417 6.66441 13 6.33707 13 6C13 3.79086 14.7909 2 17 2C19.2091 2 21 3.79086 21 6C21 8.20914 19.2091 10 17 10C15.8474 10 14.8087 9.51251 14.0787 8.73246L9.87977 11.0228C9.9583 11.3355 10 11.6629 10 12C10 12.3371 9.95831 12.6644 9.87981 12.9771L14.0788 15.2675C14.8087 14.4875 15.8474 14 17 14C19.2091 14 21 15.7909 21 18C21 20.2091 19.2091 22 17 22C14.7909 22 13 20.2091 13 18C13 17.6629 13.0417 17.3355 13.1202 17.0228ZM6 14C7.10457 14 8 13.1046 8 12C8 10.8954 7.10457 10 6 10C4.89543 10 4 10.8954 4 12C4 13.1046 4.89543 14 6 14ZM17 8C18.1046 8 19 7.10457 19 6C19 4.89543 18.1046 4 17 4C15.8954 4 15 4.89543 15 6C15 7.10457 15.8954 8 17 8ZM17 20C18.1046 20 19 19.1046 19 18C19 16.8954 18.1046 16 17 16C15.8954 16 15 16.8954 15 18C15 19.1046 15.8954 20 17 20Z\"/>",
    external: "<path d=\"M10 6V8H5V19H16V14H18V20C18 20.5523 17.5523 21 17 21H4C3.44772 21 3 20.5523 3 20V7C3 6.44772 3.44772 6 4 6H10ZM21 3V11H19L18.9999 6.413L11.2071 14.2071L9.79289 12.7929L17.5849 5H13V3H21Z\"/>",
    link: "<path d=\"M18.3638 15.5355L16.9496 14.1213L18.3638 12.7071C20.3164 10.7545 20.3164 7.58866 18.3638 5.63604C16.4112 3.68341 13.2453 3.68341 11.2927 5.63604L9.87849 7.05025L8.46428 5.63604L9.87849 4.22182C12.6122 1.48815 17.0443 1.48815 19.778 4.22182C22.5117 6.95549 22.5117 11.3876 19.778 14.1213L18.3638 15.5355ZM15.5353 18.364L14.1211 19.7782C11.3875 22.5118 6.95531 22.5118 4.22164 19.7782C1.48797 17.0445 1.48797 12.6123 4.22164 9.87868L5.63585 8.46446L7.05007 9.87868L5.63585 11.2929C3.68323 13.2455 3.68323 16.4113 5.63585 18.364C7.58847 20.3166 10.7543 20.3166 12.7069 18.364L14.1211 16.9497L15.5353 18.364ZM14.8282 7.75736L16.2425 9.17157L9.17139 16.2426L7.75717 14.8284L14.8282 7.75736Z\"/>",
    palette: "<path d=\"M12 2C17.5222 2 22 5.97778 22 10.8889C22 13.9556 19.5111 16.4444 16.4444 16.4444H14.4778C13.5556 16.4444 12.8111 17.1889 12.8111 18.1111C12.8111 18.5333 12.9778 18.9222 13.2333 19.2111C13.5 19.5111 13.6667 19.9 13.6667 20.3333C13.6667 21.2556 12.9 22 12 22C6.47778 22 2 17.5222 2 12C2 6.47778 6.47778 2 12 2ZM10.8111 18.1111C10.8111 16.0843 12.451 14.4444 14.4778 14.4444H16.4444C18.4065 14.4444 20 12.851 20 10.8889C20 7.1392 16.4677 4 12 4C7.58235 4 4 7.58235 4 12C4 16.19 7.2226 19.6285 11.324 19.9718C10.9948 19.4168 10.8111 18.7761 10.8111 18.1111ZM7.5 12C6.67157 12 6 11.3284 6 10.5C6 9.67157 6.67157 9 7.5 9C8.32843 9 9 9.67157 9 10.5C9 11.3284 8.32843 12 7.5 12ZM16.5 12C15.6716 12 15 11.3284 15 10.5C15 9.67157 15.6716 9 16.5 9C17.3284 9 18 9.67157 18 10.5C18 11.3284 17.3284 12 16.5 12ZM12 9C11.1716 9 10.5 8.32843 10.5 7.5C10.5 6.67157 11.1716 6 12 6C12.8284 6 13.5 6.67157 13.5 7.5C13.5 8.32843 12.8284 9 12 9Z\"/>",
    eye: "<path d=\"M12.0003 3C17.3924 3 21.8784 6.87976 22.8189 12C21.8784 17.1202 17.3924 21 12.0003 21C6.60812 21 2.12215 17.1202 1.18164 12C2.12215 6.87976 6.60812 3 12.0003 3ZM12.0003 19C16.2359 19 19.8603 16.052 20.7777 12C19.8603 7.94803 16.2359 5 12.0003 5C7.7646 5 4.14022 7.94803 3.22278 12C4.14022 16.052 7.7646 19 12.0003 19ZM12.0003 16.5C9.51498 16.5 7.50026 14.4853 7.50026 12C7.50026 9.51472 9.51498 7.5 12.0003 7.5C14.4855 7.5 16.5003 9.51472 16.5003 12C16.5003 14.4853 14.4855 16.5 12.0003 16.5ZM12.0003 14.5C13.381 14.5 14.5003 13.3807 14.5003 12C14.5003 10.6193 13.381 9.5 12.0003 9.5C10.6196 9.5 9.50026 10.6193 9.50026 12C9.50026 13.3807 10.6196 14.5 12.0003 14.5Z\"/>",
    eyeoff: "<path d=\"M17.8827 19.2968C16.1814 20.3755 14.1638 21.0002 12.0003 21.0002C6.60812 21.0002 2.12215 17.1204 1.18164 12.0002C1.61832 9.62282 2.81932 7.5129 4.52047 5.93457L1.39366 2.80777L2.80788 1.39355L22.6069 21.1925L21.1927 22.6068L17.8827 19.2968ZM5.9356 7.3497C4.60673 8.56015 3.6378 10.1672 3.22278 12.0002C4.14022 16.0521 7.7646 19.0002 12.0003 19.0002C13.5997 19.0002 15.112 18.5798 16.4243 17.8384L14.396 15.8101C13.7023 16.2472 12.8808 16.5002 12.0003 16.5002C9.51498 16.5002 7.50026 14.4854 7.50026 12.0002C7.50026 11.1196 7.75317 10.2981 8.19031 9.60442L5.9356 7.3497ZM12.9139 14.328L9.67246 11.0866C9.5613 11.3696 9.50026 11.6777 9.50026 12.0002C9.50026 13.3809 10.6196 14.5002 12.0003 14.5002C12.3227 14.5002 12.6309 14.4391 12.9139 14.328ZM20.8068 16.5925L19.376 15.1617C20.0319 14.2268 20.5154 13.1586 20.7777 12.0002C19.8603 7.94818 16.2359 5.00016 12.0003 5.00016C11.1544 5.00016 10.3329 5.11773 9.55249 5.33818L7.97446 3.76015C9.22127 3.26959 10.5793 3.00016 12.0003 3.00016C17.3924 3.00016 21.8784 6.87992 22.8189 12.0002C22.5067 13.6998 21.8038 15.2628 20.8068 16.5925ZM11.7229 7.50857C11.8146 7.50299 11.9071 7.50016 12.0003 7.50016C14.4855 7.50016 16.5003 9.51488 16.5003 12.0002C16.5003 12.0933 16.4974 12.1858 16.4919 12.2775L11.7229 7.50857Z\"/>",
    back: "<path d=\"M7.82843 10.9999H20V12.9999H7.82843L13.1924 18.3638L11.7782 19.778L4 11.9999L11.7782 4.22168L13.1924 5.63589L7.82843 10.9999Z\"/>",
    next: "<path d=\"M16.1716 10.9999L10.8076 5.63589L12.2218 4.22168L20 11.9999L12.2218 19.778L10.8076 18.3638L16.1716 12.9999H4V10.9999H16.1716Z\"/>",
    x: "<path d=\"M11.9997 10.5865L16.9495 5.63672L18.3637 7.05093L13.4139 12.0007L18.3637 16.9504L16.9495 18.3646L11.9997 13.4149L7.04996 18.3646L5.63574 16.9504L10.5855 12.0007L5.63574 7.05093L7.04996 5.63672L11.9997 10.5865Z\"/>",
    alert: "<path d=\"M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20ZM11 15H13V17H11V15ZM11 7H13V13H11V7Z\"/>",
    info: "<path d=\"M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20ZM11 7H13V9H11V7ZM11 11H13V17H11V11Z\"/>",
    logout: "<path d=\"M5 22C4.44772 22 4 21.5523 4 21V3C4 2.44772 4.44772 2 5 2H19C19.5523 2 20 2.44772 20 3V6H18V4H6V20H18V18H20V21C20 21.5523 19.5523 22 19 22H5ZM18 16V13H11V11H18V8L23 12L18 16Z\"/>",
    lock: "<path d=\"M19 10H20C20.5523 10 21 10.4477 21 11V21C21 21.5523 20.5523 22 20 22H4C3.44772 22 3 21.5523 3 21V11C3 10.4477 3.44772 10 4 10H5V9C5 5.13401 8.13401 2 12 2C15.866 2 19 5.13401 19 9V10ZM5 12V20H19V12H5ZM11 14H13V18H11V14ZM17 10V9C17 6.23858 14.7614 4 12 4C9.23858 4 7 6.23858 7 9V10H17Z\"/>",
    download: "<path d=\"M3 19H21V21H3V19ZM13 13.1716L19.0711 7.1005L20.4853 8.51472L12 17L3.51472 8.51472L4.92893 7.1005L11 13.1716V2H13V13.1716Z\"/>",
    shield: "<path d=\"M12 1L20.2169 2.82598C20.6745 2.92766 21 3.33347 21 3.80217V13.7889C21 15.795 19.9974 17.6684 18.3282 18.7812L12 23L5.6718 18.7812C4.00261 17.6684 3 15.795 3 13.7889V3.80217C3 3.33347 3.32553 2.92766 3.78307 2.82598L12 1ZM12 3.04879L5 4.60434V13.7889C5 15.1263 5.6684 16.3752 6.7812 17.1171L12 20.5963L17.2188 17.1171C18.3316 16.3752 19 15.1263 19 13.7889V4.60434L12 3.04879ZM16.4524 8.22183L17.8666 9.63604L11.5026 16L7.25999 11.7574L8.67421 10.3431L11.5019 13.1709L16.4524 8.22183Z\"/>",
    store: "<path d=\"M21 11.6458V21C21 21.5523 20.5523 22 20 22H4C3.44772 22 3 21.5523 3 21V11.6458C2.37764 10.9407 2 10.0144 2 9V3C2 2.44772 2.44772 2 3 2H21C21.5523 2 22 2.44772 22 3V9C22 10.0144 21.6224 10.9407 21 11.6458ZM19 12.874C18.6804 12.9562 18.3453 13 18 13C16.8053 13 15.7329 12.4762 15 11.6458C14.2671 12.4762 13.1947 13 12 13C10.8053 13 9.73294 12.4762 9 11.6458C8.26706 12.4762 7.19469 13 6 13C5.6547 13 5.31962 12.9562 5 12.874V20H19V12.874ZM14 9C14 8.44772 14.4477 8 15 8C15.5523 8 16 8.44772 16 9C16 10.1046 16.8954 11 18 11C19.1046 11 20 10.1046 20 9V4H4V9C4 10.1046 4.89543 11 6 11C7.10457 11 8 10.1046 8 9C8 8.44772 8.44772 8 9 8C9.55228 8 10 8.44772 10 9C10 10.1046 10.8954 11 12 11C13.1046 11 14 10.1046 14 9Z\"/>",
    user: "<path d=\"M4 22C4 17.5817 7.58172 14 12 14C16.4183 14 20 17.5817 20 22H18C18 18.6863 15.3137 16 12 16C8.68629 16 6 18.6863 6 22H4ZM12 13C8.685 13 6 10.315 6 7C6 3.685 8.685 1 12 1C15.315 1 18 3.685 18 7C18 10.315 15.315 13 12 13ZM12 11C14.21 11 16 9.21 16 7C16 4.79 14.21 3 12 3C9.79 3 8 4.79 8 7C8 9.21 9.79 11 12 11Z\"/>"
  };
  var MARK_D = "M42.89 35.39A12 12 0 0 0 22.4 43.87L22.4 67.6A10 10 0 0 0 32.4 77.6L56.13 77.6A12 12 0 0 0 64.61 57.11Z";
  function mark(cls) {
    var s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 100 100");
    s.setAttribute("class", "mark" + (cls ? " " + cls : ""));
    s.setAttribute("aria-hidden", "true");
    var bg = document.createElementNS(NS, "rect");
    bg.setAttribute("width", "100"); bg.setAttribute("height", "100"); bg.setAttribute("rx", "32.4");
    bg.setAttribute("class", "mark-bg");
    var fg = document.createElementNS(NS, "path");
    fg.setAttribute("d", MARK_D); fg.setAttribute("class", "mark-fg");
    s.appendChild(bg); s.appendChild(fg);
    return s;
  }
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
    h: h, fill: fill, icon: icon, mark: mark, toast: toast, copyText: copyText,
    taka: taka, bnToEn: bnToEn, monogram: monogram, slugify: slugify, usernameError: usernameError,
    normalizePhone: normalizePhone, PHONE_RE: PHONE_RE, showPhone: showPhone, debounce: debounce, pageUrl: pageUrl,
    qrSvg: qrSvg, qrPng: qrPng, saveImage: saveImage
  };
})();
