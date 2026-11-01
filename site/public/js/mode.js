/* Apply the visitor's saved light/dark choice before first paint. */
(function () {
  "use strict";
  try {
    var mode = localStorage.getItem("deshipay.mode");
    if (mode === "light" || mode === "dark") document.documentElement.setAttribute("data-mode", mode);
  } catch (e) { /* storage disabled: follow the system preference */ }
})();
