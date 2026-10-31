/**
 * Merchant dashboard.
 *
 * Demo mode lists local merchants/invoices from this browser. Supabase mode is
 * auth-gated and owner-scoped by RLS; invoice creation goes through the edge
 * function, confirmation is a manual "mark paid".
 */
import { emptyState, h, icon, shorten, toast } from "../lib/dom.ts";
import { absoluteUrl, withBase } from "../lib/base.ts";
import { parseAmountText, parsePresets, taka } from "../lib/amounts.ts";
import { DEMO_INVOICE, DEMO_MERCHANT } from "../lib/demo.ts";
import {
  relativeTime as merchantRelativeTime,
  type InvoiceStatus,
  type InvoiceView,
  type MerchantView,
} from "../lib/merchant.ts";
import { buildPosterSvg } from "../lib/poster.ts";
import { downloadPosterPng, downloadSvg, qrSvg } from "../lib/qr.ts";
import {
  createInvoice,
  deleteMerchant,
  hasSupabase,
  listMyInvoices,
  listMyMerchants,
  markInvoicePaid,
  signOut,
  updateMerchant,
} from "../lib/supabase.ts";
import {
  createLocalInvoice,
  deleteLocalMerchant,
  getLocalInvoice,
  listLocalInvoices,
  listLocalMerchants,
  saveLocalInvoice,
  saveLocalMerchant,
  updateLocalInvoiceStatus,
} from "../lib/store.ts";
import type { AppContext } from "../types.ts";
import {
  alertBox,
  codeBlock,
  copyButton,
  embedSnippet,
  field,
  ghostButton,
  input,
  pageHeader,
  primaryLink,
  select,
  textarea,
} from "../ui.ts";

interface DashboardState {
  merchants: MerchantView[];
  invoices: InvoiceView[];
  loadError: string | null;
  editingSlug: string | null;
  embedSlug: string | null;
  lastInvoice: InvoiceView | null;
}

function invoiceStatus(invoice: InvoiceView): InvoiceStatus {
  return invoice.status;
}

function statusTone(status: string): "ok" | "warn" | "danger" | "accent" | "neutral" {
  switch (status) {
    case "published":
      return "ok";
    case "draft":
      return "warn";
    case "suspended":
      return "danger";
    default:
      return "neutral";
  }
}

function invoiceTone(status: InvoiceStatus): "ok" | "warn" | "danger" | "accent" | "neutral" {
  switch (status) {
    case "paid":
      return "ok";
    case "claimed":
      return "accent";
    case "pending":
      return "warn";
    case "expired":
    case "canceled":
      return "danger";
  }
}

