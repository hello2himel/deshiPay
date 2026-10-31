/**
 * `<deshiqr-pay>` — a dependency-free Bangla QR payment panel.
 *
 * Usage:
 * ```html
 * <script type="module" src="https://cdn.example/deshiqr-element.js"></script>
 * <deshiqr-pay payload="000201…" title="DEMO STORE" presets="100,500,1000"></deshiqr-pay>
 * ```
 *
 * Registering the element happens on module import; the IIFE build registers
 * automatically. When `payload` is provided the component never touches the
 * network. `config-url` (optional) fetches a small JSON config.
 */
import {
  DeshiQrError,
  decodeSafe,
  formatTaka,
  type DecodedQr,
  type DeshiQrCode,
  type MerchantDetails,
} from "deshiqr";
import { encode, toSvg } from "deshiqr-qr";
import {
  PROVIDER_FOOTNOTE,
  PROVIDER_HINT,
  buildPayPayload,
  normalizeAmount,
  parseAmountText,
  parseConfig,
  parsePayAttributes,
  pngFilename,
  resolveSettings,
  type PayAttributes,
  type PayBuildResult,
  type PayConfig,
  type PaySettings,
} from "./helpers.ts";
import { styles } from "./styles.ts";

const TAG_NAME = "deshiqr-pay";

const OBSERVED_ATTRIBUTES = [
  "payload",
  "config-url",
  "amount",
  "lock-amount",
  "reference",
  "ref-prefix",
  "ref-length",
  "title",
  "note",
  "presets",
  "theme",
  "size",
  "bare",
] as const;

/** `HTMLElement` exists in browsers; keep the module importable in Node/tests. */
const HTMLElementBase: typeof HTMLElement =
  typeof HTMLElement === "undefined" ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

interface PanelElements {
  card: HTMLElement;
  state: HTMLElement;
  stateText: HTMLElement;
  stateRetry: HTMLButtonElement;
  spinner: HTMLElement;
  content: HTMLElement;
  title: HTMLElement;
  note: HTMLElement;
  qr: HTMLElement;
  caption: HTMLElement;
  input: HTMLInputElement;
  presets: HTMLElement;
  reference: HTMLElement;
  save: HTMLButtonElement;
  help: HTMLElement;
  error: HTMLElement;
}

export interface DeshiQrReadyDetail {
  payload: string;
  amount: number | null;
  reference: string | null;
}

export type DeshiQrChangeDetail = DeshiQrReadyDetail;

export interface DeshiQrErrorDetail {
  code: DeshiQrCode;
  message: string;
}

interface Derived {
  result: PayBuildResult;
  svg: string;
  merchant: MerchantDetails;
  decoded: DecodedQr;
}

function toFailure(error: unknown): DeshiQrErrorDetail {
  if (error instanceof DeshiQrError) return { code: error.code, message: error.message };
  const message = error instanceof Error ? error.message : "Could not build the payment QR code.";
  return { code: "UNSUPPORTED", message };
}

/** Rasterise a self-contained QR SVG through a canvas. Browser-only. */
async function svgToPngBlob(svg: string, size: number, doc: Document): Promise<Blob> {
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = new Image();
  image.decoding = "sync";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("This browser could not rasterise the QR SVG."));
    image.src = source;
  });

  const canvas = doc.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot draw the QR code on a canvas.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size, size);
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, size, size);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("This browser could not encode the PNG."));
    }, "image/png");
  });
}

function createPresetButton(value: string, label: string, pressed: boolean): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "preset";
  button.dataset.preset = value;
  button.setAttribute("aria-pressed", pressed ? "true" : "false");
  button.textContent = label;
  return button;
}

export class DeshiQrPay extends HTMLElementBase {
  static readonly observedAttributes: readonly string[] = OBSERVED_ATTRIBUTES;

  #shadow: ShadowRoot | null = null;
  #elements: PanelElements | null = null;
  #settings: PaySettings | null = null;
  #attributes: PayAttributes | null = null;
  #config: PayConfig | null = null;
  #configUrl: string | null = null;
  #configController: AbortController | null = null;
  #configLoading = false;

