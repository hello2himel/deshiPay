/* The DeshiPay donation page: shared data + PayView, no Supabase needed. */
(function () {
  "use strict";
  var page = window.DESHIPAY_PAGE;
  if (!page || !window.PayView) return;
  document.title = "Donate to DeshiPay";
  document.documentElement.setAttribute("data-theme", page.theme || "emerald");
  window.PayView.mount(document.getElementById("root"), page, { footerHref: "/" });
})();