export async function dashboardPage(ctx: AppContext): Promise<HTMLElement> {
  const supabase = hasSupabase(ctx.config);
  if (supabase && !ctx.session) return authGate(ctx);

  const root = h("div", { class: "page" });
  const state: DashboardState = {
    merchants: [],
    invoices: [],
    loadError: null,
    editingSlug: null,
    embedSlug: null,
    lastInvoice: null,
  };

  const load = async (): Promise<void> => {
    state.loadError = null;
    try {
      if (supabase) {
        const [merchants, invoices] = await Promise.all([
          listMyMerchants(ctx.config),
          listMyInvoices(ctx.config),
        ]);
        state.merchants = merchants;
        state.invoices = invoices;
      } else {
        state.merchants = listLocalMerchants();
        state.invoices = listLocalInvoices();
      }
    } catch (error) {
      state.loadError = error instanceof Error ? error.message : "Could not load the dashboard.";
    }
  };

  const refresh = async (): Promise<void> => {
    await load();
    paint();
  };

  const paint = (): void => {
    root.replaceChildren();
    const pendingCount = state.invoices.filter((invoice) => invoice.status === "pending").length;
    const publishedCount = state.merchants.filter((merchant) => merchant.status === "published").length;

    const headerActions: HTMLElement[] = [
      ghostButton("Refresh", () => {
        void refresh();
      }, "spark"),
      primaryLink(withBase("/new", ctx.base), "New pay page", "plus"),
    ];
    const emptyMerchantActions: HTMLElement[] = [
      primaryLink(withBase("/new", ctx.base), "Build a pay page", "arrow-right"),
    ];
    if (!supabase) emptyMerchantActions.push(loadDemoButton(ctx, refresh));
    if (supabase) headerActions.push(signOutButton(ctx));

    root.append(
      h(
        "div",
        { class: "container dash-page" },
        pageHeader({
          eyebrow: supabase ? "Merchant dashboard" : "Demo dashboard",
          title: "Your pay pages",
          lede: supabase
            ? `Signed in as ${ctx.session?.user.email ?? "merchant"}. Hosted pages and invoices are stored in Supabase, protected by row-level security.`
            : "Demo mode: everything here is stored in this browser. Configure Supabase to publish hosted pages that anyone can open.",
          actions: headerActions,
        }),
        state.loadError ? alertBox(state.loadError, "error") : null,
        h(
          "div",
          { class: "stat-grid" },
          statCard("Pay pages", String(state.merchants.length), "Created on this account"),
          statCard("Published", String(publishedCount), "Visible to payers"),
          statCard("Pending invoices", String(pendingCount), "Waiting for manual confirmation"),
        ),
        h(
          "section",
          { class: "dash-section" },
          h(
            "div",
            { class: "section-bar" },
            h("h2", { class: "section-bar-title", text: "Pay pages" }),
            h(
              "div",
              { class: "action-row" },
              !supabase && state.merchants.length === 0 ? loadDemoButton(ctx, refresh) : null,
              primaryLink(withBase("/new", ctx.base), "New", "plus"),
            ),
          ),
          state.merchants.length === 0
            ? h(
                "div",
                { class: "card card-pad" },
                emptyState({
                  icon: "store",
                  title: "No pay pages yet",
                  body: supabase
                    ? "Create your first hosted pay page from the wizard, then publish it here."
                    : "In demo mode a pay page lives in this browser. Build one from the wizard, or load the synthetic demo shop.",
                  actions: emptyMerchantActions,
                }),
              )
            : h(
                "div",
                { class: "stack" },
                ...state.merchants.map((merchant) => merchantCard(ctx, merchant, state, refresh)),
              ),
        ),
        invoiceSection(ctx, state, refresh, supabase),
        h(
          "section",
          { class: "dash-section" },
          h("div", { class: "section-bar" }, h("h2", { class: "section-bar-title", text: "How confirmation works" })),
          h(
            "div",
            { class: "card card-pad stack" },
            h("p", {
              class: "card-text",
              text: "“I have paid” on an invoice page only records the customer's claim with a transaction id. It is not proof of payment: mark an invoice paid only after you have seen the money in your bKash/wallet app.",
            }),
            h("p", {
              class: "card-small",
              text: "This keeps deshiQR out of the payment path — no fund custody, no payment gateway, no risk of a false confirmation from a screenshot.",
            }),
          ),
        ),
      ),
    );
  };

  await load();
  paint();
  return root;
}

function authGate(ctx: AppContext): HTMLElement {
  return h(
    "div",
    { class: "container page-narrow" },
    h(
      "div",
      { class: "card card-pad" },
      emptyState({
        icon: "shield",
        title: "Sign in to manage your pay pages",
        body: "The dashboard uses Supabase Auth. Your published pages are readable by anyone at /p/your-shop; editing, posters and invoice confirmation stay owner-only.",
        actions: [
          primaryLink(withBase("/login", ctx.base), "Sign in with a magic link", "link"),
          h("a", { class: "button button-ghost", href: withBase("/", ctx.base) }, "Back to the demo"),
        ],
      }),
    ),
  );
}

function statCard(label: string, value: string, hint: string): HTMLElement {
  return h(
    "div",
    { class: "stat-card" },
    h("p", { class: "stat-label", text: label }),
    h("p", { class: "stat-value", text: value }),
    h("p", { class: "stat-hint", text: hint }),
  );
}

function loadDemoButton(ctx: AppContext, refresh: () => Promise<void>): HTMLButtonElement {
  const button = h(
    "button",
    { class: "button button-secondary button-small", attrs: { type: "button" } },
    icon("spark"),
    "Load demo data",
  );
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      saveLocalMerchant(DEMO_MERCHANT);
      saveLocalInvoice(DEMO_INVOICE);
      toast("Synthetic demo shop loaded into this browser", "success");
      await refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not load demo data.", "error");
      button.disabled = false;
    }
  });
  return button;
}

