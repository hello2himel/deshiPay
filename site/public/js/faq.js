/* Height animation for the landing FAQ <details>. Native toggling is skipped
 * only when animation is possible; without JS or with reduced motion, the
 * browser's normal open/close behaviour is untouched. */
(function () {
  "use strict";
  if (!window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var DURATION = 220;
  var EASE = "cubic-bezier(.2,.7,.2,1)";
  Array.prototype.forEach.call(document.querySelectorAll(".faq details"), function (details) {
    var summary = details.querySelector("summary");
    var answer = details.querySelector(".faq-answer");
    if (!summary || !answer) return;
    var animating = false;
    summary.addEventListener("click", function (event) {
      event.preventDefault();
      if (animating) return;
      animating = true;
      if (details.open) {
        answer.style.overflow = "hidden";
        answer.style.height = answer.scrollHeight + "px";
        answer.offsetHeight; // commit the start height
        answer.style.transition = "height " + DURATION + "ms " + EASE + ", opacity " + DURATION + "ms " + EASE;
        answer.style.height = "0px";
        answer.style.opacity = "0";
        setTimeout(function () {
          details.open = false;
          answer.style.cssText = "";
          animating = false;
        }, DURATION);
      } else {
        details.open = true;
        answer.style.overflow = "hidden";
        answer.style.height = "0px";
        answer.style.opacity = "0";
        var height = answer.scrollHeight;
        answer.style.transition = "height " + DURATION + "ms " + EASE + ", opacity " + DURATION + "ms " + EASE;
        answer.style.height = height + "px";
        answer.style.opacity = "1";
        setTimeout(function () {
          answer.style.cssText = "";
          animating = false;
        }, DURATION);
      }
    });
  });
})();
