/**
 * Setup wizard `/new`.
 *
 * Paste a payload / upload a QR screenshot / load the demo, validate it with the
 * core library, add merchant details and a live `<deshiqr-pay>` preview, then
 * share a self-contained link, download a poster or publish a hosted page.
 */
import {
  formatTaka,
  maskAccount,
  newReference,
  toStatic,
  validate,
  withAmount,
  type DecodedQr,
  type ValidationReport,
} from "deshiqr";
import { h, icon, toast } from "../lib/dom.ts";
import { absoluteUrl, withBase } from "../lib/base.ts";
import { parseAmountText, parsePresets } from "../lib/amounts.ts";
import { DEMO_STATIC_PAYLOAD } from "../lib/demo.ts";
import { inlineLinkUrl } from "../lib/links.ts";
import { isUsableSlug, slugify, uniqueSlug } from "../lib/merchant.ts";
import { buildPosterSvg } from "../lib/poster.ts";
import { decodeQrFromImage, downloadPng, downloadPosterPng, downloadSvg, qrSvg } from "../lib/qr.ts";
import { hasSupabase, createMerchant, listMyMerchants } from "../lib/supabase.ts";
import { listLocalMerchants, saveLocalMerchant } from "../lib/store.ts";
import { currentTheme } from "../lib/theme.ts";
import type { AppContext } from "../types.ts";
import {
  alertBox,
  checkbox,
  codeBlock,
  copyButton,
  embedSnippet,
  field,
  input,
  primaryLink,
  select,
  textarea,
} from "../ui.ts";

type WizardStep = 1 | 2 | 3;

interface WizardState {
  step: WizardStep;
  rawPayload: string;
  report: ValidationReport | null;
  qr: DecodedQr | null;
  basePayload: string;
  analyzing: boolean;
  title: string;
  note: string;
  presetsText: string;
  lockAmount: boolean;
  amountText: string;
  refPrefix: string;
  refLenText: string;
  slug: string;
  publishStatus: "published" | "draft";
  publishedPath: string | null;
  publishing: boolean;
  posterReference: string | null;
}

const PRESET_PLACEHOLDER = "100,500,1000";