function signOutButton(ctx: AppContext): HTMLButtonElement {
  const button = h(
    "button",
    { class: "button button-secondary button-small", attrs: { type: "button" } },
    icon("logout"),
    "Sign out",
  );
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await signOut(ctx.config);
      toast("Signed out", "success");
      await ctx.reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not sign out.", "error");
      button.disabled = false;
    }
  });
  return button;
}

function merchantCard(
  ctx: AppContext,
  merchant: MerchantView,
  state: DashboardState,
  refresh: () => Promise<void>,
): HTMLElement {
  const payPath = withBase(`/p/${merchant.slug}`, ctx.base);
  const payUrl = absoluteUrl(`/p/${merchant.slug}`, ctx.base, ctx.origin);
  const card = h("article", { class: "dash-card" });
  const extras = h("div", { class: "dash-extras", hidden: true });

  const embedCode = embedSnippet({
    payload: merchant.basePayload,
    title: merchant.title,
    note: merchant.note,
    presets: merchant.presets,
    refPrefix: merchant.refPrefix,
    refLen: merchant.refLen,
  });

  const toggleExtras = (kind: "edit" | "embed"): void => {
    if (kind === "edit") {
      state.editingSlug = state.editingSlug === merchant.slug ? null : merchant.slug;
      state.embedSlug = null;
    } else {
      state.embedSlug = state.embedSlug === merchant.slug ? null : merchant.slug;
      state.editingSlug = null;
    }
    extras.hidden = state.editingSlug !== merchant.slug && state.embedSlug !== merchant.slug;
    extras.replaceChildren(
      ...(state.editingSlug === merchant.slug ? [editForm(ctx, merchant, refresh)] : []),
      ...(state.embedSlug === merchant.slug
        ? [codeBlock(embedCode, { label: `Embed ${merchant.slug}`, copy: true })]
        : []),
    );
  };

  const statusBadge = h("span", {
    class: `badge badge-${statusTone(merchant.status)}`,
    text: merchant.status === "published" ? "Published" : merchant.status === "draft" ? "Draft" : "Suspended",
  });

  card.append(
    h(
      "div",
      { class: "dash-card-head" },
      h(
        "div",
        { class: "dash-card-title" },
        h("h3", { text: merchant.title }),
        h(
          "a",
          { class: "dash-slug", href: payPath },
          icon("external"),
          `/p/${merchant.slug}`,
        ),
      ),
      h(
        "div",
        { class: "dash-card-badges" },
        statusBadge,
        merchant.verified ? h("span", { class: "badge badge-accent", text: "Verified" }) : null,
      ),
    ),
    ...(merchant.note ? [h("p", { class: "dash-note", text: merchant.note })] : []),
    h(
      "div",
      { class: "dash-meta" },
      h("span", { class: "dash-meta-item" }, h("strong", { text: "Account " }), merchant.accountMasked ?? "—"),
      h("span", { class: "dash-meta-item" }, h("strong", { text: "City " }), merchant.city ?? "—"),
      h(
        "span",
        { class: "dash-meta-item" },
        h("strong", { text: "Presets " }),
        merchant.presets.length > 0 ? merchant.presets.map((amount) => `৳${amount}`).join(" · ") : "none",
      ),
      h(
        "span",
        { class: "dash-meta-item" },
        h("strong", { text: "Reference " }),
        merchant.refLen > 0 ? `${merchant.refPrefix || "random"} · ${merchant.refLen} chars` : "none",
      ),
    ),
    h(
      "div",
      { class: "action-row dash-actions" },
      h("a", { class: "button button-primary button-small", href: payPath }, "Open page", icon("arrow-right")),
      copyButton(payUrl, "Copy link"),
      ghostButton("Poster PNG", () => {
        void downloadPoster(ctx, merchant, "png");
      }, "printer"),
      ghostButton("Poster SVG", () => {
        void downloadPoster(ctx, merchant, "svg");
      }, "download"),
      ghostButton("Embed", () => toggleExtras("embed"), "embed"),
      ghostButton("Edit", () => toggleExtras("edit"), "edit"),
      ghostButton("Delete", async () => {
        if (!globalThis.confirm?.(`Delete the pay page “${merchant.title}”? The link will stop working.`)) return;
        try {
          if (hasSupabase(ctx.config)) await deleteMerchant(ctx.config, merchant.slug);
          else deleteLocalMerchant(merchant.slug);
          toast("Pay page deleted", "success");
          await refresh();
        } catch (error) {
          toast(error instanceof Error ? error.message : "Could not delete the pay page.", "error");
        }
      }, "trash"),
    ),
    extras,
  );
  return card;
}

