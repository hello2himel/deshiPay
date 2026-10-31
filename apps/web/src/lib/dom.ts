/**
 * Small DOM toolkit — no framework, no virtual DOM.
 *
 * `h()` builds elements with attributes/properties/listeners; icons are inline SVG;
 * toasts and clipboard helpers are shared by every page.
 */

export type Child = Node | string | number | null | undefined | false;

export interface ElementProps {
  class?: string;
  text?: string;
  html?: string;
  dataset?: Record<string, string>;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  on?: Record<string, (event: Event) => void>;
  [key: string]: unknown;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  applyProps(element, props);
  appendChildren(element, children);
  return element;
}

function applyProps(element: HTMLElement, props: ElementProps | null): void {
  if (!props) return;
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") {
      element.className = String(value);
    } else if (key === "text") {
      element.textContent = String(value);
    } else if (key === "html") {
      element.innerHTML = String(value);
    } else if (key === "dataset") {
      Object.assign(element.dataset, value as Record<string, string>);
    } else if (key === "attrs") {
      for (const [name, attributeValue] of Object.entries(value as Record<string, unknown>)) {
        if (attributeValue === null || attributeValue === undefined || attributeValue === false) continue;
        element.setAttribute(name, String(attributeValue));
      }
    } else if (key === "on") {
      for (const [name, listener] of Object.entries(value as Record<string, EventListener>)) {
        element.addEventListener(name, listener);
      }
    } else if (key in element) {
      (element as unknown as Record<string, unknown>)[key] = value;
    } else {
      element.setAttribute(key, String(value));
    }
  }
}

export function appendChildren(parent: Node, children: readonly Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (child instanceof Node) parent.appendChild(child);
    else parent.appendChild(document.createTextNode(String(child)));
  }
}

export type IconName =
  | "arrow-right"
  | "arrow-left"
  | "copy"
  | "check"
  | "download"
  | "external"
  | "alert"
  | "qr"
  | "spark"
  | "embed"
  | "receipt"
  | "store"
  | "plus"
  | "trash"
  | "edit"
  | "share"
  | "printer"
  | "sun"
  | "moon"
  | "menu"
  | "close"
  | "logout"
  | "shield"
  | "link";

const ICON_PATHS: Record<IconName, string> = {
  "arrow-right": '<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>',
  "arrow-left": '<path d="M20 12H5"/><path d="m11 18-6-6 6-6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M20 14v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>',
  alert: '<path d="M12 3 2 21h20L12 3Z"/><path d="M12 10v5"/><path d="M12 18h.01"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3z"/><path d="M20 14h1v1h-1z"/><path d="M14 20h1v1h-1z"/><path d="M18 18h1v1h-1z"/><path d="M20 20h1v1h-1z"/>',
  spark: '<path d="M12 2v6"/><path d="M12 16v6"/><path d="M2 12h6"/><path d="M16 12h6"/><path d="m5 5 3 3"/><path d="m16 16 3 3"/><path d="m19 5-3 3"/><path d="m8 16-3 3"/>',
  embed: '<path d="m8 6-5 6 5 6"/><path d="m16 6 5 6-5 6"/><path d="m13 4-2 16"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-3-2Z"/><path d="M9 8h6"/><path d="M9 12h6"/>',
  store: '<path d="M4 10v10h16V10"/><path d="M3 4h18l1 6H2Z"/><path d="M9 20v-6h6v6"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="m6 7 1 14h10l1-14"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  edit: '<path d="M4 20h4L20 8l-4-4L4 16Z"/><path d="m14 6 4 4"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8 11 8-4"/><path d="m8 13 8 4"/>',
  printer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="7" rx="2"/><path d="M6 16h12v5H6z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4 12H2"/><path d="M22 12h-2"/><path d="m5 5 1.5 1.5"/><path d="m17.5 17.5 1.5 1.5"/><path d="m19 5-1.5 1.5"/><path d="m6.5 17.5-1.5 1.5"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
  menu: '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>',
  close: '<path d="m6 6 12 12"/><path d="m18 6-12 12"/>',
  logout: '<path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h9"/>',
  shield: '<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z"/><path d="m9 12 2 2 4-4"/>',
  link: '<path d="M10 14a4 4 0 0 0 6 .5l2-2a4 4 0 0 0-5.7-5.7L11 8"/><path d="M14 10a4 4 0 0 0-6-.5l-2 2a4 4 0 0 0 5.7 5.7L13 16"/>',
};