export function newPage(ctx: AppContext): HTMLElement {
  const state: WizardState = {
    step: 1,
    rawPayload: "",
    report: null,
    qr: null,
    basePayload: "",
    analyzing: false,
    title: "",
    note: "",
    presetsText: "",
    lockAmount: false,
    amountText: "",
    refPrefix: "",
    refLenText: "0",
    slug: "",
    publishStatus: "published",
    publishedPath: null,
    publishing: false,
    posterReference: null,
  };

  const root = h("div", { class: "page" });
  const content = h("div", { class: "container wizard" });
  const stepper = h("ol", { class: "stepper", attrs: { "aria-label": "Setup steps" } });
  const stepHost = h("div", { class: "wizard-step-host", attrs: { "aria-live": "polite" } });
  content.append(stepper, stepHost);
  root.append(content);
  let analyzeTimer: number | null = null;

  const renderStepper = (): void => {
    const canContinue = state.basePayload.length > 0;
    const items: Array<{ step: WizardStep; label: string; allowed: boolean }> = [
      { step: 1, label: "Bangla QR", allowed: true },
      { step: 2, label: "Details", allowed: canContinue },
      { step: 3, label: "Share & publish", allowed: canContinue },
    ];
    stepper.replaceChildren(
      ...items.map((item) =>
        h(
          "li",
          { class: `stepper-item${state.step === item.step ? " is-current" : ""}${state.step > item.step ? " is-done" : ""}` },
          h(
            "button",
            {
              class: "stepper-button",
              attrs: {
                type: "button",
                disabled: !item.allowed || state.step === item.step ? "disabled" : undefined,
                "aria-current": state.step === item.step ? "step" : undefined,
              },
              on: {
                click: () => {
                  if (!item.allowed) return;
                  state.step = item.step;
                  render();
                },
              },
            },
            state.step > item.step ? h("span", { class: "stepper-number" }, icon("check")) : h("span", { class: "stepper-number", text: String(item.step) }),
            h("span", { class: "stepper-label", text: item.label }),
          ),
        ),
      ),
    );
  };

  const render = (): void => {
    renderStepper();
    stepHost.replaceChildren(state.step === 1 ? stepOne() : state.step === 2 ? stepTwo() : stepThree());
    const heading = stepHost.querySelector<HTMLElement>("h2");
    heading?.focus({ preventScroll: true });
  };

  const setStep = (step: WizardStep): void => {
    state.step = step;
    state.posterReference = null;
    render();
  };

  /* ------------------------------------------------------------ step one */

  const applyAnalysis = (payload: string): boolean => {
    state.rawPayload = payload;
    state.report = validate(payload);
    state.analyzing = false;
    if (!state.report.ok || !state.report.qr) {
      state.qr = null;
      state.basePayload = "";
      return false;
    }
    state.qr = state.report.qr;
    let base = payload.trim();
    if (state.report.qr.kind === "dynamic") {
      try {
        base = toStatic(payload);
      } catch {
        base = payload.trim();
      }
    }
    const baseReport = validate(base);
    if (!baseReport.ok || !baseReport.qr) {
      state.basePayload = "";
      state.qr = null;
      return false;
    }
    state.basePayload = base;
    // Sensible defaults, only when the wizard is empty.
    if (!state.title) state.title = baseReport.qr.merchant.name;
    if (!state.slug) state.slug = slugify(state.title);
    if (!state.presetsText) state.presetsText = "100,500,1000";
    const sourceReference = state.report.qr.reference;
    if (state.refLenText === "0" && sourceReference) state.refLenText = String(sourceReference.length);
    if (state.report.qr.amount !== null && !state.amountText) {
      state.amountText = String(state.report.qr.amount);
      state.lockAmount = true;
    }
    return true;
  };

  const scheduleAnalysis = (payload: string): void => {
    state.rawPayload = payload;
    state.analyzing = true;
    renderValidation();
    if (analyzeTimer !== null) window.clearTimeout(analyzeTimer);
    analyzeTimer = window.setTimeout(() => {
      applyAnalysis(payload);
      renderValidation();
      renderStepper();
      continueOne.disabled = state.basePayload.length === 0;
    }, 260);
  };

  let validationHost = h("div", { class: "validation-host" });
  let continueOne = h("button", { class: "button button-primary", attrs: { type: "button" } }, "Continue", icon("arrow-right"));
  continueOne.disabled = true;
  continueOne.addEventListener("click", () => {
    if (!state.basePayload) return;
    setStep(2);
  });

  const renderValidation = (): void => {
    validationHost.replaceChildren(...validationView(state));
    continueOne.disabled = state.basePayload.length === 0;
  };

  function validationView(current: WizardState): HTMLElement[] {
    if (current.analyzing && !current.report) {
      return [
        h(
          "div",
          { class: "validation-loading", attrs: { role: "status" } },
          h("span", { class: "spinner" }),
          h("p", { text: "Checking the payload…" }),
        ),
      ];
    }
    if (!current.report) {
      return [
        h(
          "div",
          { class: "validation-empty" },
          h("p", { class: "validation-empty-title", text: "Waiting for a payload" }),
          h("p", {
            class: "card-small",
            text: "Paste the Bangla QR payload from your provider, upload a screenshot of the printed QR, or load the synthetic demo. The checksum and required fields are verified before anything else.",
          }),
        ),
      ];
    }
    const nodes: HTMLElement[] = [];
    if (current.report.errors.length > 0) {
      nodes.push(
        alertBox(
          current.report.errors.map((issue) => issue.message).join(" "),
          "error",
        ),
      );
    }
    if (current.report.warnings.length > 0) {
      nodes.push(
        alertBox(
          current.report.warnings.map((issue) => issue.message).join(" "),
          "warn",
        ),
      );
    }
    if (current.report.ok && current.qr) {
      const qr = current.qr;
      const verified = qr.merchant.institution === "bd.org.bb.npsb";
      nodes.push(
        h(
          "div",
          { class: "validation-card" },
          h(
            "div",
            { class: "validation-head" },
            h("span", { class: `badge badge-${verified ? "ok" : "warn"}`, text: verified ? "Checksum verified" : "Unknown institution" }),
            h("span", { class: "badge badge-neutral", text: qr.kind === "dynamic" ? "Dynamic QR" : "Static QR" }),
          ),
          h("h3", { class: "validation-title", text: qr.merchant.name }),
          h(
            "dl",
            { class: "meta-list" },
            metaRow("City", qr.merchant.city ?? "—"),
            metaRow("Account (masked)", maskAccount(qr.merchant.account)),
            metaRow("Institution", qr.merchant.institution),
            metaRow("Currency", qr.currency ?? "—"),
            metaRow("Amount in source", qr.amount === null ? "none (static)" : formatTaka(qr.amount)),
            metaRow("Reference in source", qr.reference ?? "none"),
          ),
          qr.kind === "dynamic"
            ? h("p", {
                class: "card-small",
                text: "This QR already had an amount and a bill number. They are stripped for the pay page so you can set your own below — the account, name, city and tokens stay exactly as issued.",
              })
            : null,
          h("p", {
            class: "card-small",
            text: "The full account, name and NPSB tokens are preserved verbatim from your QR. deshiQR only derives the amount and reference.",
          }),
        ),
      );
    }
    return nodes;
  }

  const stepOne = (): HTMLElement => {
    const payloadInput = textarea({
      id: "wizard-payload",
      value: state.rawPayload,
      placeholder: "000201010211…",
      rows: 6,
      maxLength: 4096,
    });
    payloadInput.addEventListener("input", () => scheduleAnalysis(payloadInput.value));

    const fileInput = h("input", {
      class: "visually-hidden",
      attrs: { type: "file", accept: "image/*", id: "wizard-file" },
    });
    const uploadStatus = h("p", { class: "upload-status", attrs: { role: "status" } });
    const uploadLabel = h(
      "label",
      { class: "upload-drop", attrs: { for: "wizard-file" } },
      h("span", { class: "upload-icon" }, icon("qr")),
      h("span", { class: "upload-title", text: "Upload a QR screenshot" }),
      h("span", { class: "upload-hint", text: "PNG or JPEG — decoded in your browser with jsQR. Nothing is uploaded." }),
    );

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      uploadLabel.classList.add("is-busy");
      uploadStatus.replaceChildren(h("span", { class: "spinner" }), h("span", { text: "Reading the image…" }));
      try {
        const decoded = await decodeQrFromImage(file);
        payloadInput.value = decoded;
        const ok = applyAnalysis(decoded);
        renderValidation();
        renderStepper();
        continueOne.disabled = state.basePayload.length === 0;
        uploadStatus.replaceChildren(
          h("span", { class: `badge badge-${ok ? "ok" : "danger"}`, text: ok ? "QR decoded" : "QR found but invalid" }),
        );
        toast(ok ? "QR decoded — check the merchant details" : "Found a QR but the payload is not valid", ok ? "success" : "error");
      } catch (error) {
        uploadStatus.replaceChildren(alertBox(error instanceof Error ? error.message : "Could not read that image.", "error"));
      } finally {
        uploadLabel.classList.remove("is-busy");
        fileInput.value = "";
      }
    });

    const demoButton = h(
      "button",
      { class: "button button-secondary button-small", attrs: { type: "button" } },
      icon("spark"),
      "Load demo payload",
    );
    demoButton.addEventListener("click", () => {
      payloadInput.value = DEMO_STATIC_PAYLOAD;
      applyAnalysis(DEMO_STATIC_PAYLOAD);
      renderValidation();
      renderStepper();
      continueOne.disabled = state.basePayload.length === 0;
      toast("Synthetic demo payload loaded", "success");
    });

    renderValidation();

    return h(
      "section",
      { class: "wizard-panel" },
      h("h2", { class: "wizard-title", attrs: { tabindex: "-1" }, text: "Add your Bangla QR" }),
      h("p", {
        class: "wizard-lede",
        text: "Start from the QR your provider issued. Paste the payload text, or upload a screenshot of the printed QR. Use the synthetic demo if you just want to explore.",
      }),
      h(
        "div",
        { class: "wizard-split" },
        h(
          "div",
          { class: "card card-pad stack" },
          field({
            id: "wizard-payload",
            label: "Bangla QR payload",
            control: payloadInput,
            hint: "The full text encoded in the QR. It is public data — the same text printed on your shop wall.",
          }),
          h("div", { class: "upload-row" }, uploadLabel, fileInput, demoButton),
          uploadStatus,
        ),
        h("div", { class: "card card-pad stack" }, validationHost),
      ),
      h(
        "div",
        { class: "wizard-footer" },
        h("span", { class: "wizard-footer-hint", text: "Checked locally with the same `deshiqr` library the web component bundles." }),
        h(
          "div",
          { class: "action-row" },
          h("a", { class: "button button-ghost", href: withBase("/", ctx.base) }, "Cancel"),
          continueOne,
        ),
      ),
    );
  };

  /* ------------------------------------------------------------ step two */

  const stepTwo = (): HTMLElement => {
    const titleInput = input({
      id: "wizard-title",
      value: state.title,
      maxLength: 60,
      placeholder: "DEMO STORE",
    });
    const noteInput = textarea({
      id: "wizard-note",
      value: state.note,
      rows: 2,
      maxLength: 160,
      placeholder: "Optional note shown to payers",
    });
    const presetsInput = input({
      id: "wizard-presets",
      value: state.presetsText,
      placeholder: PRESET_PLACEHOLDER,
    });
    const amountInput = input({
      id: "wizard-amount",
      inputMode: "decimal",
      value: state.amountText,
      placeholder: "500",
    });
    const lockCheckbox = checkbox({
      id: "wizard-lock",
      label: "Lock this amount into the QR",
      checked: state.lockAmount,
    });
    amountInput.disabled = !state.lockAmount;
    const refPrefixInput = input({
      id: "wizard-ref-prefix",
      value: state.refPrefix,
      maxLength: 16,
      placeholder: "optional, e.g. FT80",
    });
    const refLenInput = input({
      id: "wizard-ref-len",
      type: "number",
      value: state.refLenText,
    });
    const errorHost = h("div", { class: "form-error-host" });

    const panel = h("deshiqr-pay", {
      class: "wizard-preview",
      attrs: previewAttributes(state),
    });
    const updatePreview = (): void => {
      const attributes = previewAttributes(state);
      const desired = new Set(Object.keys(attributes));
      for (const [name, value] of Object.entries(attributes)) panel.setAttribute(name, value);
      for (const name of Array.from(panel.getAttributeNames())) {
        if (name.startsWith("data-")) continue;
        if (["payload", "config-url", "amount", "lock-amount", "reference", "ref-prefix", "ref-length", "title", "note", "presets", "theme", "size", "bare"].includes(name) && !desired.has(name)) {
          panel.removeAttribute(name);
        }
      }
    };
    let previewTimer: number | null = null;
    const schedulePreview = (): void => {
      if (previewTimer !== null) window.clearTimeout(previewTimer);
      previewTimer = window.setTimeout(updatePreview, 140);
    };

    titleInput.addEventListener("input", () => {
      state.title = titleInput.value;
      if (!state.slug || state.slug === slugify(state.title)) state.slug = slugify(state.title);
      schedulePreview();
    });
    noteInput.addEventListener("input", () => {
      state.note = noteInput.value;
      schedulePreview();
    });
    presetsInput.addEventListener("input", () => {
      state.presetsText = presetsInput.value;
      state.presetsText = presetsInput.value;
      schedulePreview();
    });
    amountInput.addEventListener("input", () => {
      state.amountText = amountInput.value;
      schedulePreview();
    });
    lockCheckbox.querySelector("input")?.addEventListener("change", (event) => {
      state.lockAmount = (event.target as HTMLInputElement).checked;
      amountInput.disabled = !state.lockAmount;
      schedulePreview();
    });
    refPrefixInput.addEventListener("input", () => {
      state.refPrefix = refPrefixInput.value;
      schedulePreview();
    });
    refLenInput.addEventListener("input", () => {
      state.refLenText = refLenInput.value;
      schedulePreview();
    });

    const back = h("button", { class: "button button-secondary", attrs: { type: "button" } }, icon("arrow-left"), "Back");
    back.addEventListener("click", () => setStep(1));

    const next = h("button", { class: "button button-primary", attrs: { type: "button" } }, "Continue", icon("arrow-right"));
    next.addEventListener("click", () => {
      const errors = validateDetails(state);
      if (errors.length > 0) {
        errorHost.replaceChildren(alertBox(errors.join(" "), "error"));
        return;
      }
      state.title = titleInput.value.trim();
      state.note = noteInput.value.trim();
      state.presetsText = presetsInput.value;
      state.amountText = amountInput.value;
      state.refPrefix = refPrefixInput.value.trim();
      state.refLenText = refLenInput.value;
      state.posterReference = null;
      setStep(3);
    });

    return h(
      "section",
      { class: "wizard-panel" },
      h("h2", { class: "wizard-title", attrs: { tabindex: "-1" }, text: "Add the details" }),
      h("p", {
        class: "wizard-lede",
        text: "These details are used on the pay page, the poster and the embed snippet. The live preview updates as you type.",
      }),
      h(
        "div",
        { class: "wizard-split wizard-split-preview" },
        h(
          "div",
          { class: "card card-pad stack" },
          h(
            "div",
            { class: "field-grid" },
            h("div", { class: "field-grid-wide" }, field({ id: "wizard-title", label: "Page title", control: titleInput, hint: "1–60 characters. Defaults to the merchant name on the QR." })),
            h("div", { class: "field-grid-wide" }, field({ id: "wizard-note", label: "Note", control: noteInput, hint: "Optional, up to 160 characters." })),
            h("div", { class: "field-grid-wide" }, field({ id: "wizard-presets", label: "Preset amounts", control: presetsInput, hint: "Up to 6 comma-separated amounts, e.g. 100,500,1000." })),
          ),
          h("div", { class: "card-subsection" },
            h("h3", { class: "card-subtitle", text: "Amount" }),
            lockCheckbox,
            h("div", { class: "field-grid" }, field({ id: "wizard-amount", label: "Locked amount (BDT)", control: amountInput, hint: "Leave unlocked to let the payer type an amount." })),
          ),
          h("div", { class: "card-subsection" },
            h("h3", { class: "card-subtitle", text: "Bill number / reference" }),
            h(
              "div",
              { class: "field-grid" },
              field({ id: "wizard-ref-prefix", label: "Prefix", control: refPrefixInput, hint: "Letters and digits, up to 16. Leave blank for random." }),
              field({ id: "wizard-ref-len", label: "Length", control: refLenInput, hint: "0 = no reference. 25 matches real bKash dynamic QRs." }),
            ),
            h("p", {
              class: "card-small",
              text: "A reference is generated whenever an amount is included — either locked here or typed by the payer. It helps match a payment to an order.",
            }),
          ),
        ),
        h(
          "div",
          { class: "wizard-preview-wrap" },
          h("p", { class: "preview-label", text: "Live preview" }),
          panel,
          h("p", { class: "card-small", text: "This is the actual <deshiqr-pay> element, not a screenshot." }),
        ),
      ),
      errorHost,
      h(
        "div",
        { class: "wizard-footer" },
        h("span", { class: "wizard-footer-hint", text: "Reference lengths follow the source QR where possible — never hardcoded." }),
        h("div", { class: "action-row" }, back, next),
      ),
    );
  };

  /* ---------------------------------------------------------- step three */

  const stepThree = (): HTMLElement => {
    const amount = state.lockAmount ? parseAmountText(state.amountText) : null;
    const refLen = clampRefLen(state.refLenText);
    const link = inlineLinkUrl(
      {
        payload: state.basePayload,
        title: state.title,
        note: state.note,
        presets: parsePresets(state.presetsText),
        amount: state.lockAmount ? amount : null,
        refPrefix: state.refPrefix,
        refLen,
      },
      `${ctx.origin}${ctx.base}`,
    );
    const payPath = withBase("/", ctx.base);
    const hostedPath = state.publishedPath ? withBase(state.publishedPath, ctx.base) : null;

    const posterPayload = buildDisplayPayload(state);
    const posterReference = currentPosterReference(state);
    const posterSvg = buildPosterSvg({
      qrSvg: qrSvg(posterPayload, { title: state.title }),
      title: state.title || state.qr?.merchant.name || "Bangla QR",
      merchantName: state.qr?.merchant.name ?? state.title,
      note: state.note,
      city: state.qr?.merchant.city ?? null,
      accountMasked: state.qr ? maskAccount(state.qr.merchant.account) : null,
      amount: state.lockAmount ? amount : null,
      reference: posterReference,
      payUrl: link,
      verified: state.qr?.merchant.institution === "bd.org.bb.npsb",
    });
    const posterDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(posterSvg)}`;

    const downloadQr = h("button", { class: "button button-secondary button-small", attrs: { type: "button" } }, icon("download"), "QR PNG");
    downloadQr.addEventListener("click", () => {
      try {
        const svg = qrSvg(posterPayload, { title: state.title });
        void downloadPng(svg, `deshiqr-qr-${state.slug || "pay"}.png`, 1024);
        toast("QR PNG downloaded", "success");
      } catch (error) {
        toast(error instanceof Error ? error.message : "Could not build the QR.", "error");
      }
    });

    const downloadPosterButton = h("button", { class: "button button-secondary button-small", attrs: { type: "button" } }, icon("printer"), "Poster PNG");
    downloadPosterButton.addEventListener("click", async () => {
      downloadPosterButton.disabled = true;
      try {
        await downloadPosterPng(posterSvg, `deshiqr-poster-${state.slug || "pay"}.png`);
        toast("Poster PNG downloaded (A4, 300 dpi)", "success");
      } catch (error) {
        toast(error instanceof Error ? error.message : "Could not build the poster.", "error");
      } finally {
        downloadPosterButton.disabled = false;
      }
    });

    const downloadPosterSvg = h("button", { class: "button button-ghost button-small", attrs: { type: "button" } }, icon("download"), "Poster SVG");
    downloadPosterSvg.addEventListener("click", () => {
      downloadSvg(posterSvg, `deshiqr-poster-${state.slug || "pay"}.svg`);
      toast("Poster SVG downloaded", "success");
    });

    const embedCode = embedSnippet({
      payload: state.basePayload,
      title: state.title,
      note: state.note,
      presets: parsePresets(state.presetsText),
      refPrefix: state.refPrefix,
      refLen,
      amount: state.lockAmount ? amount : null,
    });

    const back = h("button", { class: "button button-secondary", attrs: { type: "button" } }, icon("arrow-left"), "Back");
    back.addEventListener("click", () => setStep(2));
    const startOver = h("button", { class: "button button-ghost", attrs: { type: "button" } }, "Start over");
    startOver.addEventListener("click", () => {
      state.step = 1;
      state.rawPayload = "";
      state.report = null;
      state.qr = null;
      state.basePayload = "";
      state.title = "";
      state.note = "";
      state.presetsText = "";
      state.lockAmount = false;
      state.amountText = "";
      state.refPrefix = "";
      state.refLenText = "0";
      state.slug = "";
      state.publishedPath = null;
      state.posterReference = null;
      setStep(1);
    });

    return h(
      "section",
      { class: "wizard-panel" },
      h("h2", { class: "wizard-title", attrs: { tabindex: "-1" }, text: "Share, print, publish" }),
      h("p", {
        class: "wizard-lede",
        text: "The self-contained link and the downloads work with no backend. A hosted /p/… page needs Supabase — the dashboard explains the difference.",
      }),
      state.publishedPath && hostedPath
        ? alertBox(`Published at ${hostedPath} — open it to check the page.`, "success")
        : null,
      h(
        "div",
        { class: "wizard-split wizard-split-preview" },
        h(
          "div",
          { class: "stack" },
          h(
            "div",
            { class: "card card-pad stack" },
            h("h3", { class: "card-title", text: "Share link" }),
            h("p", { class: "card-small", text: "Everything needed is inside the link — the QR renders in the browser with no server. The payload is public data." }),
            h(
              "div",
              { class: "copy-row" },
              h("input", { class: "input mono", attrs: { type: "text", value: link, readonly: "readonly", "aria-label": "Self-contained pay link" } }),
              copyButton(link, "Copy"),
            ),
            h(
              "div",
              { class: "action-row" },
              h("a", { class: "button button-primary button-small", href: link, attrs: { target: "_blank", rel: "noopener" } }, "Open pay page", icon("external")),
              downloadQr,
              h("a", { class: "button button-ghost button-small", href: `${payPath}#p=${encodeURIComponent(state.basePayload)}` }, "Preview on home"),
            ),
          ),
          h(
            "div",
            { class: "card card-pad stack" },
            h("h3", { class: "card-title", text: "Downloads" }),
            h(
              "div",
              { class: "poster-preview-wrap" },
              h("img", {
                class: "poster-preview",
                attrs: { src: posterDataUrl, alt: `A4 poster preview for ${state.title || "the pay page"}`, loading: "lazy" },
              }),
            ),
            h("div", { class: "action-row" }, downloadPosterButton, downloadPosterSvg),
            h("p", { class: "card-small", text: "The poster is A4 (595×842 pt) with a dashed cut line, the QR, the amount, the masked account and the Bangla scan instruction. Print at 100% scale." }),
          ),
          publishCard(ctx, state, () => {
            render();
          }),
        ),
        h(
          "div",
          { class: "stack" },
          h(
            "div",
            { class: "card card-pad stack" },
            h("h3", { class: "card-title", text: "Embed snippet" }),
            codeBlock(embedCode, { label: "index.html", copy: true }),
            h("p", {
              class: "card-small",
              text: "The element bundles the payload parser and QR encoder, themes with CSS custom properties, and respects reduced motion. Publish the package to npm or self-host dist/deshiqr-element.js.",
            }),
          ),
          h(
            "div",
            { class: "card card-pad stack" },
            h("h3", { class: "card-title", text: "What happens to your QR" }),
            h("p", {
              class: "card-small",
              text: "account, merchant name, city, MCC, currency and NPSB token templates are copied verbatim from your source payload. Only tag 54 (amount) and the bill number inside tag 62 are added or removed, then the CRC is re-sealed.",
            }),
            state.qr
              ? h(
                  "dl",
                  { class: "meta-list" },
                  metaRow("Merchant", state.qr.merchant.name),
                  metaRow("Account (masked)", maskAccount(state.qr.merchant.account)),
                  metaRow("Institution", state.qr.merchant.institution),
                  metaRow("Base payload length", `${state.basePayload.length} chars`),
                )
              : null,
          ),
        ),
      ),
      h(
        "div",
        { class: "wizard-footer" },
        h("span", { class: "wizard-footer-hint", text: "You can come back and edit the details at any time." }),
        h("div", { class: "action-row" }, startOver, back),
      ),
    );
  };

  /* ---------------------------------------------------------- publish card */

  const publishCard = (context: AppContext, current: WizardState, rerender: () => void): HTMLElement => {
    const supabase = hasSupabase(context.config);
    const card = h("div", { class: "card card-pad stack" });
    card.append(h("h3", { class: "card-title", text: supabase ? "Publish a hosted page" : "Save a demo page" }));

    if (current.publishedPath) {
      const hosted = absoluteUrl(current.publishedPath, context.base, context.origin);
      card.append(
        h("p", { class: "card-text", text: "This page is saved. Share the link or find it in the dashboard." }),
        h(
          "div",
          { class: "copy-row" },
          h("input", { class: "input mono", attrs: { type: "text", value: hosted, readonly: "readonly", "aria-label": "Published page URL" } }),
          copyButton(hosted, "Copy"),
        ),
        h(
          "div",
          { class: "action-row" },
          h("a", { class: "button button-primary button-small", href: withBase(current.publishedPath, context.base) }, "Open published page", icon("arrow-right")),
          h("a", { class: "button button-secondary button-small", href: withBase("/dashboard", context.base) }, "Dashboard"),
        ),
      );
      return card;
    }

    if (!supabase) {
      card.append(
        h("p", {
          class: "card-text",
          text: "Demo mode: the page is saved in this browser (localStorage), not on a server. It works locally and can be opened at /p/your-slug on this device.",
        }),
        alertBox(
          "Publishing a link that works for everyone needs Supabase configured for this deployment. Until then the self-contained link above is the way to share.",
          "info",
        ),
      );
      const save = h("button", { class: "button button-primary", attrs: { type: "button" } }, icon("store"), "Save demo pay page");
      save.addEventListener("click", async () => {
        const errors = validateDetails(current);
        if (errors.length > 0) {
          card.append(alertBox(errors.join(" "), "error"));
          return;
        }
        save.disabled = true;
        try {
          const slug = uniqueSlug(current.title, listLocalMerchants().map((merchant) => merchant.slug));
          const decoded = current.qr;
          saveLocalMerchant({
            slug,
            title: current.title,
            note: current.note,
            basePayload: current.basePayload,
            name: decoded?.merchant.name ?? current.title,
            city: decoded?.merchant.city ?? null,
            accountMasked: decoded ? maskAccount(decoded.merchant.account) : null,
            institution: decoded?.merchant.institution ?? "bd.org.bb.npsb",
            refPrefix: current.refPrefix,
            refLen: clampRefLen(current.refLenText),
            presets: parsePresets(current.presetsText),
            verified: false,
            status: current.publishStatus,
            createdAt: null,
            updatedAt: null,
          });
          current.publishedPath = `/p/${slug}`;
          toast("Demo pay page saved in this browser", "success");
          rerender();
        } catch (error) {
          card.append(alertBox(error instanceof Error ? error.message : "Could not save the page.", "error"));
          save.disabled = false;
        }
      });
      card.append(h("div", { class: "action-row" }, save));
      return card;
    }

    if (!context.session) {
      card.append(
        h("p", {
          class: "card-text",
          text: "Publishing stores the page in Supabase so anyone with the link can open it. Sign in with a magic link first — the self-contained link above already works without an account.",
        }),
        h(
          "div",
          { class: "action-row" },
          primaryLink(withBase("/login", context.base), "Sign in to publish", "link"),
        ),
      );
      return card;
    }

    const slugInput = input({ id: "wizard-slug", value: current.slug, maxLength: 30 });
    const statusSelect = select({
      id: "wizard-status",
      choices: [
        { value: "published", label: "Published (anyone with the link)" },
        { value: "draft", label: "Draft (owner only)" },
      ],
      value: current.publishStatus,
    });
    const errorHost = h("div", { class: "form-error-host" });
    const publish = h("button", { class: "button button-primary", attrs: { type: "button" } }, icon("store"), "Publish pay page");
    publish.addEventListener("click", async () => {
      errorHost.replaceChildren();
      const errors = validateDetails(current);
      if (errors.length > 0) {
        errorHost.replaceChildren(alertBox(errors.join(" "), "error"));
        return;
      }
      const slug = slugify(slugInput.value);
      if (!isUsableSlug(slug)) {
        errorHost.replaceChildren(alertBox("Use 3–30 lowercase letters, digits or hyphens; route names like “dashboard” are reserved.", "error"));
        return;
      }
      publish.disabled = true;
      try {
        const existing = await listMyMerchants(context.config);
        const availableSlug = uniqueSlug(slug, existing.map((merchant) => merchant.slug));
        if (availableSlug !== slug) {
          errorHost.replaceChildren(alertBox(`That slug was taken or reserved — saved as “${availableSlug}”.`, "warn"));
        }
        const decoded = current.qr;
        current.publishStatus = statusSelect.value as "published" | "draft";
        const published = await createMerchant(context.config, {
          slug: availableSlug,
          title: current.title,
          note: current.note,
          basePayload: current.basePayload,
          name: decoded?.merchant.name ?? current.title,
          city: decoded?.merchant.city ?? null,
          accountMasked: decoded ? maskAccount(decoded.merchant.account) : null,
          institution: decoded?.merchant.institution ?? "bd.org.bb.npsb",
          refPrefix: current.refPrefix,
          refLen: clampRefLen(current.refLenText),
          presets: parsePresets(current.presetsText),
          status: current.publishStatus,
        });
        current.publishedPath = `/p/${published.slug}`;
        current.slug = published.slug;
        toast("Pay page published", "success");
        rerender();
      } catch (error) {
        errorHost.replaceChildren(alertBox(error instanceof Error ? error.message : "Could not publish the page.", "error"));
        publish.disabled = false;
      }
    });

    card.append(
      h("p", {
        class: "card-text",
        text: "Store the page in Supabase. Published pages are readable by anyone at /p/slug; drafts and edits stay owner-only through row-level security.",
      }),
      h(
        "div",
        { class: "field-grid" },
        field({ id: "wizard-slug", label: "Page address", control: slugInput, hint: "Lowercase letters, digits and hyphens." }),
        field({ id: "wizard-status", label: "Visibility", control: statusSelect }),
      ),
      errorHost,
      h("div", { class: "action-row" }, publish),
    );
    return card;
  };

  render();
  return root;
}