function editForm(ctx: AppContext, merchant: MerchantView, refresh: () => Promise<void>): HTMLElement {
  const title = input({ id: `edit-title-${merchant.slug}`, value: merchant.title, maxLength: 60 });
  const note = textarea({ id: `edit-note-${merchant.slug}`, value: merchant.note, rows: 2, maxLength: 160 });
  const presets = input({
    id: `edit-presets-${merchant.slug}`,
    value: merchant.presets.join(","),
    placeholder: "100,500,1000",
  });
  const refPrefix = input({ id: `edit-prefix-${merchant.slug}`, value: merchant.refPrefix, maxLength: 16 });
  const refLen = input({
    id: `edit-reflen-${merchant.slug}`,
    type: "number",
    value: String(merchant.refLen),
  });
  const status = select({
    id: `edit-status-${merchant.slug}`,
    choices: [
      { value: "published", label: "Published" },
      { value: "draft", label: "Draft (not public)" },
      { value: "suspended", label: "Suspended" },
    ],
    value: merchant.status,
  });
  const error = h("div", { class: "form-error", hidden: true });
  const save = h(
    "button",
    { class: "button button-primary button-small", attrs: { type: "submit" } },
    icon("check"),
    "Save changes",
  );

  const form = h(
    "form",
    { class: "edit-form" },
    h("h4", { class: "edit-title", text: `Edit ${merchant.slug}` }),
    h(
      "div",
      { class: "field-grid" },
      field({ id: `edit-title-${merchant.slug}`, label: "Title", control: title, hint: "1–60 characters." }),
      field({ id: `edit-prefix-${merchant.slug}`, label: "Reference prefix", control: refPrefix, hint: "Letters and digits, up to 16." }),
      field({ id: `edit-reflen-${merchant.slug}`, label: "Reference length", control: refLen, hint: "0 = no reference. 25 matches real bKash dynamic QRs." }),
      field({ id: `edit-status-${merchant.slug}`, label: "Status", control: status }),
      h("div", { class: "field-grid-wide" }, field({ id: `edit-note-${merchant.slug}`, label: "Note", control: note, hint: "Up to 160 characters." })),
      h("div", { class: "field-grid-wide" }, field({ id: `edit-presets-${merchant.slug}`, label: "Preset amounts", control: presets, hint: "Up to 6 comma-separated amounts." })),
    ),
    error,
    h("div", { class: "action-row" }, save),
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.hidden = true;
    const nextTitle = title.value.trim();
    if (nextTitle.length < 1 || nextTitle.length > 60) {
      error.textContent = "Title must be 1–60 characters.";
      error.hidden = false;
      return;
    }
    if (note.value.trim().length > 160) {
      error.textContent = "Note must be at most 160 characters.";
      error.hidden = false;
      return;
    }
    const nextPresets = parsePresets(presets.value);
    const nextRefLen = Number.parseInt(refLen.value, 10);
    if (!Number.isFinite(nextRefLen) || nextRefLen < 0 || nextRefLen > 32) {
      error.textContent = "Reference length must be between 0 and 32.";
      error.hidden = false;
      return;
    }
    if (merchant.refLen > 0 && refPrefix.value && !/^[A-Za-z0-9]{0,16}$/.test(refPrefix.value.trim())) {
      error.textContent = "Reference prefix may only contain letters and digits (max 16).";
      error.hidden = false;
      return;
    }
    save.disabled = true;
    try {
      const patch = {
        title: nextTitle,
        note: note.value.trim(),
        presets: nextPresets,
        refPrefix: refPrefix.value.trim(),
        refLen: nextRefLen,
        status: status.value as "draft" | "published" | "suspended",
      };
      if (hasSupabase(ctx.config)) {
        await updateMerchant(ctx.config, merchant.slug, patch);
      } else {
        saveLocalMerchant({ ...merchant, ...patch });
      }
      toast("Pay page updated", "success");
      await refresh();
    } catch (cause) {
      error.textContent = cause instanceof Error ? cause.message : "Could not save changes.";
      error.hidden = false;
      save.disabled = false;
    }
  });

  return form;
}

