# DeshiPay — 52s intro promo

## 1. Cleaned founder story

Getting paid in Bangladesh is needlessly messy. If you run a donation campaign, or you are a small creator, business owner or artist, you have to list every payment method you accept: bKash, Nagad, Rocket, bank transfer, cards, and so on. It is messy for both sides, the person paying and the person receiving.

Some people work around it with a payment gateway, but gateways charge a fee on every transaction and have a steep entry barrier. Popular gateways in Bangladesh can require thousands of taka upfront, plus renewal fees, transaction fees and processing fees. A donation campaign cannot afford that just for a payment gateway, and neither can a small creator or business.

That is why I built DeshiPay: one page with your Bangla QR, wallet and bank details, so customers can pay directly from their own app. No gateway, no commission, no cut. As digital payments keep growing, this can serve a real purpose.

## 2. Positioning

For Bangladesh's creators, causes and small businesses, DeshiPay is one payment page for a merchant's Bangla QR, wallet and bank details. Customers pay them directly. DeshiPay takes no commission or cut. It is not a payment processor.

**Tagline used:** One link. No cut.

**Alternate:** Your page. Your QR. Paid direct.

## 3. Audience

- Donation and campaign organisers who cannot justify gateway setup costs.
- Small creators and artists taking tips or support.
- Small businesses and freelancers who already use a Bangla QR.
- Payers who just want one clear page instead of a list of numbers.

## 4. Storyboard (1920x1080, 30 fps, 52 s)

| Time | Scene | On-screen copy | Visual / motion |
|---|---|---|---|
| 0.0–5.2 | Hook | "Still juggling six payment methods?" / "There is a better way to get paid." | Six plain method chips settle around a deep-green field; headline types slowly and holds. |
| 4.8–11.8 | The old way | "You list every method. They still ask." / "Every campaign, creator, artist and shop repeats the same replies." | Demo chat thread with four messages; bubbles settle one by one and hold. |
| 11.4–18.2 | The gateway tax | "Gateways can help. The costs add up." / "Popular gateways add upfront, renewal, transaction and processing fees." | Oversized editorial fee lines (01 Upfront, 02 Renewal, 03 Transaction, 04 Processing) on a dark field; big statement line follows. |
| 17.8–24.8 | So I built DeshiPay | "So I built DeshiPay." / "One page for your Bangla QR, wallet and bank details, without a gateway." | Brand mark and enlarged phone customer page; holds for the viewer to read. |
| 24.4–33.0 | Pay your way | "Scan. Or copy. Paid directly to you." / "QR, wallet or bank. The whole page in one link." | A tabbed phone shows QR, then Wallet (demo bKash/Nagad + amount), then Bank (demo account, routing, SWIFT), with a large changing 01/02/03 caption. |
| 32.4–39.2 | Pay with any app | "They pay with the app they already use." / "You receive it in your wallet or bank account." | All supported MFS and bank-app icons grouped in a large cloud, plus “or any other app that supports Bangla QR”; flow resolves into "Your bKash, Nagad or Rocket / Your bank account". |
| 38.6–44.0 | Direct to you | "No gateway. / No cut. / No commission from us." / "DeshiPay only hosts the page. The money never passes through us." / "Normal payment-app charges may still apply." | Three-line reveal with a hold; direct path from customer to bank; readable disclosure. |
| 43.4–47.8 | Built to share | "One link. Edit, download, print." / "Update it whenever you need. Share it anywhere." | Editorial list (edit, download, print, share) with an oversized tilted A5 poster and a link strip; no browser dashboard. |
| 47.4–52.0 | CTA / end card | "Create your page." / "One link. No cut." / `deshipay.netlify.app` / "bKash · Nagad · Rocket · upay and any bank app." | Split end card: brand, headline, large URL line, supported app-icon row and “you receive it in your bKash, Nagad, Rocket or bank account” message on the left; tilted A5 SCAN TO PAY poster with sample QR on the right; soft glow and brand watermark; hold. |


## 5. Production notes

- **Voice:** none. All narration is burned-in text; the video is fully readable muted.
- **Music:** original synthesized bed (120 BPM, A minor, soft pads, plucks and light percussion), generated in `audio.py`; no samples, no lyrics, no voice.
- **No keyboard/typewriter sound effects.** The soundtrack is music only; text animation stays visual.
- **Visuals:** all UI and motion built from the DeshiPay brand and product surfaces; no stock footage, no payment-app logos, no testimonials.
- **QR:** clearly labelled SAMPLE QR; it is not live payment data.
- **Claims:** no gateway/cut/commission claim is about DeshiPay; normal payment-app charges are stated explicitly.
- **Accessibility:** high-contrast text, large display type, no flashing, disclosure on screen for over two seconds.

## 6. Deliverables

- `deshipay-promo.mp4`: H.264, 1920x1080, 30 fps, 52.0 s, AAC stereo, no voiceover.
- `cover.jpg`: end-card thumbnail.
- `promo.html`: self-contained motion source and timeline.
- `render.js`: deterministic frame renderer.
- `audio.py`: synthesized soundtrack source.

## 7. Editions

- `deshipay-promo.mp4` — English edition, 52 s.
- `deshipay-promo-bn.mp4` — Bangla edition, 52 s, same edit and music, translated copy set in Noto Sans Bengali.
- `cover.jpg` / `cover-bn.jpg` — matching end-card thumbnails.
