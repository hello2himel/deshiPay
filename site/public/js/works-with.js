/* Renders the "Works with ... and any bank app" strip from pay-icons.js. */
(function () {
  "use strict";
  function render() {
    var L = window.DeshiPayIcons;
    if (!L) return;
    var bare = { "Bangla QR": 1 };
    var items = L.mfs.concat([L.banglaqr]);
    Array.prototype.forEach.call(document.querySelectorAll("[data-works-with]"), function (host) {
      var apps = document.createElement("span");
      apps.className = "works-with-apps";
      items.forEach(function (it) {
        var tile = document.createElement("span");
        tile.className = "works-with-app" + (bare[it.name] ? " bare" : "");
        tile.title = it.name;
        var img = document.createElement("img");
        img.src = it.src; img.alt = it.name; img.loading = "lazy";
        tile.appendChild(img); apps.appendChild(tile);
      });
      var inner = document.createElement("span");
      inner.className = "works-with-inner";
      var label = document.createElement("span");
      label.className = "works-with-label"; label.textContent = "Works with";
      var any = document.createElement("span");
      any.textContent = "and any bank app";
      inner.appendChild(label); inner.appendChild(apps); inner.appendChild(any);
      host.replaceChildren(inner);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})();
