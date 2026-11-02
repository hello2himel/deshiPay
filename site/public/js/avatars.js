/* Avatar icon set. Users pick one in the editor; the customer page renders it
 * in the avatar tile instead of the monogram. Pure data, no I/O. */
(function () {
  "use strict";

  var ICONS = [
    ["shop", "Shop", '<path d="M4 9.5 5.5 4.5h13L20 9.5M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M5.5 12.5V20h13v-7.5"/>'],
    ["bag", "Shopping bag", '<path d="M6 8h12l1 12H5zM9 8V6a3 3 0 0 1 6 0v2"/>'],
    ["basket", "Basket", '<path d="M4 10h16l-2 9H6zM8 10l2-7M16 10l-2-7"/>'],
    ["cart", "Cart", '<path d="M3 5h2l2.5 10h10L20 8H6"/><circle cx="9.5" cy="18.5" r="1.4"/><circle cx="17" cy="18.5" r="1.4"/>'],
    ["gift", "Gift", '<path d="M4 10h16v10H4zM12 10v10M4 10l2-4h4l2 4 2-4h4l2 4"/>'],
    ["heart", "Heart", '<path d="M12 20s-7-4.5-7-9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7 3.5c0 5-7 9.5-7 9.5z"/>'],
    ["star", "Star", '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'],
    ["coffee", "Coffee", '<path d="M4 8h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 9h2a3 3 0 0 1 0 6h-2M7 4v2M11 4v2"/>'],
    ["cup", "Cup", '<path d="M5 8h12v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM17 9h2a2.5 2.5 0 0 1 0 5h-2M8 20h8"/>'],
    ["food", "Food", '<path d="M4 11h16a8 8 0 0 1-16 0M8 6c0-1 1-1 1-2M12 6c0-1 1-1 1-2M16 6c0-1 1-1 1-2"/>'],
    ["cake", "Cake", '<path d="M5 12h14v8H5zM5 12c1.5 0 1.5 2 3 2s1.5-2 3-2 1.5 2 3 2 1.5-2 3-2 1.5 2 3 2M8 12V9h8v3M12 6V4"/>'],
    ["camera", "Camera", '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.2-2h6.6l1.2 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.4"/>'],
    ["music", "Music", '<path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="16" r="2"/>'],
    ["mic", "Microphone", '<path d="M12 4a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v3M9 20h6"/>'],
    ["palette", "Palette", '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.1 0 1.9-.8 1.9-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a3.8 3.8 0 0 0 3.8-3.8C20.8 6.9 17 3.5 12 3.5z"/><circle cx="7.6" cy="11" r="1"/><circle cx="10.2" cy="7.4" r="1"/><circle cx="14.6" cy="7.4" r="1"/>'],
    ["brush", "Brush", '<path d="M4 20c0-3 2-4 4-4l9-9 3 3-9 9c0 2-1 4-4 4z"/>'],
    ["scissors", "Scissors", '<path d="m6 6 12 12M18 6 6 18"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>'],
    ["tools", "Tools", '<path d="M14 4a4 4 0 0 0-5 5l-5 5a2 2 0 0 0 3 3l5-5a4 4 0 0 0 5-5l-3 3-3-3z"/>'],
    ["leaf", "Leaf", '<path d="M5 19c0-8 5-14 14-14 0 9-6 14-14 14zM5 19l8-8"/>'],
    ["flower", "Flower", '<circle cx="12" cy="12" r="2.5"/><path d="M12 9c0-3 2-5 4-5s2 2 0 4M15 12c3 0 5 2 5 4s-2 2-4 0M12 15c0 3-2 5-4 5s-2-2 0-4M9 12c-3 0-5-2-5-4s2-2 4 0"/>'],
    ["book", "Book", '<path d="M5 5a2 2 0 0 1 2-2h12v16H7a2 2 0 0 0-2 2zM5 5v16"/>'],
    ["pencil", "Pencil", '<path d="m14 5 5 5-9 9-5 1 1-5zM12 7l5 5"/>'],
    ["laptop", "Laptop", '<path d="M5 5h14v10H5zM3 18h18M9 15h6"/>'],
    ["phone", "Phone", '<path d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM11 18h2"/>'],
    ["globe", "Globe", '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18"/>'],
    ["home", "Home", '<path d="m4 11 8-7 8 7v9H4zM10 20v-6h4v6"/>'],
    ["key", "Key", '<circle cx="8" cy="15" r="3"/><path d="m10 13 9-9 2 2-2 2 2 2-3 3-2-2-2 2"/>'],
    ["award", "Award", '<circle cx="12" cy="9" r="5"/><path d="M8.5 13 7 21l5-3 5 3-1.5-8"/>'],
    ["tag", "Tag", '<path d="M4 12 12 4h8v8l-8 8z"/><circle cx="16" cy="8" r="1"/>'],
    ["ticket", "Ticket", '<path d="M4 8h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4zM9 8v8"/>'],
    ["truck", "Truck", '<path d="M3 7h11v10H3zM14 11h4l3 3v3h-7"/><circle cx="7" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>'],
    ["bike", "Bike", '<circle cx="6" cy="15" r="3"/><circle cx="18" cy="15" r="3"/><path d="m8 15 4-6h3l3 6M10 9h5"/>'],
    ["car", "Car", '<path d="M5 16h14v-4l-2-4H7l-2 4zM5 16v3M19 16v3M8 12h8"/>'],
    ["building", "Building", '<path d="M5 21V5h9v16M14 9h5v12M9 8h.01M9 12h.01M9 16h.01"/>'],
    ["shirt", "Shirt", '<path d="M8 4 5 7l2 3 2-1v8h6v-8l2 1 2-3-3-3-2 2h-2z"/>'],
    ["gem", "Gem", '<path d="M6 4h12l3 5-9 11L3 9zM3 9h18M9 4l3 16M15 4l-3 16"/>'],
    ["moon", "Moon", '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z"/>'],
    ["sun", "Sun", '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'],
    ["atom", "Atom", '<circle cx="12" cy="12" r="1.6"/><ellipse cx="12" cy="12" rx="9" ry="3.8"/><ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(120 12 12)"/>', "STEM"],
    ["flask", "Flask", '<path d="M9 3h6M10 3v6l-6 9.5A2 2 0 0 0 5.7 21h12.6a2 2 0 0 0 1.7-3L14 9V3"/><path d="M7.5 15h9"/>', "STEM"],
    ["dna", "DNA", '<path d="M7 3c0 6 10 6 10 12s-10 6-10 6M17 3c0 6-10 6-10 12s10 6 10 6"/><path d="M8.5 7h7M8.5 11h7M8.5 15h7"/>', "STEM"],
    ["chip", "Circuit chip", '<rect x="7" y="7" width="10" height="10" rx="2"/><rect x="10" y="10" width="4" height="4" rx=".8"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>', "STEM"],
    ["sigma", "Sigma", '<path d="M7 4h10l-6 8 6 8H7"/>', "STEM"],
    ["magnet", "Magnet", '<path d="M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4z"/><path d="M6 8h4M14 8h4"/>', "Physics"],
    ["wave", "Wave", '<path d="M3 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0"/>', "Physics"],
    ["planet", "Planet", '<circle cx="12" cy="12" r="5.5"/><ellipse cx="12" cy="12" rx="10" ry="3.5" transform="rotate(-18 12 12)"/>', "Space"],
    ["telescope", "Telescope", '<path d="M4 20l6-5M13 4l7 3-8 8-4-4zM9 15l-1.5 3M16 8l3 1.5"/><path d="M17 13l2 1"/>', "Space"],
    ["comet", "Comet", '<circle cx="8" cy="16" r="3"/><path d="M11 13l7-7M13 17l7-4M9 12l6-8"/>', "Space"]
  ];

  var NS = "http://www.w3.org/2000/svg";
  var LIST = ICONS.map(function (item) { return { id: item[0], label: item[1], group: item[3] || "" }; });
  var byId = {};
  ICONS.forEach(function (item) { byId[item[0]] = item; });

  function avatar(id, cls) {
    var item = byId[id];
    if (!item) return null;
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", cls || "ic");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = item[2]; // static, trusted path table
    return svg;
  }

  Object.assign(window.Deshi, {
    AVATARS: LIST,
    avatar: avatar,
    avatarLabel: function (id) { return byId[id] ? byId[id][1] : ""; }
  });
})();