const SVG_NS = "http://www.w3.org/2000/svg";

/** Inline SVG icon. Purely decorative unless a label is passed. */
export function icon(name: IconName, label?: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.9");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", label ? "false" : "true");
  svg.setAttribute("focusable", "false");
  if (label) {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
  }
  svg.innerHTML = ICON_PATHS[name];
  return svg;
}

export type Tone = "neutral" | "accent" | "ok" | "warn" | "danger";

export function badge(text: string, tone: Tone = "neutral"): HTMLSpanElement {
  return h("span", { class: `badge badge-${tone}`, text });
}

export function spinner(label = "Loading"): HTMLSpanElement {
  return h("span", {
    class: "spinner",
    attrs: { role: "status", "aria-label": label },
  });
}

export function emptyState(options: {
  title: string;
  body?: string;
  actions?: HTMLElement[];
  icon?: IconName;
}): HTMLElement {
  return h(
    "div",
    { class: "empty-state" },
    options.icon ? h("div", { class: "empty-icon" }, icon(options.icon)) : null,
    h("h3", { text: options.title }),
    options.body ? h("p", { text: options.body }) : null,
    options.actions && options.actions.length > 0
      ? h("div", { class: "empty-actions" }, ...options.actions)
      : null,
  );
}

export function card(...children: Child[]): HTMLElement {
  return h("section", { class: "card" }, ...children);
}

/* -------------------------------------------------------------------- toast */

type ToastTone = "info" | "success" | "error";

function toastHost(): HTMLElement {
  let host = document.querySelector<HTMLElement>("#toast-host");
  if (!host) {
    host = h("div", { class: "toast-host", attrs: { id: "toast-host", "aria-live": "polite", "aria-atomic": "true" } });
    document.body.append(host);
  }
  return host;
}

export function toast(message: string, tone: ToastTone = "info", timeout = 4200): void {
  const host = toastHost();
  const node = h(
    "div",
    { class: `toast toast-${tone}`, attrs: { role: tone === "error" ? "alert" : "status" } },
    h("span", { class: "toast-text", text: message }),
    h(
      "button",
      {
        class: "toast-close",
        attrs: { type: "button", "aria-label": "Dismiss" },
        on: { click: () => node.remove() },
      },
      icon("close"),
    ),
  );
  host.append(node);
  window.setTimeout(() => {
    node.classList.add("toast-leaving");
    window.setTimeout(() => node.remove(), 180);
  }, timeout);
}

/* ----------------------------------------------------------------- clipboard */

export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fall through to the textarea fallback
  }
  try {
    const textarea = h("textarea", { class: "visually-hidden", attrs: { readonly: true } });
    textarea.value = value;
    document.body.append(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}

export async function shareLink(options: { title: string; text?: string; url: string }): Promise<"shared" | "copied" | "failed"> {
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  if (typeof nav.share === "function") {
    try {
      await nav.share({ title: options.title, text: options.text, url: options.url });
      return "shared";
    } catch {
      // user cancelled or share failed — fall through to copy
    }
  }
  return (await copyText(options.url)) ? "copied" : "failed";
}

/* ------------------------------------------------------------------- format */

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Truncate long tokens/URLs for display. */
export function shorten(value: string, head = 8, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Mount a page node into the app root (replacing previous content). */
export function mount(root: HTMLElement, page: Node): void {
  root.replaceChildren(page);
  window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
}
