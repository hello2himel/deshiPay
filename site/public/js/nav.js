/* Mobile nav: puts the header links/actions behind a hamburger menu.
 * Desktop markup is unchanged: the menu wrapper lays them out in a row. */
(function () {
  "use strict";
  var top = document.querySelector(".top");
  if (!top) return;
  var bar = top.querySelector(".top-in");
  if (!bar || bar.querySelector(".top-menu")) return;

  var links = bar.querySelector(".top-links");
  var actions = bar.querySelector(".top-actions");
  if (!links && !actions) return;

  var menu = document.createElement("div");
  menu.className = "top-menu";
  menu.id = "topMenu";
  if (links) menu.appendChild(links);
  if (actions) menu.appendChild(actions);

  var toggle = document.createElement("button");
  toggle.className = "theme-toggle";
  toggle.type = "button";
  var iconBox = document.createElement("span");
  iconBox.className = "theme-ic moon";
  iconBox.setAttribute("aria-hidden", "true");
  var label = document.createElement("span");
  label.className = "theme-label";
  toggle.appendChild(iconBox);
  toggle.appendChild(label);
  menu.appendChild(toggle);

  var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function isDark() {
    var set = document.documentElement.getAttribute("data-mode");
    return set ? set === "dark" : !!(mq && mq.matches);
  }
  function paintToggle() {
    var dark = isDark();
    iconBox.className = "theme-ic " + (dark ? "sun" : "moon");
    label.textContent = dark ? "Light mode" : "Dark mode";
    toggle.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    toggle.setAttribute("title", dark ? "Switch to light theme" : "Switch to dark theme");
  }
  toggle.addEventListener("click", function () {
    var next = isDark() ? "light" : "dark";
    document.documentElement.setAttribute("data-mode", next);
    try { localStorage.setItem("deshipay.mode", next); } catch (e) { /* storage disabled */ }
    paintToggle();
  });
  if (mq) {
    if (mq.addEventListener) mq.addEventListener("change", paintToggle);
    else if (mq.addListener) mq.addListener(paintToggle);
  }
  paintToggle();

  var btn = document.createElement("button");
  btn.className = "nav-btn";
  btn.type = "button";
  btn.setAttribute("aria-label", "Open menu");
  btn.setAttribute("aria-controls", "topMenu");
  btn.setAttribute("aria-expanded", "false");
  for (var i = 0; i < 3; i++) btn.appendChild(document.createElement("span"));

  bar.appendChild(menu);
  bar.appendChild(btn);

  function open(on) {
    top.classList.toggle("open", on);
    btn.setAttribute("aria-expanded", String(on));
    btn.setAttribute("aria-label", on ? "Close menu" : "Open menu");
  }
  function isOpen() { return top.classList.contains("open"); }

  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    open(!isOpen());
  });
  document.addEventListener("click", function (e) {
    if (isOpen() && !e.target.closest(".top-menu, .nav-btn")) open(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isOpen()) { open(false); btn.focus(); }
  });
  menu.addEventListener("click", function (e) {
    if (e.target.closest("a, button")) open(false);
  });
})();
