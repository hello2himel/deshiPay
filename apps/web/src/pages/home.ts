/**
 * Landing page: what deshiQR is, a live `<deshiqr-pay>` demo, the embed snippet,
 * the provider matrix, and honest copy about what works today.
 */
import { h, icon } from "../lib/dom.ts";
import { withBase } from "../lib/base.ts";
import { DEMO_STATIC_PAYLOAD } from "../lib/demo.ts";
import type { AppContext } from "../types.ts";
import {
  codeBlock,
  demoElementAttributes,
  embedSnippet,
  featureCard,
  providerMatrix,
  sectionHeading,
} from "../ui.ts";

export function homePage(ctx: AppContext): HTMLElement {
  const base = ctx.base;

  const demoPanel = h("deshiqr-pay", {
    attrs: demoElementAttributes(),
    class: "demo-panel",
  });

  const hero = h(
    "section",
    { class: "hero container" },
    h(
      "div",
      { class: "hero-copy" },
      h(
        "p",
        { class: "eyebrow" },
        h("span", { class: "eyebrow-dot", attrs: { "aria-hidden": "true" } }),
        "Bangla QR · bKash verified today",
      ),
      h(
        "h1",
        { class: "display" },
        "Your shop's ",
        h("span", { class: "gradient-text", text: "bKash QR" }),
        ", as a link you can share.",
      ),
      h("p", {
        class: "lede",
        text: "deshiQR turns the Bangla QR printed at your counter into a pay page, a printable poster and an embeddable payment panel. No app to install. No account needed for the demo. deshiQR never holds your money.",
      }),
      h(
        "div",
        { class: "hero-actions" },
        h(
          "a",
          { class: "button button-primary", href: withBase("/new", base) },
          "Build a pay page",
          icon("arrow-right"),
        ),
        h(
          "a",
          { class: "button button-secondary", href: "#demo" },
          "See how it works",
        ),
      ),
      h(
        "ul",
        { class: "hero-stats" },
        stat("Any amount", "The payer types it, or lock it in"),
        stat("No backend", "Works as a static site"),
        stat("Public payload", "Same data as your printed QR"),
      ),
    ),
    h(
      "div",
      { class: "hero-panel" },
      h(
        "div",
        { class: "panel-caption" },
        h("span", { class: "live-dot", attrs: { "aria-hidden": "true" } }),
        h("span", { text: "Live demo — try typing an amount" }),
      ),
      demoPanel,
      h("p", {
        class: "panel-footnote",
        text: "Synthetic demo payload: account 01000000000, DEMO STORE. This is not a real shop and no money moves.",
      }),
    ),
  );

  const demoSection = h(
    "section",
    { class: "section container", attrs: { id: "demo" } },
    sectionHeading(
      "No account needed",
      "Paste a Bangla QR, share a link.",
      "The whole demo path runs in your browser: paste the payload from your own QR (or use the demo), add a title and preset amounts, and share a self-contained link. Publishing a permanent hosted page needs Supabase, and the app says so instead of pretending otherwise.",
    ),
    h(
      "div",
      { class: "split-grid" },
      h(
        "div",
        { class: "card card-pad" },
        h("h3", { class: "card-title", text: "What the demo does" }),
        h(
          "ul",
          { class: "check-list" },
          check("Validates the payload checksum and required fields with the same library the element bundles."),
          check("Derives a dynamic payload with an amount and a bill number / reference (up to 32 chars; 25 matches real bKash dynamic QRs)."),
          check("Renders the QR from the payload locally — no image service, no network call."),
          check("Downloads a QR PNG, an A4 poster, and a copy-paste embed snippet."),
          check("Shares a link like /#p=… that works on any static host with no backend."),
        ),
        h(
          "div",
          { class: "action-row" },
          h("a", { class: "button button-primary button-small", href: withBase("/new", base) }, "Try the wizard", icon("arrow-right")),
          h("a", { class: "button button-ghost button-small", href: withBase("/dashboard", base) }, "Open the demo dashboard"),
        ),
      ),
      h(
        "div",
        { class: "card card-pad" },
        h("h3", { class: "card-title", text: "Embed it anywhere" }),
        h("p", {
          class: "card-text",
          text: "The same panel you used above is a single custom element. It bundles its own payload parser and QR encoder — no CDN script dependencies at runtime beyond the element file itself.",
        }),
        codeBlock(
          embedSnippet({
            payload: DEMO_STATIC_PAYLOAD,
            title: "DEMO STORE",
            presets: [100, 500, 1000],
          }),
          { label: "index.html", copy: true },
        ),
        h("p", {
          class: "card-small",
          text: "Published as <deshiqr-pay> on npm; self-host dist/deshiqr-element.js if you prefer. The element is accessible, themed with CSS custom properties and looks after dark mode and reduced motion.",
        }),
      ),
    ),
  );

  const features = h(
    "section",
    { class: "section container" },
    sectionHeading(
      "Everything a small shop needs",
      "One QR. A few useful surfaces.",
      "Built for the counter, the phone and the website — with the same payload everywhere, so the account and tokens never change.",
    ),
    h(
      "div",
      { class: "feature-grid" },
      featureCard({
        icon: "link",
        title: "Shareable pay page",
        body: "Send a link in Messenger or SMS. The payer types the amount; the QR is generated live on their phone.",
      }),
      featureCard({
        icon: "printer",
        title: "A4 poster",
        body: "Print a clean poster with the QR, the amount, the masked account and the Bangla scan instruction. SVG or 300 dpi PNG.",
      }),
      featureCard({
        icon: "embed",
        title: "Website embed",
        body: "Drop <deshiqr-pay> into any page. Attributes control title, note, presets, theme, size and the amount lock.",
      }),
      featureCard({
        icon: "receipt",
        title: "Token-addressed invoices",
        body: "Create an order in the dashboard, share its link, and let the customer press “I have paid”. The merchant confirms manually.",
      }),
      featureCard({
        icon: "shield",
        title: "No fund custody",
        body: "Money moves inside bKash or whichever app scans the QR. deshiQR only formats the payload — it never touches the BDT.",
      }),
      featureCard({
        icon: "spark",
        title: "Works offline",
        body: "The demo path, the poster and the embed need no server. Hosted pages and accounts upgrade to Supabase when configured.",
      }),
    ),
  );

  const providers = h(
    "section",
    { class: "section container", attrs: { id: "providers" } },
    sectionHeading(
      "Provider support",
      "bKash verified today. Everything else is planned.",
      "Every deshiQR QR is a standard Bangla QR payload, so any app that accepts Bangla QR can scan it. Decoding is only claimed where we have real sample payloads pinned by tests.",
    ),
    providerMatrix(),
  );

  const how = h(
    "section",
    { class: "section container" },
    sectionHeading(
      "How it works",
      "Three steps, no account for the first two.",
      "The QR payload stays exactly as your provider issued it: same account, same name, same tokens. deshiQR only derives the amount and reference.",
    ),
    h(
      "ol",
      { class: "how-grid" },
      howStep("1", "Paste your Bangla QR", "Copy the payload from your printed QR, or upload a screenshot and let the wizard decode it in the browser with jsQR. The checksum is verified before anything else."),
      howStep("2", "Add the details", "Title, note, preset amounts, an optional locked amount and a bill-number prefix/length. A live preview shows exactly what payers will see."),
      howStep("3", "Share, print, embed", "Copy the self-contained link, download the poster, or embed the panel on your site. Publish a hosted /p/your-shop page when Supabase is configured."),
    ),
  );

  const cta = h(
    "section",
    { class: "container" },
    h(
      "div",
      { class: "cta-band" },
      h(
        "div",
        { class: "cta-copy" },
        h("h2", { class: "cta-title", text: "Make a pay page for your shop." }),
        h("p", {
          class: "cta-text",
          text: "Start from your own Bangla QR — or explore with the synthetic demo payload first. No real merchant data is used anywhere in this project.",
        }),
      ),
      h(
        "div",
        { class: "cta-actions" },
        h("a", { class: "button button-inverse", href: withBase("/new", base) }, "Create a pay page", icon("arrow-right")),
        h("a", { class: "button button-inverse-ghost", href: withBase("/dashboard", base) }, "See the dashboard"),
      ),
    ),
  );

  return h(
    "div",
    { class: "page" },
    hero,
    h(
      "div",
      { class: "container" },
      h(
        "div",
        { class: "trust-strip" },
        h("span", { class: "trust-item" }, icon("check"), "Checksum verified"),
        h("span", { class: "trust-item" }, icon("shield"), "No fund custody"),
        h("span", { class: "trust-item" }, icon("qr"), "Zero-dependency QR"),
        h("span", { class: "trust-item" }, icon("spark"), "Dark mode + reduced motion"),
      ),
    ),
    demoSection,
    features,
    providers,
    how,
    cta,
  );
}

function stat(label: string, detail: string): HTMLElement {
  return h(
    "li",
    { class: "hero-stat" },
    h("span", { class: "hero-stat-label", text: label }),
    h("span", { class: "hero-stat-detail", text: detail }),
  );
}

function check(text: string): HTMLElement {
  return h(
    "li",
    { class: "check-item" },
    h("span", { class: "check-mark" }, icon("check")),
    h("span", { text }),
  );
}

function howStep(number: string, title: string, body: string): HTMLElement {
  return h(
    "li",
    { class: "how-step" },
    h("span", { class: "step-number", text: number }),
    h("h3", { text: title }),
    h("p", { text: body }),
  );
}