async function downloadPoster(ctx: AppContext, merchant: MerchantView, format: "png" | "svg"): Promise<void> {
  try {
    const qrMarkup = qrSvg(merchant.basePayload, { title: merchant.title });
    const poster = buildPosterSvg({
      qrSvg: qrMarkup,
      title: merchant.title,
      merchantName: merchant.name,
      note: merchant.note,
      city: merchant.city,
      accountMasked: merchant.accountMasked,
      amount: null,
      payUrl: absoluteUrl(`/p/${merchant.slug}`, ctx.base, ctx.origin),
      verified: merchant.verified,
    });
    if (format === "svg") {
      downloadSvg(poster, `deshiqr-poster-${merchant.slug}.svg`);
    } else {
      await downloadPosterPng(poster, `deshiqr-poster-${merchant.slug}.png`);
    }
    toast(`Poster ${format.toUpperCase()} downloaded`, "success");
  } catch (error) {
    toast(error instanceof Error ? error.message : "Could not build the poster.", "error");
  }
}

function invoiceSection(
  ctx: AppContext,
  state: DashboardState,
  refresh: () => Promise<void>,
  supabase: boolean,
): HTMLElement {
  return h(
    "section",
    { class: "dash-section" },
    h(
      "div",
      { class: "section-bar" },
      h("h2", { class: "section-bar-title", text: "Invoices" }),
      h(
        "div",
        { class: "action-row" },
        h("span", {
          class: "section-bar-hint",
          text: supabase
            ? "Created through the invoice edge function."
            : "Demo invoices are stored in this browser.",
        }),
      ),
    ),
    invoiceCreateCard(ctx, state, refresh, supabase),
    state.lastInvoice ? createdInvoiceCard(ctx, state.lastInvoice) : null,
    state.invoices.length === 0
      ? h(
          "div",
          { class: "card card-pad" },
          emptyState({
            icon: "receipt",
            title: "No invoices yet",
            body: "Create a token-addressed invoice above. Share its link; the customer can claim “I have paid”, and you confirm manually once the money is in your wallet.",
          }),
        )
      : h(
          "div",
          { class: "invoice-list" },
          ...state.invoices.map((invoice) => invoiceRow(ctx, invoice, refresh)),
        ),
  );
}

function invoiceCreateCard(
  ctx: AppContext,
  state: DashboardState,
  refresh: () => Promise<void>,
  supabase: boolean,
): HTMLElement {
  const merchantSelect = select({
    id: "invoice-merchant",
    choices:
      state.merchants.length > 0
        ? state.merchants.map((merchant) => ({ value: merchant.slug, label: merchant.title }))
        : [{ value: "", label: "Create a pay page first" }],
  });
  const amount = input({ id: "invoice-amount", inputMode: "decimal", placeholder: "500" });
  const note = input({ id: "invoice-note", placeholder: "Optional note for the customer", maxLength: 160 });
  const reference = input({ id: "invoice-reference", placeholder: "Optional reference (generated if blank)", maxLength: 32 });
  const expiry = select({
    id: "invoice-expiry",
    choices: [
      { value: "1800", label: "30 minutes" },
      { value: "7200", label: "2 hours" },
      { value: "86400", label: "24 hours" },
    ],
    value: "1800",
  });
  const error = h("div", { class: "form-error", hidden: true });
  const submit = h(
    "button",
    { class: "button button-primary", attrs: { type: "submit" } },
    icon("plus"),
    "Create invoice",
  );
  if (state.merchants.length === 0) submit.disabled = true;

  const form = h(
    "form",
    { class: "card card-pad invoice-create" },
    h("h3", { class: "card-title", text: "New invoice" }),
    h("p", {
      class: "card-small",
      text: "Locks an amount and a bill number into a dynamic Bangla QR. The customer sees the invoice; you confirm the payment manually.",
    }),
    h(
      "div",
      { class: "field-grid" },
      field({ id: "invoice-merchant", label: "Pay page", control: merchantSelect }),
      field({ id: "invoice-amount", label: "Amount (BDT)", control: amount, hint: "Up to ৳99,999,999.99." }),
      field({ id: "invoice-note", label: "Note", control: note }),
      field({ id: "invoice-reference", label: "Reference", control: reference, hint: "1–32 printable ASCII characters." }),
      field({ id: "invoice-expiry", label: "Expires in", control: expiry }),
    ),
    error,
    h("div", { class: "action-row" }, submit),
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.hidden = true;
    const merchant = state.merchants.find((item) => item.slug === merchantSelect.value);
    if (!merchant) {
      error.textContent = "Create a pay page before creating invoices.";
      error.hidden = false;
      return;
    }
    const parsedAmount = parseAmountText(amount.value);
    if (parsedAmount === null) {
      error.textContent = "Enter an amount greater than zero (for example 500 or 1,250.50).";
      error.hidden = false;
      amount.focus();
      return;
    }
    submit.disabled = true;
    try {
      if (supabase) {
        const result = await createInvoice(ctx.config, {
          merchant: merchant.slug,
          amount: parsedAmount,
          note: note.value.trim(),
          reference: reference.value.trim(),
          expiresInSeconds: Number.parseInt(expiry.value, 10),
        });
        state.lastInvoice = result.invoice;
      } else {
        state.lastInvoice = createLocalInvoice({
          merchant,
          amount: parsedAmount,
          note: note.value.trim(),
          reference: reference.value.trim(),
        });
      }
      toast("Invoice created", "success");
      await refresh();
    } catch (cause) {
      error.textContent = cause instanceof Error ? cause.message : "Could not create the invoice.";
      error.hidden = false;
      submit.disabled = false;
    }
  });

  return form;
}