/* ----------------------------------------------------------------- helpers */

function metaRow(label: string, value: string): HTMLElement {
  return h(
    "div",
    { class: "meta-row" },
    h("dt", { text: label }),
    h("dd", { text: value }),
  );
}

function clampRefLen(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(32, Math.max(0, parsed));
}

function validateDetails(state: WizardState): string[] {
  const errors: string[] = [];
  if (!state.basePayload) errors.push("Load a valid Bangla QR first.");
  if (state.title.trim().length < 1 || state.title.trim().length > 60) {
    errors.push("The page title must be 1–60 characters.");
  }
  if (state.note.trim().length > 160) errors.push("The note must be at most 160 characters.");
  const presetTokens = state.presetsText.split(/[\s,]+/).filter(Boolean);
  if (presetTokens.length > 6) errors.push("Use at most 6 preset amounts.");
  for (const token of presetTokens) {
    if (parseAmountText(token) === null) {
      errors.push(`“${token}” is not a valid preset amount.`);
      break;
    }
  }
  if (state.lockAmount) {
    if (parseAmountText(state.amountText) === null) {
      errors.push("The locked amount must be greater than zero (for example 500 or 1,250.50).");
    }
  }
  if (state.refPrefix && !/^[A-Za-z0-9]{0,16}$/.test(state.refPrefix)) {
    errors.push("The reference prefix may only contain letters and digits (max 16).");
  }
  const refLen = clampRefLen(state.refLenText);
  if (Number.parseInt(state.refLenText, 10) !== refLen && state.refLenText.trim() !== "") {
    errors.push("The reference length must be between 0 and 32.");
  }
  if (state.refPrefix && state.refPrefix.length > refLen && refLen > 0) {
    errors.push("The reference prefix is longer than the reference length.");
  }
  return errors;
}

