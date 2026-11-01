/* Public payment page: /<username>. Loads one page through get_public_page() and renders it. */
(function () {
  "use strict";
  var T = window.Deshi, h = T.h, icon = T.icon;
  var root = document.getElementById("root");

  function state(title, text, actions) {
    root.replaceChildren(h("div", { class: "pv-state" },
      h("a", { class: "brand", href: "/" }, h("i"), "DeshiPay"),
      h("h1", null, title),
      h("p", null, text),
      actions
    ));
  }

  function loading() {
    root.replaceChildren(h("div", { class: "pv" }, h("div", { class: "pv-in" },
      h("div", { class: "pv-head" }, h("div", { class: "skel", style: "height:56px;width:70%" }), h("div", { class: "skel", style: "height:20px;width:50%" })),
      h("div", { class: "pv-card" }, h("div", { class: "skel", style: "height:420px;border-radius:24px" }))
    )));
  }

  function fixedAmount() {
    var raw = new URLSearchParams(location.search).get("amount");
    if (!raw) return 0;
    var n = parseFloat(window.DeshiQR.sanitizeAmount(raw));
    return n > 0 && n <= window.DeshiQR.MAX_AMOUNT ? n : 0;
  }

  // A standalone export (see export.js) embeds its page data and has no
  // Supabase/config.js at all: render it straight away, then stop.
  if (window.DESHIQR_PAGE) {
    var embedded = window.DESHIQR_PAGE;
    document.documentElement.setAttribute("data-theme", embedded.theme || "emerald");
    document.title = "Pay " + embedded.title;
    var embeddedBg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    var embeddedMeta = document.querySelector('meta[name="theme-color"]');
    if (embeddedMeta && embeddedBg) embeddedMeta.setAttribute("content", embeddedBg);
    window.PayView.mount(root, embedded, {
      fixedAmount: fixedAmount(),
      footerHref: window.DESHIQR_FOOTER_HREF || "/",
      hideHandle: true
    });
    return;
  }

  var seg = decodeURIComponent((location.pathname.split("/").filter(Boolean)[0] || "")).toLowerCase();
  var sb = T.client();

  // Is the backend healthy? A paused/unreachable project can't serve a page, so
  // say that plainly instead of blaming the visitor's connection. Older cached
  // copies of common.js have no probe: fall back to the previous behaviour.
  function probe(force) {
    if (typeof T.checkBackend !== "function") {
      return Promise.resolve({ configured: !!T.configured, online: !!sb, reason: T.configured ? "online" : "not-configured", status: null });
    }
    return T.checkBackend(force ? { force: true } : undefined).catch(function () {
      return { configured: !!T.configured, online: false, reason: "unreachable", status: null };
    });
  }

  function notSetUp() {
    return state("Not set up yet", "This site hasn’t been connected to its database. If you own it, see the README.");
  }

  function unavailable() {
    return state("Temporarily unavailable",
      "Sorry — payment pages can’t be loaded right now. DeshiPay is temporarily unavailable; please try again in a little while.",
      h("button", { class: "btn", type: "button", onClick: retry }, "Try again"));
  }

  function route(backend) {
    if (backend.reason === "not-configured") return notSetUp();
    if (!backend.online) return unavailable();
    return load();
  }

  // "Try again" on the unavailable state: probe fresh, then load or stay here.
  async function retry() {
    loading();
    return route(await probe(true));
  }

  async function load() {
    if (!sb) return notSetUp();
    loading();
    var res;
    try {
      res = await sb.rpc("get_public_page", { p_username: seg });
    } catch (e) {
      res = { error: e };
    }
    if (res.error) {
      // An RPC failure can be the backend pausing mid-visit; re-check once.
      var backend = await probe(true);
      if (!backend.online) return unavailable();
      return state("Couldn’t load this page", "Check your connection and try again.", h("button", { class: "btn", type: "button", onClick: load }, "Try again"));
    }
    var page = res.data;
    if (!page) {
      return state("This page doesn’t exist", "The link may be mistyped, or the owner has hidden or removed it.", h("a", { class: "btn", href: "/" }, "Make your own payment page"));
    }
    document.documentElement.setAttribute("data-theme", page.theme || "emerald");
    document.title = "Pay " + page.title;
    var bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta && bg) meta.setAttribute("content", bg);
    window.PayView.mount(root, page, { fixedAmount: fixedAmount() });
  }

  async function boot() {
    if (!seg || seg === "pay.html") return location.replace("/");
    loading();
    return route(await probe());
  }

  boot();
})();