  #basePayload = "";
  #amount: number | null = null;
  #attributeAmount: number | null | undefined = undefined;
  #generatedReference: string | null = null;
  #generatedForAmount: number | null = null;
  #payload = "";
  #svg = "";
  #lastReference: string | null = null;
  #lastErrorKey: string | null = null;

  #ready = false;
  #lastSignature = "";
  #inputFocused = false;

  constructor() {
    super();
    // Nothing DOM-heavy here: custom element constructors must stay cheap.
  }

  /* ------------------------------------------------------------ lifecycle */

  connectedCallback(): void {
    if (typeof this.getAttribute !== "function") return;
    this.#ensureShell();
    this.#syncFromAttributes();
  }

  disconnectedCallback(): void {
    this.#configController?.abort();
    this.#configController = null;
    this.#configLoading = false;
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;
    if (!this.#shadow) return; // connectedCallback will do the first sync
    if (name === "config-url" && !newValue) {
      this.#config = null;
      this.#configUrl = null;
      this.#configController?.abort();
      this.#configController = null;
      this.#configLoading = false;
    }
    this.#syncFromAttributes();
  }

  /* -------------------------------------------------------------- public */

  /** Re-read attributes, re-fetch `config-url` when present, and rebuild the QR. */
  refresh(): void {
    this.#syncFromAttributes({ reloadConfig: true });
  }

  /** Set the amount programmatically. `null` clears it (static payload). */
  setAmount(amount: number | null): void {
    const next = amount === null ? null : normalizeAmount(amount);
    if (amount !== null && next === null) {
      this.#emitError({
        code: "BAD_AMOUNT",
        message: "Amount must be a positive number up to 99,999,999.99.",
      });
      return;
    }
    this.#setAmount(next, true);
  }

  /** The currently derived payload (static when no amount is set). */
  getPayload(): string {
    if (this.#payload) return this.#payload;
    const settings = this.#effectiveSettings();
    if (!settings || !settings.basePayload) return "";
    try {
      const derived = this.#derive(settings);
      this.#remember(derived.result, settings);
      return derived.result.payload;
    } catch {
      return "";
    }
  }

  /** The current QR as a self-contained `<svg>` string, or `""`. */
  getSvg(): string {
    if (this.#svg) return this.#svg;
    const settings = this.#effectiveSettings();
    if (!settings || !settings.basePayload) return "";
    try {
      const derived = this.#derive(settings);
      this.#remember(derived.result, settings);
      return derived.svg;
    } catch {
      return "";
    }
  }

  /** Download the QR as a PNG (2× the rendered size). */
  async downloadPng(filename?: string): Promise<void> {
    const svg = this.getSvg();
    if (!svg) throw new DeshiQrError("EMPTY_PAYLOAD", "There is no QR code to save yet.");
    const doc = globalThis.document;
    if (!doc) throw new DeshiQrError("UNSUPPORTED", "Saving a PNG requires a browser DOM.");
    const baseSize = Math.max(384, this.#settings?.size ?? 280);
    const blob = await svgToPngBlob(svg, baseSize * 2, doc);
    const url = URL.createObjectURL(blob);
    const link = doc.createElement("a");
    link.href = url;
    link.download =
      filename ??
      pngFilename({
        amount: this.#amount,
        reference: this.#lastReference,
      });
    doc.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ------------------------------------------------------------- shell */

  #ensureShell(): void {
    if (this.#shadow) return;
    if (typeof this.attachShadow !== "function") return;
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>${styles}</style>
      <div class="card" part="card">
        <div class="state" part="state" role="status">
          <span class="spinner" aria-hidden="true"></span>
          <p class="state-text">Preparing the payment panel…</p>
          <button class="state-retry" type="button" hidden>Try again</button>
        </div>
        <div class="content" hidden>
          <header class="head" part="header">
            <div class="identity">
              <h2 class="title" part="title"></h2>
              <p class="note" part="note" hidden></p>
            </div>
            <span class="badge" part="badge">Bangla QR</span>
          </header>
          <div class="body">
            <div class="qr-col">
              <div class="qr" part="qr" role="img"></div>
              <p class="qr-caption" part="caption"></p>
            </div>
            <div class="pay-col">
              <label class="field-label" for="dq-amount">Amount (BDT)</label>
              <div class="amount-field">
                <span class="taka" aria-hidden="true">৳</span>
                <input
                  id="dq-amount"
                  class="amount-input"
                  part="input"
                  type="text"
                  inputmode="decimal"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="0.00"
                />
              </div>
              <div class="presets" part="presets" role="group" aria-label="Preset amounts"></div>
              <p class="ref" part="reference" hidden></p>
              <button class="save" part="save" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 3v12" />
                  <path d="m7 10 5 5 5-5" />
                  <path d="M5 21h14" />
                </svg>
                Save QR
              </button>
              <p class="help" part="help"></p>
              <p class="error" part="error" role="alert" hidden></p>
            </div>
          </div>
          <footer class="foot" part="footer">
            <span class="foot-main">${PROVIDER_FOOTNOTE}</span>
            <span class="foot-hint">${PROVIDER_HINT}</span>
          </footer>
        </div>
      </div>
    `;

    const query = <T extends Element>(selector: string): T => {
      const element = shadow.querySelector<T>(selector);
      if (!element) throw new Error(`deshiqr-pay: missing element ${selector}`);
      return element;
    };

    this.#elements = {
      card: query(".card"),
      state: query(".state"),
      stateText: query(".state-text"),
      stateRetry: query(".state-retry"),
      spinner: query(".spinner"),
      content: query(".content"),
      title: query(".title"),
      note: query(".note"),
      qr: query(".qr"),
      caption: query(".qr-caption"),
      input: query(".amount-input"),
      presets: query(".presets"),
      reference: query(".ref"),
      save: query(".save"),
      help: query(".help"),
      error: query(".error"),
    };

    const elements = this.#elements;
    elements.stateRetry.addEventListener("click", () => this.refresh());
    elements.save.addEventListener("click", () => {
      void this.#saveFromButton();
    });
    elements.input.addEventListener("input", this.#handleInput);
    elements.input.addEventListener("change", this.#handleCommit);
    elements.input.addEventListener("focus", () => {
      this.#inputFocused = true;
    });
    elements.input.addEventListener("blur", () => {
      this.#inputFocused = false;
      this.#handleCommit();
    });
    elements.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.#handleCommit();
      }
    });
    elements.presets.addEventListener("click", this.#handlePresetClick);

    this.#shadow = shadow;
  }

  /* ------------------------------------------------------------- config */

  #syncFromAttributes(options: { reloadConfig?: boolean } = {}): void {
    if (!this.#shadow) return;
    const attributes = parsePayAttributes((name) => this.getAttribute(name));
    this.#attributes = attributes;

    const configUrl = attributes.configUrl;
    if (configUrl && (options.reloadConfig || configUrl !== this.#configUrl)) {
      this.#configUrl = configUrl;
      this.#config = null;
      this.#configLoading = true;
      this.#applySettings(resolveSettings(attributes, null), attributes);
      void this.#loadConfig(configUrl);
      return;
    }
    if (!configUrl) {
      this.#configUrl = null;
      this.#config = null;
      this.#configLoading = false;
    }
    this.#applySettings(resolveSettings(attributes, this.#config), attributes);
  }

  async #loadConfig(url: string): Promise<void> {
    this.#configController?.abort();
    const controller = new AbortController();
    this.#configController = controller;
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { accept: "application/json" },
        credentials: "omit",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new DeshiQrError(
          "UNSUPPORTED",
          `Could not load the payment config (HTTP ${response.status}).`,
        );
      }
      const raw: unknown = await response.json();
      if (controller.signal.aborted || !this.isConnected) return;
      this.#config = parseConfig(raw);
      this.#configLoading = false;
      this.#syncFromAttributes();
    } catch (error) {
      if (controller.signal.aborted) return;
      this.#configLoading = false;
      const failure = toFailure(error);
      const settings = this.#effectiveSettings();
      if (settings?.basePayload) {
        // A payload attribute is enough to run without the config.
        this.#applySettings(settings, parsePayAttributes((name) => this.getAttribute(name)));
      } else {
        this.#setState(failure.message, { retry: true });
      }
      this.#emitError(failure);
    } finally {
      if (this.#configController === controller) this.#configController = null;
    }
  }

  /* --------------------------------------------------------- derivation */

  #effectiveSettings(): PaySettings | null {
    if (this.#settings) return this.#settings;
    if (!this.#attributes) {
      this.#attributes = parsePayAttributes((name) => this.getAttribute(name));
    }
    return resolveSettings(this.#attributes, this.#config);
  }

  #derive(settings: PaySettings): Derived {
    const decoded = decodeSafe(settings.basePayload);
    if (!decoded.ok) throw decoded.error;
    const currentReference =
      this.#generatedForAmount === this.#amount ? this.#generatedReference : null;
    const result = buildPayPayload({
      base: settings.basePayload,
      amount: this.#amount,
      reference: settings.reference,
      refPrefix: settings.refPrefix,
      refLength: settings.refLength,
      currentReference,
    });
    const matrix = encode(result.payload, { level: "M" });
    const svg = toSvg(matrix, { margin: 2, dark: "#14121c", light: "#ffffff" });
    return { result, svg, merchant: decoded.qr.merchant, decoded: decoded.qr };
  }

  #remember(result: PayBuildResult, settings: PaySettings): void {
    this.#payload = result.payload;
    this.#lastReference = result.reference;
    if (settings.reference) {
      this.#generatedReference = null;
    } else {
      this.#generatedReference = result.reference;
    }
    this.#generatedForAmount = result.amount;
  }

  #applySettings(settings: PaySettings, attributes: PayAttributes): void {
    const previous = this.#settings;
    if (!previous || previous.basePayload !== settings.basePayload) {
      this.#generatedReference = null;
      this.#generatedForAmount = null;
    }

    // The `amount` attribute is declarative: adopt it whenever it changes.
    if (attributes.amount !== this.#attributeAmount) {
      this.#attributeAmount = attributes.amount;
      this.#amount = attributes.amount;
      this.#generatedReference = null;
      this.#generatedForAmount = null;
      this.#inputFocused = false;
      if (this.#elements) {
        this.#elements.input.value = attributes.amount === null ? "" : String(attributes.amount);
      }
    }

    this.#settings = settings;
    if (this.#elements) {
      this.#elements.card.classList.toggle("bare", settings.bare);
      this.style.setProperty("--dq-qr-size", `${settings.size}px`);
    }
    this.#render({ emit: true });
  }

  #setAmount(next: number | null, syncInput: boolean): void {
    if (next === this.#amount) {
      if (syncInput && this.#elements && next !== null) {
        this.#elements.input.value = String(next);
      }
      return;
    }
    this.#amount = next;
    this.#generatedReference = null;
    this.#generatedForAmount = null;
    if (syncInput && this.#elements) {
      this.#elements.input.value = next === null ? "" : String(next);
    }
    this.#render({ emit: true });
  }

  /* ------------------------------------------------------------- render */

  #render(options: { emit: boolean }): void {
    const elements = this.#elements;
    const settings = this.#settings;
    if (!elements || !settings) return;

    if (!settings.basePayload) {
      this.#payload = "";
      this.#svg = "";
      if (this.#configLoading) {
        this.#setState("Loading the payment panel…", { loading: true });
      } else {
        this.#setState(
          "This payment panel needs a payload. Set the payload or config-url attribute.",
          {},
        );
      }
      return;
    }

    let derived: Derived;
    try {
      derived = this.#derive(settings);
    } catch (error) {
      const failure = toFailure(error);
      this.#payload = "";
      this.#svg = "";
      this.#setState(failure.message, { retry: true });
      const key = `${failure.code}:${failure.message}`;
      if (key !== this.#lastErrorKey) {
        this.#lastErrorKey = key;
        this.#emitError(failure);
      }
      return;
    }

    this.#remember(derived.result, settings);
    this.#lastErrorKey = null;
    this.#svg = derived.svg;
    this.#showContent();
    this.#paint(settings, derived);

    const signature = `${derived.result.payload}|${derived.result.amount ?? ""}|${
      derived.result.reference ?? ""
    }`;
    if (!this.#ready) {
      this.#ready = true;
      this.#lastSignature = signature;
      this.#emit("deshiqr-ready", {
        payload: derived.result.payload,
        amount: derived.result.amount,
        reference: derived.result.reference,
      });
      return;
    }
    if (options.emit && signature !== this.#lastSignature) {
      this.#lastSignature = signature;
      this.#emit("deshiqr-change", {
        payload: derived.result.payload,
        amount: derived.result.amount,
        reference: derived.result.reference,
      });
    }
  }

  #paint(settings: PaySettings, derived: Derived): void {
    const elements = this.#elements;
    if (!elements) return;

    const title = settings.title ?? derived.merchant.name ?? "Bangla QR payment";
    elements.title.textContent = title;
    if (settings.note) {
      elements.note.textContent = settings.note;
      elements.note.hidden = false;
    } else {
      elements.note.hidden = true;
      elements.note.textContent = "";
    }

    const locked = settings.lockAmount && this.#amount !== null;
    const amountLabel =
      this.#amount === null ? "any amount" : formatTaka(this.#amount);

    elements.qr.innerHTML = derived.svg;
    const svg = elements.qr.querySelector("svg");
    if (svg) {
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("focusable", "false");
    }
    elements.qr.setAttribute(
      "aria-label",
      `Bangla QR payment code for ${title}${
        this.#amount === null ? "" : `, ${amountLabel}`
      }${derived.result.reference ? `, reference ${derived.result.reference}` : ""}`,
    );
    elements.caption.textContent = locked
      ? "Scan with bKash or any Bangla QR app."
      : "Scan with bKash or any Bangla QR app.";

    // Amount input
    elements.input.readOnly = locked;
    elements.input.setAttribute(
      "aria-label",
      locked ? `Fixed amount, ${amountLabel} BDT` : "Payment amount in BDT",
    );
    if (!this.#inputFocused || locked) {
      if (locked && this.#amount !== null) {
        elements.input.value = formatTaka(this.#amount, { symbol: false, decimals: 2 });
      } else if (this.#amount !== null) {
        elements.input.value = String(this.#amount);
      } else {
        elements.input.value = "";
      }
    }

    // Presets
    elements.presets.replaceChildren();
    const showPresets = !locked && settings.presets.length > 0;
    elements.presets.hidden = !showPresets;
    if (showPresets) {
      for (const preset of settings.presets) {
        elements.presets.append(
          createPresetButton(String(preset), formatTaka(preset), this.#amount === preset),
        );
      }
      if (this.#amount !== null) {
        elements.presets.append(createPresetButton("", "Any amount", false));
      }
    }

    // Reference (bill number) display
    elements.reference.replaceChildren();
    if (derived.result.reference) {
      const label = document.createElement("span");
      label.textContent = "Bill no. / reference";
      const code = document.createElement("code");
      code.textContent = derived.result.reference;
      elements.reference.append(label, code);
      elements.reference.hidden = false;
    } else {
      elements.reference.hidden = true;
    }

    // Help text and error
    if (locked) {
      elements.help.textContent = "Amount is fixed for this payment link.";
    } else if (derived.result.reference) {
      elements.help.textContent =
        "A bill number is included so the payment can be matched to this order.";
    } else {
      elements.help.textContent =
        "Type an amount to lock it into the QR, or leave it empty and the customer types it in their app.";
    }
    elements.error.hidden = true;
    elements.error.textContent = "";
    elements.save.disabled = false;
  }

  #setState(
    message: string,
    options: { loading?: boolean; retry?: boolean } = {},
  ): void {
    const elements = this.#elements;
    if (!elements) return;
    elements.state.hidden = false;
    elements.content.hidden = true;
    elements.spinner.hidden = !options.loading;
    elements.stateRetry.hidden = !options.retry;
    elements.stateText.textContent = message;
    this.setAttribute("aria-busy", options.loading ? "true" : "false");
  }

  #showContent(): void {
    const elements = this.#elements;
    if (!elements) return;
    elements.state.hidden = true;
    elements.content.hidden = false;
    this.removeAttribute("aria-busy");
  }

  /* ------------------------------------------------------------- events */

  #handleInput = (): void => {
    const elements = this.#elements;
    if (!elements) return;
    const raw = elements.input.value;
    if (raw.trim() === "") {
      this.#clearInputError();
      this.#setAmount(null, false);
      return;
    }
    const parsed = parseAmountText(raw);
    if (parsed === null) {
      this.#showInputError("Use digits only — for example 500 or 1,250.50.");
      return;
    }
    this.#clearInputError();
    this.#setAmount(parsed, false);
  };

  #handleCommit = (): void => {
    const elements = this.#elements;
    if (!elements) return;
    const raw = elements.input.value.trim();
    if (raw === "") {
      this.#clearInputError();
      this.#setAmount(null, true);
      return;
    }
    const parsed = parseAmountText(raw);
    if (parsed === null) {
      this.#showInputError("Use digits only — for example 500 or 1,250.50.");
      this.#emitError({
        code: "BAD_AMOUNT",
        message: "Amount must be a positive number up to 99,999,999.99.",
      });
      return;
    }
    this.#clearInputError();
    this.#setAmount(parsed, true);
  };

  #handlePresetClick = (event: Event): void => {
    const elements = this.#elements;
    if (!elements || !(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>("button[data-preset]");
    if (!button) return;
    const value = button.dataset.preset ?? "";
    if (value === "") {
      this.#clearInputError();
      this.#setAmount(null, true);
      return;
    }
    const amount = parseAmountText(value);
    if (amount === null) return;
    this.#clearInputError();
    this.#setAmount(amount, true);
  };

  #saveFromButton = async (): Promise<void> => {
    const elements = this.#elements;
    if (!elements) return;
    elements.save.disabled = true;
    try {
      await this.downloadPng();
    } catch (error) {
      this.#emitError(toFailure(error));
    } finally {
      elements.save.disabled = false;
    }
  };

  #showInputError(message: string): void {
    const elements = this.#elements;
    if (!elements) return;
    elements.error.textContent = message;
    elements.error.hidden = false;
    elements.input.setAttribute("aria-invalid", "true");
  }

  #clearInputError(): void {
    const elements = this.#elements;
    if (!elements) return;
    elements.error.hidden = true;
    elements.error.textContent = "";
    elements.input.removeAttribute("aria-invalid");
  }

  #emit(type: "deshiqr-ready" | "deshiqr-change", detail: DeshiQrReadyDetail): void {
    this.dispatchEvent(new CustomEvent<DeshiQrReadyDetail>(type, { detail, bubbles: true, composed: true }));
  }

  #emitError(detail: DeshiQrErrorDetail): void {
    this.dispatchEvent(new CustomEvent<DeshiQrErrorDetail>("deshiqr-error", { detail, bubbles: true, composed: true }));
  }
}

/** Register the element once. Safe to call in Node (no-op without a registry). */
export function defineDeshiQrPay(
  registry: CustomElementRegistry | undefined = typeof globalThis.customElements === "undefined"
    ? undefined
    : globalThis.customElements,
): void {
  if (!registry) return;
  if (registry.get(TAG_NAME)) return;
  registry.define(TAG_NAME, DeshiQrPay);
}

defineDeshiQrPay();

declare global {
  interface HTMLElementTagNameMap {
    "deshiqr-pay": DeshiQrPay;
  }
}