/** Payload shown on posters: static, or with the locked amount + reference. */
function buildDisplayPayload(state: WizardState): string {
  const amount = state.lockAmount ? parseAmountText(state.amountText) : null;
  if (state.lockAmount && amount !== null) {
    try {
      return withAmount(state.basePayload, amount, {
        reference: currentPosterReference(state),
      });
    } catch {
      return state.basePayload;
    }
  }
  return state.basePayload;
}

function currentPosterReference(state: WizardState): string | null {
  if (!state.lockAmount) return null;
  const refLen = clampRefLen(state.refLenText);
  if (refLen <= 0) return null;
  if (state.posterReference === null) {
    try {
      state.posterReference = newReference({ prefix: state.refPrefix, length: refLen });
    } catch {
      state.posterReference = null;
    }
  }
  return state.posterReference;
}

function previewAttributes(state: WizardState): Record<string, string> {
  const attributes: Record<string, string> = {
    payload: state.basePayload,
    title: state.title,
    theme: currentTheme(),
    size: "300",
  };
  if (state.note) attributes.note = state.note;
  const presets = parsePresets(state.presetsText);
  if (presets.length > 0) attributes.presets = presets.join(",");
  if (state.refPrefix) attributes["ref-prefix"] = state.refPrefix;
  const refLen = clampRefLen(state.refLenText);
  if (refLen > 0) attributes["ref-length"] = String(refLen);
  const amount = state.lockAmount ? parseAmountText(state.amountText) : null;
  if (state.lockAmount && amount !== null) {
    attributes.amount = String(amount);
    attributes["lock-amount"] = "lock-amount";
  }
  return attributes;
}
