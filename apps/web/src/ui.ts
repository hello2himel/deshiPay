/**
 * Shared site chrome and small reusable widgets.
 *
 * Every page composes these instead of hand-rolling markup, so the header/footer,
 * provider matrix and copy rules stay consistent (bKash verified today, other
 * providers planned — never overclaim).
 */
import { h, icon, copyText, toast, badge, type IconName, type Tone } from "./lib/dom.ts";
import { withBase } from "./lib/base.ts";
import { currentTheme, toggleTheme } from "./lib/theme.ts";
import { DEMO_STATIC_PAYLOAD } from "./lib/demo.ts";
import type { AppConfig } from "./lib/config.ts";

export interface SiteOptions {
  base: string;
  config: AppConfig;
  /** Current route path (base stripped), e.g. "/p/demo". */
  path: string;
}

const NAV_ITEMS: Array<{ href: string; label: string; match: (path: string) => boolean }> = [
  { href: "/", label: "Live demo", match: (path) => path === "/" || path.startsWith("/p/") },
  { href: "/new", label: "New pay page", match: (path) => path === "/new" },
  { href: "/dashboard", label: "Dashboard", match: (path) => path.startsWith("/dashboard") },
];

export function brandLink(base: string): HTMLAnchorElement {
  return h(
    "a",
    { class: "brand", href: withBase("/", base), attrs: { "aria-label": "deshiQR home" } },
    h("span", { class: "brand-mark", attrs: { "aria-hidden": "true" } }, icon("qr")),
    h("span", { class: "brand-name", text: "deshiQR" }),
  );
}

export function themeToggle(): HTMLButtonElement {
  const button = h(
    "button",
    {
      class: "icon-button theme-toggle",
      attrs: { type: "button", title: "Toggle dark mode", "aria-label": "Toggle dark mode" },
    },
    h("span", { class: "theme-icon theme-icon-moon" }, icon("moon")),
    h("span", { class: "theme-icon theme-icon-sun" }, icon("sun")),
  );
  button.addEventListener("click", () => {
    const theme = toggleTheme();
    toast(`Switched to ${theme} mode`, "info", 1800);
  });
  return button;
}

export function siteHeader(options: SiteOptions): HTMLElement {
  const links = NAV_ITEMS.map((item) =>
    h(
      "a",
      {
        class: `nav-link${item.match(options.path) ? " is-active" : ""}`,
        href: withBase(item.href, options.base),
        attrs: item.match(options.path) ? { "aria-current": "page" } : {},
      },
      item.label,
    ),
  );

  return h(
    "header",
    { class: "site-header" },
    h(
      "div",
      { class: "container header-inner" },
      brandLink(options.base),
      h("nav", { class: "site-nav", attrs: { "aria-label": "Main" } }, ...links),
      h(
        "div",
        { class: "header-actions" },
        themeToggle(),
        h(
          "a",
          {
            class: "button button-primary button-small header-cta",
            href: withBase("/new", options.base),
          },
          "Create a pay page",
          icon("arrow-right"),
        ),
      ),
    ),
  );
}

/** Honest banner: what works without a backend, and what needs Supabase. */
export function modeBanner(config: AppConfig): HTMLElement | null {
  if (config.mode === "supabase") return null;
  return h(
    "div",
    { class: "mode-banner", attrs: { role: "note" } },
    h(
      "div",
      { class: "container banner-inner" },
      h("span", { class: "banner-icon" }, icon("spark")),
      h(
        "p",
        { class: "banner-text" },
        h("strong", { text: "Demo mode." }),
        " Everything on this device works locally, with no account and no backend. Publishing pay pages,",
        " hosted links and invoices need Supabase configured — the demo dashboard stays in this browser.",
      ),
    ),
  );
}