function createdInvoiceCard(ctx: AppContext, invoice: InvoiceView): HTMLElement {
  const path = withBase(`/i/${invoice.token}`, ctx.base);
  const url = absoluteUrl(`/i/${invoice.token}`, ctx.base, ctx.origin);
  return h(
    "div",
    { class: "card card-pad created-invoice" },
    h(
      "div",
      { class: "created-invoice-head" },
      h("div", null, h("p", { class: "eyebrow", text: "Invoice created" }), h("p", { class: "created-amount", text: taka(invoice.amount) })),
      h("span", { class: "badge badge-warn", text: "Pending payment" }),
    ),
    h("p", { class: "card-small", text: `Reference ${invoice.reference} · link below can be shared with the customer.` }),
    h(
      "div",
      { class: "action-row" },
      h("a", { class: "button button-primary button-small", href: path }, "Open invoice", icon("arrow-right")),
      copyButton(url, "Copy invoice link"),
    ),
  );
}

function invoiceRow(
  ctx: AppContext,
  invoice: InvoiceView,
  refresh: () => Promise<void>,
): HTMLElement {
  const path = withBase(`/i/${invoice.token}`, ctx.base);
  const url = absoluteUrl(`/i/${invoice.token}`, ctx.base, ctx.origin);
  const status = invoiceStatus(invoice);
  const canMarkPaid = status === "pending" || status === "claimed";

  const markPaid = h(
    "button",
    { class: "button button-secondary button-small", attrs: { type: "button" } },
    icon("check"),
    "Mark paid",
  );
  markPaid.addEventListener("click", async () => {
    if (!globalThis.confirm?.("Mark this invoice as paid? Only do this after the money is in your wallet.")) return;
    markPaid.disabled = true;
    try {
      if (hasSupabase(ctx.config)) await markInvoicePaid(ctx.config, invoice.token);
      else {
        if (getLocalInvoice(invoice.token)) updateLocalInvoiceStatus(invoice.token, "paid");
        else saveLocalInvoice({ ...invoice, status: "paid", paidAt: new Date().toISOString() });
      }
      toast("Invoice marked paid", "success");
      await refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not update the invoice.", "error");
      markPaid.disabled = false;
    }
  });

  return h(
    "div",
    { class: "invoice-row" },
    h(
      "div",
      { class: "invoice-row-main" },
      h("span", { class: "invoice-row-amount", text: taka(invoice.amount) }),
      h("code", { class: "invoice-row-ref", text: shorten(invoice.reference, 12, 6) }),
      h("span", {
        class: "invoice-row-meta",
        text: `${invoice.merchantTitle ?? "Pay page"} · ${merchantRelativeTime(invoice.createdAt)}`,
      }),
    ),
    h("span", { class: `badge badge-${invoiceTone(status)}`, text: status }),
    h(
      "div",
      { class: "action-row invoice-row-actions" },
      h("a", { class: "button button-ghost button-small", href: path }, "Open"),
      copyButton(url, "Copy"),
      canMarkPaid ? markPaid : null,
    ),
  );
}
