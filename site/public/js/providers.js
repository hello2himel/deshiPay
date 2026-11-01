/* Mobile wallets, wallet account types, banks, and the colour themes users can pick. */
(function () {
  "use strict";

  // Colours are decorative monogram tiles, not logos.
  var WALLETS = [
    { id: "bkash", name: "bKash", color: "#E2136E" },
    { id: "nagad", name: "Nagad", color: "#D9481B" },
    { id: "rocket", name: "Rocket", color: "#8A2F8F" },
    { id: "upay", name: "Upay", color: "#23913F" },
    { id: "tap", name: "Tap", color: "#1E78C9" },
    { id: "mcash", name: "mCash", color: "#00796B" },
    { id: "okwallet", name: "OK Wallet", color: "#C62828" },
    { id: "surecash", name: "SureCash", color: "#4A56B5" },
    { id: "mycash", name: "MyCash", color: "#7A5240" },
    { id: "pathaopay", name: "Pathao Pay", color: "#C2410C" },
    { id: "other", name: "Other wallet", color: "#5B5568" }
  ];

  // "Send Money" is the normal way to pay a personal number; agents are "Cash Out"; merchants are "Payment".
  var WALLET_TYPES = [
    { id: "personal", name: "Personal", action: "Send Money" },
    { id: "merchant", name: "Merchant", action: "Payment" },
    { id: "agent", name: "Agent", action: "Cash Out" }
  ];

  var BANKS = [
    "AB Bank", "Agrani Bank", "Al-Arafah Islami Bank", "Bangladesh Commerce Bank", "Bangladesh Development Bank",
    "Bank Asia", "BRAC Bank", "City Bank", "Citizens Bank", "Community Bank Bangladesh", "Dhaka Bank",
    "Dutch-Bangla Bank", "Eastern Bank (EBL)", "EXIM Bank", "First Security Islami Bank", "Global Islami Bank",
    "HSBC", "ICB Islamic Bank", "IFIC Bank", "Islami Bank Bangladesh", "Jamuna Bank", "Janata Bank",
    "Meghna Bank", "Mercantile Bank", "Midland Bank", "Modhumoti Bank", "Mutual Trust Bank", "NCC Bank",
    "NRB Bank", "National Bank", "One Bank", "Padma Bank", "Premier Bank", "Prime Bank", "Pubali Bank",
    "Rajshahi Krishi Unnayan Bank", "Rupali Bank", "Shahjalal Islami Bank", "Social Islami Bank",
    "Sonali Bank", "South Bangla Agriculture & Commerce Bank", "Southeast Bank", "Standard Bank",
    "Standard Chartered", "Trust Bank", "Union Bank", "United Commercial Bank (UCB)", "Uttara Bank"
  ];

  var THEMES = [
    { id: "rose", name: "Rose", color: "#E2136E" },
    { id: "crimson", name: "Crimson", color: "#C62432" },
    { id: "amber", name: "Amber", color: "#B45309" },
    { id: "coffee", name: "Coffee", color: "#7C4A2D" },
    { id: "olive", name: "Olive", color: "#4D7C0F" },
    { id: "emerald", name: "Emerald", color: "#0B7F58" },
    { id: "teal", name: "Teal", color: "#0F766E" },
    { id: "ocean", name: "Ocean", color: "#1D5FD0" },
    { id: "violet", name: "Violet", color: "#6D3FD9" },
    { id: "graphite", name: "Graphite", color: "#2E3A4B" }
  ];

  function by(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[list.length - 1];
  }

  Object.assign(window.Deshi, {
    WALLETS: WALLETS,
    WALLET_TYPES: WALLET_TYPES,
    BANKS: BANKS,
    THEMES: THEMES,
    wallet: function (id) { return by(WALLETS, id); },
    walletType: function (id) { return by(WALLET_TYPES, id); },
    themeIds: THEMES.map(function (t) { return t.id; })
  });
})();
