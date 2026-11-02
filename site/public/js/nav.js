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

  var SUN = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 18C8.68629 18 6 15.3137 6 12C6 8.68629 8.68629 6 12 6C15.3137 6 18 8.68629 18 12C18 15.3137 15.3137 18 12 18ZM12 16C14.2091 16 16 14.2091 16 12C16 9.79086 14.2091 8 12 8C9.79086 8 8 9.79086 8 12C8 14.2091 9.79086 16 12 16ZM11 1H13V4H11V1ZM11 20H13V23H11V20ZM3.51472 4.92893L4.92893 3.51472L7.05025 5.63604L5.63604 7.05025L3.51472 4.92893ZM16.9497 18.364L18.364 16.9497L20.4853 19.0711L19.0711 20.4853L16.9497 18.364ZM19.0711 3.51472L20.4853 4.92893L18.364 7.05025L16.9497 5.63604L19.0711 3.51472ZM5.63604 16.9497L7.05025 18.364L4.92893 20.4853L3.51472 19.0711L5.63604 16.9497ZM23 11V13H20V11H23ZM4 11V13H1V11H4Z"/></svg>';
  var MOON = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 7C10 10.866 13.134 14 17 14C18.9584 14 20.729 13.1957 21.9995 11.8995C22 11.933 22 11.9665 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C12.0335 2 12.067 2 12.1005 2.00049C10.8043 3.27098 10 5.04157 10 7ZM4 12C4 16.4183 7.58172 20 12 20C15.0583 20 17.7158 18.2839 19.062 15.7621C18.3945 15.9187 17.7035 16 17 16C12.0294 16 8 11.9706 8 7C8 6.29648 8.08133 5.60547 8.2379 4.938C5.71611 6.28423 4 8.9417 4 12Z"/></svg>';
  var toggle = document.createElement("button");
  toggle.className = "theme-toggle";
  toggle.type = "button";
  var iconBox = document.createElement("span");
  iconBox.className = "theme-ic";
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
    iconBox.innerHTML = dark ? SUN : MOON;
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
