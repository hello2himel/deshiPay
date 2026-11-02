# Promotionals

Launch assets for DeshiPay, with editable source files.

## Video

| File | What it is |
|---|---|
| `video/deshipay-promo.mp4` | 52s English promo, 1920×1080, 30fps, music only, no voiceover |
| `video/deshipay-promo-bn.mp4` | 52s Bangla edition, same edit and music |
| `video/cover.jpg` / `video/cover-bn.jpg` | End-card thumbnails |
| `video/marketing-plan.md` | Storyboard, copy and production notes |

Editable source is in `video/source/`:

- `promo.html` / `promo-bn.html`: the full motion timeline
- `render.js` / `render-bn.js`: deterministic Puppeteer frame renderer
- `audio.py`: synthesised soundtrack source
- `music.wav`: rendered 52s soundtrack
- `stills.js`: keyframe helper

Regenerate:

```bash
cd promotionals/video/source
npm i puppeteer-core                     # or set PUPPETEER to an existing install
CHROME=/path/to/chrome node render.js      # English frames/
CHROME=/path/to/chrome node render-bn.js   # Bangla frames-bn/
ffmpeg -framerate 30 -i frames/f%04d.jpg -i music.wav \
  -af "loudnorm=I=-17:TP=-1.5:LRA=7" \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -shortest deshipay-promo.mp4
```

The HTML source expects the site's vendored assets at `../../../site/public/` and uses the system **Noto Sans Bengali** for the Bangla cut.

## Social carousel

`social/` contains the six 1080×1080 Instagram/Facebook images:

1. `slide-1.png` — Bangla message-bubble hook
2. `slide-2.png` — One link / every payment method
3. `slide-3.png` — payment methods and preferred account
4. `slide-4.png` — one page, straight through
5. `slide-5.png` — no commission / no fees / no charge
6. `slide-6.png` — open source / free / secure

Also included: `carousel-preview.png` and `captions.md` (caption, hashtags, alt text).

Source is in `social/source/`:

- `social.html` — the six slides and their runtime icon/QR setup
- `render.js` — Puppeteer screenshot script
- `fonts/HindSiliguri-Bold.ttf` + `fonts/OFL.txt` — Bangla typeface and its license

Regenerate:

```bash
cd promotionals/social/source
PUPPETEER=/path/to/puppeteer-core CHROME=/path/to/chrome node render.js
# writes slide-1.png … slide-6.png into this source directory
```

## Licensing and marks

The repository's original code and source files are licensed under **AGPL-3.0-only** (see the root `LICENSE`). Rendered promotional media is © Himel Das and is included to promote DeshiPay.

Vendored libraries, fonts and provider marks keep their own terms:

- Hind Siliguri: SIL Open Font License, see `social/source/fonts/OFL.txt`
- Remix Icon: Apache-2.0, see the root `THIRD_PARTY_LICENSES/remixicon.txt`
- bKash, Nagad, Rocket, upay, Citytouch, BRAC Bank Astha, EBL Skybanking, MTB Neo and other provider marks are trademarks of their owners. They are used descriptively to show app compatibility; no endorsement is implied and they are not covered by the AGPL grant.
