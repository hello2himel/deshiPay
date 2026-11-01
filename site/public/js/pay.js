/* Public payment page: /<username>. Loads one page through get_public_page() and renders it. */
(function () {
  "use strict";
  var T = window.Deshi, h = T.h, icon = T.icon;
  var root = document.getElementById("root");

  var seg = decodeURIComponent((location.pathname.split("/").filter(Boolean)[0] || "")).toLowerCase();
  var sb = T.client();

  function state(title, text, actions) {
    root.replaceChildren(h("div", { class: "pv-state" },
      h("a", { class: "brand", href: "/" }, h("i"), "DeshiQR"),
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

  async function load() {
    if (!seg || seg === "pay.html") return location.replace("/");
    if (!sb) return state("Not set up yet", "This site hasn’t been connected to its database. If you own it, see the README.");
    loading();
    var res;
    try {
      res = await sb.rpc("get_public_page", { p_username: seg });
    } catch (e) {
      res = { error: e };
    }
    if (res.error) {
      return state("Couldn’t load this page", "Check your connection and try again.", h("button", { class: "btn", type: "button", onClick: load }, "Try again"));
    }
    var page = res.data;
    if (!page) {
      return state("This page doesn’t exist", "The link may be mistyped, or the owner has hidden or removed it.", h("a", { class: "btn", href: "/" }, "Make your own payment page"));
    }
    document.documentElement.setAttribute("data-theme", page.theme || "rose");
    document.title = "Pay " + page.title;
    var bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta && bg) meta.setAttribute("content", bg);
    window.PayView.mount(root, page, { fixedAmount: fixedAmount() });
  }

  load();
})();
