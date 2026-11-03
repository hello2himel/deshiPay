/* Homepage-only sample page.
 *
 * This is deliberately fake: DEMO SHOP, 01700000000, Demo Bank and a synthetic
 * Bangla QR. It is shown behind a "Demo QR" cover on the landing page and never
 * talks to Supabase. The real donation page (/deshipay) uses deshipay-data.js.
 */
window.DEMO_PAGE = {
  username: "demo-shop",
  title: "Demo Shop",
  message: "Sample page only. No payment is collected here.",
  avatar: "",
  theme: "emerald",
  presets: [100, 500, 1000],
  qr_payload: "00020101021126450014bd.org.bb.npsb0102020202040311017000000005204601653030505802BD5909DEMO SHOP6005Dhaka62060602FT8012DEMO/TOKEN==6304527A",
  qr_name: "DEMO SHOP",
  qr_city: "Dhaka",
  ref_prefix: "",
  ref_len: 0,
  wallets: [
    { provider: "bkash", type: "personal", number: "01700000000" },
    { provider: "nagad", type: "personal", number: "01700000000" }
  ],
  banks: [{
    bank: "Demo Bank",
    name: "DEMO ACCOUNT",
    number: "0000000000",
    branch: "Demo Branch",
    routing: "000000000",
    swift: "DEMOBDDH"
  }]
};