export function siteFooter(options: SiteOptions): HTMLElement {
  const productLinks = [
    { href: "/", label: "Live demo" },
    { href: "/new", label: "New pay page" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/login", label: "Sign in" },
  ];
  return h(
    "footer",
    { class: "site-footer" },
    h(
      "div",
      { class: "container footer-grid" },
      h(
        "div",
        { class: "footer-brand" },
        brandLink(options.base),
        h("p", {
          class: "footer-tagline",
          text: "Turn a Bangla QR into a shareable pay page, a printable poster and an embeddable payment panel.",
        }),
        h("p", {
          class: "footer-small",
          text: "No funds are held by deshiQR. Payments happen in your bKash or wallet app.",
        }),
      ),
      h(
        "div",
        { class: "footer-col" },
        h("h2", { class: "footer-heading", text: "Product" }),
        ...productLinks.map((link) =>
          h("a", { class: "footer-link", href: withBase(link.href, options.base), text: link.label }),
        ),
      ),
      h(
        "div",
        { class: "footer-col" },
        h("h2", { class: "footer-heading", text: "Provider support" }),
        providerList(),
      ),
    ),
    h(
      "div",
      { class: "container footer-bottom" },
      h("p", {
        text: "Bangla QR · bKash verified today, more providers planned. Pay with bKash or any app that supports Bangla QR.",
      }),
      h("p", {
        class: "footer-small",
        text: "Demo data is synthetic: account 01000000000, DEMO STORE. No real merchant data is stored in this repository.",
      }),
    ),
  );
}

const PROVIDER_ROWS: Array<{ provider: string; scan: string; decode: string; note: string; tone: Tone }> = [
  {
    provider: "bKash",
    scan: "Yes",
    decode: "Verified today",
    note: "Payloads decoded against real bKash QRs; pinned by tests.",
    tone: "ok",
  },
  {
    provider: "Nagad",
    scan: "Yes, if the app accepts Bangla QR",
    decode: "Planned",
    note: "Needs real sample payloads before we claim support.",
    tone: "warn",
  },
  {
    provider: "Rocket",
    scan: "Yes, if the app accepts Bangla QR",
    decode: "Planned",
    note: "Needs real sample payloads.",
    tone: "warn",
  },
  {
    provider: "Bank / NPSB apps",
    scan: "Yes, if the app accepts Bangla QR",
    decode: "Planned",
    note: "Shared bd.org.bb.npsb account template.",
    tone: "warn",
  },
  {
    provider: "Other Bangla QR wallets",
    scan: "Depends on the app",
    decode: "Planned",
    note: "Generic parser, unverified.",
    tone: "warn",
  },
];

function providerList(): HTMLElement {
  return h(
    "ul",
    { class: "provider-list" },
    ...PROVIDER_ROWS.map((row) =>
      h(
        "li",
        { class: "provider-list-item" },
        h("span", { class: "provider-name", text: row.provider }),
        badge(row.decode, row.tone),
      ),
    ),
  );
}

export function providerMatrix(): HTMLElement {
  return h(
    "div",
    { class: "matrix-wrap" },
    h(
      "table",
      { class: "matrix" },
      h(
        "thead",
        null,
        h(
          "tr",
          null,
          h("th", { attrs: { scope: "col" }, text: "Provider" }),
          h("th", { attrs: { scope: "col" }, text: "Scan & pay a deshiQR QR" }),
          h("th", { attrs: { scope: "col" }, text: "Decode / derive in deshiQR" }),
          h("th", { attrs: { scope: "col" }, text: "Notes" }),
        ),
      ),
      h(
        "tbody",
        null,
        ...PROVIDER_ROWS.map((row) =>
          h(
            "tr",
            null,
            h("th", { attrs: { scope: "row" }, text: row.provider }),
            h("td", { text: row.scan }),
            h("td", null, badge(row.decode, row.tone)),
            h("td", { text: row.note }),
          ),
        ),
      ),
    ),
    h("p", {
      class: "matrix-caption",
      text: "A QR made with deshiQR is a standard Bangla QR payload. bKash decoding is verified today; other providers are planned until their real payloads are in our tests. We never claim verified support we cannot back up.",
    }),
  );
}

export function copyButton(value: string, label = "Copy", options: { small?: boolean } = {}): HTMLButtonElement {
  const button = h(
    "button",
    {
      class: `button button-secondary button-small${options.small ? " button-tiny" : ""}`,
      attrs: { type: "button" },
    },
    icon("copy"),
    h("span", { text: label }),
  );
  button.addEventListener("click", async () => {
    const ok = await copyText(value);
    if (ok) {
      button.classList.add("is-copied");
      toast("Copied to clipboard", "success", 1800);
    } else {
      toast("Could not copy — select the text manually.", "error");
    }
  });
  return button;
}

export function codeBlock(code: string, options: { label?: string; copy?: boolean } = {}): HTMLElement {
  return h(
    "div",
    { class: "code-block" },
    h(
      "div",
      { class: "code-head" },
      h("span", { class: "code-label", text: options.label ?? "Embed snippet" }),
      options.copy === false ? null : copyButton(code, "Copy", { small: true }),
    ),
    h("pre", { class: "code-pre" }, h("code", { text: code })),
  );
}

export interface EmbedSnippetOptions {
  payload: string;
  title: string;
  note?: string;
  presets?: number[];
  refPrefix?: string;
  refLen?: number;
  amount?: number | null;
}

/** The `<deshiqr-pay>` embed snippet (script + element). */
export function embedSnippet(options: EmbedSnippetOptions): string {
  const attributes: string[] = [`payload="${options.payload}"`];
  if (options.title) attributes.push(`title="${escapeAttribute(options.title)}"`);
  if (options.note) attributes.push(`note="${escapeAttribute(options.note)}"`);
  if (options.presets && options.presets.length > 0) {
    attributes.push(`presets="${options.presets.join(",")}"`);
  }
  if (options.refPrefix) attributes.push(`ref-prefix="${escapeAttribute(options.refPrefix)}"`);
  if (options.refLen && options.refLen > 0) attributes.push(`ref-length="${options.refLen}"`);
  if (options.amount !== null && options.amount !== undefined) {
    attributes.push(`amount="${options.amount}"`);
    attributes.push("lock-amount");
  }
  attributes.push('theme="auto"');
  return [
    '<script type="module" src="https://cdn.jsdelivr.net/npm/deshiqr-element@0.1.0/dist/deshiqr-element.js"></script>',
    "",
    `<deshiqr-pay ${attributes.join(" ")}></deshiqr-pay>`,
  ].join("\n");
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function sectionHeading(eyebrow: string, title: string, lede?: string): HTMLElement {
  return h(
    "div",
    { class: "section-head" },
    h("p", { class: "eyebrow", text: eyebrow }),
    h("h2", { class: "section-title", text: title }),
    lede ? h("p", { class: "section-lede", text: lede }) : null,
  );
}

export function pageHeader(options: {
  eyebrow?: string;
  title: string;
  lede?: string;
  actions?: HTMLElement[];
}): HTMLElement {
  return h(
    "div",
    { class: "page-head" },
    h(
      "div",
      { class: "page-head-copy" },
      options.eyebrow ? h("p", { class: "eyebrow", text: options.eyebrow }) : null,
      h("h1", { class: "page-title", text: options.title, attrs: { tabindex: "-1", id: "page-title" } }),
      options.lede ? h("p", { class: "page-lede", text: options.lede }) : null,
    ),
    options.actions && options.actions.length > 0
      ? h("div", { class: "page-head-actions" }, ...options.actions)
      : null,
  );
}

export function alertBox(message: string, tone: "error" | "warn" | "info" | "success" = "info"): HTMLElement {
  return h(
    "div",
    {
      class: `alert alert-${tone}`,
      attrs: { role: tone === "error" ? "alert" : "status" },
    },
    h("span", { class: "alert-icon" }, icon(tone === "success" ? "check" : tone === "error" ? "alert" : "spark")),
    h("p", { class: "alert-text", text: message }),
  );
}

export function loadingScreen(label = "Loading…"): HTMLElement {
  return h(
    "div",
    { class: "loading-screen", attrs: { role: "status", "aria-live": "polite" } },
    h("span", { class: "spinner" }),
    h("p", { text: label }),
  );
}

export function featureCard(options: { icon: IconName; title: string; body: string }): HTMLElement {
  return h(
    "article",
    { class: "feature" },
    h("span", { class: "feature-icon" }, icon(options.icon)),
    h("h3", { text: options.title }),
    h("p", { text: options.body }),
  );
}

/** Buttons used across pages. */
export function primaryLink(href: string, label: string, iconName?: IconName): HTMLAnchorElement {
  return h(
    "a",
    { class: "button button-primary", href },
    label,
    iconName ? icon(iconName) : null,
  );
}

export function secondaryLink(href: string, label: string, iconName?: IconName): HTMLAnchorElement {
  return h(
    "a",
    { class: "button button-secondary", href },
    iconName ? icon(iconName) : null,
    label,
  );
}

export function ghostButton(label: string, onClick: () => void, iconName?: IconName): HTMLButtonElement {
  const button = h(
    "button",
    { class: "button button-ghost button-small", attrs: { type: "button" } },
    iconName ? icon(iconName) : null,
    label,
  );
  button.addEventListener("click", onClick);
  return button;
}

export function field(options: {
  label: string;
  control: HTMLElement;
  hint?: string;
  error?: string;
  id?: string;
}): HTMLElement {
  const hintId = options.id ? `${options.id}-hint` : undefined;
  const errorId = options.id ? `${options.id}-error` : undefined;
  if (hintId && options.control instanceof HTMLElement) {
    const describedBy = [hintId, options.error ? errorId : null].filter(Boolean).join(" ");
    if (describedBy) options.control.setAttribute("aria-describedby", describedBy);
  }
  return h(
    "div",
    { class: "field" },
    h("label", { class: "field-label", attrs: { for: options.id ?? undefined }, text: options.label }),
    options.control,
    options.hint ? h("p", { class: "field-hint", attrs: { id: hintId }, text: options.hint }) : null,
    options.error ? h("p", { class: "field-error", attrs: { id: errorId }, role: "alert", text: options.error }) : null,
  );
}

export function input(options: {
  id: string;
  type?: string;
  value?: string;
  placeholder?: string;
  inputMode?: string;
  autocomplete?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  name?: string;
}): HTMLInputElement {
  return h("input", {
    class: "input",
    attrs: {
      id: options.id,
      type: options.type ?? "text",
      ...(options.name ? { name: options.name } : {}),
      ...(options.value !== undefined ? { value: options.value } : {}),
      ...(options.placeholder ? { placeholder: options.placeholder } : {}),
      ...(options.inputMode ? { inputmode: options.inputMode } : {}),
      ...(options.autocomplete ? { autocomplete: options.autocomplete } : {}),
      ...(options.required ? { required: "required" } : {}),
      ...(options.minLength !== undefined ? { minlength: String(options.minLength) } : {}),
      ...(options.maxLength !== undefined ? { maxlength: String(options.maxLength) } : {}),
      ...(options.pattern ? { pattern: options.pattern } : {}),
    },
  });
}

export function textarea(options: {
  id: string;
  value?: string;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}): HTMLTextAreaElement {
  const element = h("textarea", {
    class: "input textarea",
    attrs: {
      id: options.id,
      rows: String(options.rows ?? 4),
      ...(options.placeholder ? { placeholder: options.placeholder } : {}),
      ...(options.maxLength !== undefined ? { maxlength: String(options.maxLength) } : {}),
    },
  });
  element.value = options.value ?? "";
  return element;
}

export function select(options: {
  id: string;
  choices: Array<{ value: string; label: string }>;
  value?: string;
}): HTMLSelectElement {
  const element = h(
    "select",
    { class: "input select", attrs: { id: options.id } },
    ...options.choices.map((choice) =>
      h("option", { attrs: { value: choice.value }, text: choice.label }),
    ),
  );
  if (options.value !== undefined) element.value = options.value;
  return element;
}

export function checkbox(options: { id: string; label: string; checked?: boolean }): HTMLElement {
  const control = h("input", { attrs: { type: "checkbox", id: options.id } });
  control.checked = options.checked ?? false;
  return h(
    "label",
    { class: "checkbox", attrs: { for: options.id } },
    control,
    h("span", { text: options.label }),
  );
}

/** Default content for the landing page's demo panel. */
export function demoElementAttributes(): Record<string, string> {
  return {
    payload: DEMO_STATIC_PAYLOAD,
    title: "DEMO STORE",
    note: "Demo merchant — synthetic Bangla QR, not a real shop.",
    presets: "100,500,1000",
    theme: currentTheme(),
    size: "280",
  };
}

export { badge };
