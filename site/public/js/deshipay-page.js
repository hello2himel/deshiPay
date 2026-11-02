/* The DeshiPay donation page: bank details + PayView, no Supabase needed. */
(function () {
  "use strict";
  var page = {
    username: "deshipay",
    title: "DeshiPay",
    message: "Support DeshiPay",
    avatar: "",
    theme: "emerald",
    presets: [],
    qr_payload: null,
    qr_name: null,
    qr_city: null,
    ref_prefix: "",
    ref_len: 0,
    wallets: [],
    banks: [{
      bank: "Dutch-Bangla Bank",
      name: "Himel Das",
      number: "1251070048232",
      branch: "Bogura",
      routing: "090100378",
      swift: "DBBLBDDH"
    }]
  };
  document.title = "Donate to DeshiPay";
  document.documentElement.setAttribute("data-theme", page.theme);
  window.PayView.mount(document.getElementById("root"), page, { footerHref: "/" });
})();
