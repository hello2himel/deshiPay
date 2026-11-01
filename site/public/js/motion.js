/* Fade sections up as they scroll in. Content stays visible without JS and
 * with reduced motion: only add the hiding class when we can animate. */
(function () {
  "use strict";
  var items = Array.prototype.slice.call(document.querySelectorAll("[data-reveal]"));
  if (!items.length || !("IntersectionObserver" in window)) return;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reduce && reduce.matches) return;
  document.documentElement.classList.add("motion-ready");
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-in");
      io.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -10% 0px", threshold: 0.08 });
  items.forEach(function (el, i) {
    el.style.transitionDelay = (i % 3) * 70 + "ms";
    io.observe(el);
  });
})();
