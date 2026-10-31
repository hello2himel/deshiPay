/**
 * Hosted invoice page `/i/:token`.
 *
 * Status comes from the invoice edge function in Supabase mode, or from local
 * demo storage in demo mode. "I have paid" records a *claim* — the merchant
 * confirms the payment manually. Nothing here verifies a transaction.
 */
import { withAmount } from "deshiqr";
import {
  emptyState,
  formatDateTime,
  h,
  icon,
  shorten,
  toast,
} from "../lib/dom.ts";
import { withBase } from "../lib/base.ts";
import { DEMO_INVOICE, DEMO_MERCHANT } from "../lib/demo.ts";
import { relativeTime, type InvoiceStatus, type InvoiceView } from "../lib/merchant.ts";
import { downloadBlob, qrSvg, svgToPngBlob } from "../lib/qr.ts";
import { claimInvoice, fetchInvoice, hasSupabase } from "../lib/supabase.ts";
import {
  getLocalInvoice,
  getLocalMerchant,
  saveLocalInvoice,
  updateLocalInvoiceStatus,
} from "../lib/store.ts";
import { taka } from "../lib/amounts.ts";
import { shareLink } from "../lib/dom.ts";
import type { AppContext } from "../types.ts";
import { alertBox } from "../ui.ts";

interface InvoicePageData {
  invoice: InvoiceView;
  payload: string | null;
  merchantSlug: string | null;
  merchantTitle: string | null;
  local: boolean;
  apiQrSvg: string | null;
}

const TXID_RE = /^[A-Za-z0-9._-]{4,64}$/;

function effectiveStatus(invoice: InvoiceView): InvoiceStatus {
  if (invoice.status === "pending" && invoice.expiresAt) {
    const expiry = Date.parse(invoice.expiresAt);
    if (Number.isFinite(expiry) && expiry <= Date.now()) return "expired";
  }
  return invoice.status;
}

function statusTone(status: InvoiceStatus): "ok" | "warn" | "danger" | "accent" | "neutral" {
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

function statusLabel(status: InvoiceStatus): string {
  switch (status) {
    case "paid":
      return "Paid · confirmed";
    case "claimed":
      return "Claimed · awaiting confirmation";
    case "pending":
      return "Pending payment";
    case "expired":
      return "Expired";
    case "canceled":
      return "Canceled";
  }
}

function statusExplanation(status: InvoiceStatus): string {
  switch (status) {
    case "pending":
      return "Scan the QR or open your wallet app and pay the amount. Then come back and press “I have paid” with the transaction id.";
    case "claimed":
      return "Your claim was recorded. The merchant confirms payments manually — this page cannot verify a transaction by itself.";
    case "paid":
      return "The merchant has marked this invoice as paid.";
    case "expired":
      return "This invoice expired before it was paid. Ask the merchant to create a new one.";
    case "canceled":
      return "The merchant canceled this invoice.";
  }
}

export async function invoicePage(ctx: AppContext, route: Extract<import("../lib/router.ts").Route, { name: "invoice" }>): Promise<HTMLElement> {
  const root = h("div", { class: "page" });
  const token = route.token;

  let data: InvoicePageData | null = null;
  let loadError: string | null = null;

  if (hasSupabase(ctx.config)) {
    try {
      const result = await fetchInvoice(ctx.config, token);
      if (result) {
        data = {
          invoice: result.invoice,
          payload: result.payload,
          merchantSlug: result.invoice.merchantSlug,
          merchantTitle: result.invoice.merchantTitle,
          local: false,
          apiQrSvg: result.qrSvg,
        };
      }
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Could not load this invoice.";
    }
  } else {
    const stored = getLocalInvoice(token);
    const invoice: InvoiceView = stored ?? { ...DEMO_INVOICE, token };
    const merchant = getLocalMerchant(invoice.merchantSlug ?? "") ?? DEMO_MERCHANT;
    let payload: string | null = invoice.payload;
    if (!payload) {
      try {
        payload = withAmount(merchant.basePayload, invoice.amount, { reference: invoice.reference });
      } catch {
        payload = null;
      }
    }
    data = {
      invoice: {
        ...invoice,
        merchantSlug: invoice.merchantSlug ?? merchant.slug,
        merchantTitle: invoice.merchantTitle ?? merchant.title,
      },
      payload,
      merchantSlug: invoice.merchantSlug ?? merchant.slug,
      merchantTitle: invoice.merchantTitle ?? merchant.title,
      local: stored === null,
      apiQrSvg: null,
    };
  }

  const paint = (): void => {
    root.replaceChildren();
    if (loadError) {
      root.append(
        h(
          "div",
          { class: "container page-narrow" },
          h(
            "div",
            { class: "card card-pad" },
            emptyState({
              title: "Could not load this invoice",
              body: loadError,
              icon: "alert",
              actions: [h("a", { class: "button button-primary", href: withBase("/", ctx.base) }, "Go home")],
            }),
          ),
        ),
      );
      return;
    }
    if (!data) {
      root.append(
        h(
          "div",
          { class: "container page-narrow" },
          h(
            "div",
            { class: "card card-pad" },
            emptyState({
              title: "Invoice not found",
              body: `No invoice exists for token ${shorten(token, 10, 8)}. Check the link, or ask the merchant for a new one.`,
              icon: "receipt",
              actions: [
                h("a", { class: "button button-primary", href: withBase("/", ctx.base) }, "Go home"),
                h("a", { class: "button button-secondary", href: withBase("/new", ctx.base) }, "Make a pay page"),
              ],
            }),
          ),
        ),
      );
      return;
    }

    const view = data;
    const status = effectiveStatus(view.invoice);
    const shareUrl = globalThis.location?.href ?? "";
    const qrMarkup = view.payload
      ? qrSvg(view.payload, {
          title: `Pay ${taka(view.invoice.amount)} to ${view.merchantTitle ?? "merchant"}`,
          ariaLabel: `Bangla QR code for invoice ${shorten(view.invoice.token, 8, 6)}`,
        })
      : view.apiQrSvg && view.apiQrSvg.trim().startsWith("<svg")
        ? view.apiQrSvg
        : null;

    const notices: HTMLElement[] = [];
    if (view.local) {
      notices.push(
        alertBox(
          "Demo invoice — synthetic data, stored in this browser only. In a hosted deployment this page is fed by the invoice edge function and the merchant confirms payment manually.",
          "info",
        ),
      );
    }

    const claimForm =
      status === "pending"
        ? buildClaimForm(ctx, view, token, async (txid) => {
            if (hasSupabase(ctx.config)) {
              const result = await claimInvoice(ctx.config, token, txid);
              if (result === "expired") {
                view.invoice = { ...view.invoice, status: "expired" };
              } else {
                view.invoice = { ...view.invoice, status: "claimed", txid, claimedAt: new Date().toISOString() };
              }
            } else {
              const stored = getLocalInvoice(token);
              if (stored) updateLocalInvoiceStatus(token, "claimed", { txid });
              else saveLocalInvoice({ ...view.invoice, status: "claimed", txid, claimedAt: new Date().toISOString(), payload: view.payload });
              view.invoice = { ...view.invoice, status: "claimed", txid, claimedAt: new Date().toISOString() };
            }
            toast("Claim recorded — the merchant will confirm the payment.", "success");
            paint();
          })
        : null;

    const qrBlock = qrMarkup
      ? h(
          "div",
          { class: "qr-frame invoice-qr" },
          h("div", { class: "qr-inner", html: qrMarkup }),
          h("p", { class: "qr-caption", text: "Scan with bKash or any Bangla QR app" }),
        )
      : h("p", {
          class: "invoice-no-qr",
          text: "The QR is no longer shown for this invoice. Ask the merchant for a fresh link if you still need to pay.",
        });

    const statusBlock = h(
      "div",
      { class: `invoice-status invoice-status-${status}` },
      h("div", { class: "invoice-status-head" }, h("span", { text: "Status" }), badgeFor(status)),
      h("p", { class: "invoice-status-text", text: statusExplanation(status) }),
      view.invoice.claimedAt && status === "claimed"
        ? h("p", { class: "invoice-status-meta", text: `Claimed ${formatDateTime(view.invoice.claimedAt)}` })
        : null,
      view.invoice.paidAt && status === "paid"
        ? h("p", { class: "invoice-status-meta", text: `Confirmed ${formatDateTime(view.invoice.paidAt)}` })
        : null,
      view.invoice.expiresAt && status === "pending"
        ? h("p", { class: "invoice-status-meta", text: `Expires ${formatDateTime(view.invoice.expiresAt)}` })
        : null,
    );

    const actions = h(
      "div",
      { class: "action-row" },
      qrMarkup
        ? downloadButton("Save QR", async () => {
            const blob = await svgToPngBlob(qrMarkup, 1024);
            downloadBlob(blob, `deshiqr-invoice-${shorten(view.invoice.token, 6, 4)}.png`);
            toast("QR PNG downloaded", "success");
          })
        : null,
      h(
        "button",
        {
          class: "button button-secondary button-small",
          attrs: { type: "button" },
          on: {
            click: async () => {
              const result = await shareLink({
                title: `Invoice ${taka(view.invoice.amount)}`,
                url: shareUrl,
              });
              toast(result === "failed" ? "Could not share the link." : "Invoice link shared.", result === "failed" ? "error" : "success");
            },
          },
        },
        icon("share"),
        "Share invoice",
      ),
      view.merchantSlug
        ? h(
            "a",
            { class: "button button-ghost button-small", href: withBase(`/p/${view.merchantSlug}`, ctx.base) },
            "Merchant pay page",
            icon("arrow-right"),
          )
        : null,
    );

    root.append(
      h(
        "div",
        { class: "container pay-page" },
        h(
          "div",
          { class: "pay-topline" },
          h("a", { class: "back-link", href: withBase("/", ctx.base) }, icon("arrow-left"), "deshiQR"),
          h("span", { class: "pay-topline-meta", text: `Invoice · ${shorten(token, 8, 6)}` }),
        ),
        ...notices,
        h(
          "div",
          { class: "invoice-shell" },
          h(
            "section",
            { class: "card invoice-main" },
            h(
              "div",
              { class: "invoice-head" },
              h("p", { class: "eyebrow", text: "Payment request" }),
              badgeFor(status),
            ),
            h("p", { class: "invoice-amount", text: taka(view.invoice.amount) }),
            h(
              "div",
              { class: "invoice-meta" },
              h(
                "div",
                { class: "invoice-meta-item" },
                h("span", { class: "invoice-meta-label", text: "Bill no. / reference" }),
                h("code", { class: "ref-code", text: view.invoice.reference || "—" }),
              ),
              h(
                "div",
                { class: "invoice-meta-item" },
                h("span", { class: "invoice-meta-label", text: "Merchant" }),
                h("span", { class: "invoice-meta-value", text: view.merchantTitle ?? view.merchantSlug ?? "—" }),
              ),
              view.invoice.note
                ? h(
                    "div",
                    { class: "invoice-meta-item invoice-meta-wide" },
                    h("span", { class: "invoice-meta-label", text: "Note" }),
                    h("span", { class: "invoice-meta-value", text: view.invoice.note }),
                  )
                : null,
              view.invoice.createdAt
                ? h(
                    "div",
                    { class: "invoice-meta-item" },
                    h("span", { class: "invoice-meta-label", text: "Created" }),
                    h("span", { class: "invoice-meta-value", text: relativeTime(view.invoice.createdAt) }),
                  )
                : null,
            ),
            statusBlock,
            claimForm,
          ),
          h(
            "aside",
            { class: "card invoice-side" },
            h("h2", { class: "invoice-side-title", text: "Pay by scanning" }),
            qrBlock,
            actions,
            h("p", {
              class: "card-small",
              text: "This is a payment request, not a payment gateway. The merchant confirms every payment manually; a claim is not proof of payment.",
            }),
          ),
        ),
      ),
    );
  };

  paint();
  return root;
}

function buildClaimForm(
  ctx: AppContext,
  view: InvoicePageData,
  token: string,
  onSubmit: (txid: string) => Promise<void>,
): HTMLElement {
  const input = h("input", {
    class: "input",
    attrs: {
      id: "claim-txid",
      name: "txid",
      type: "text",
      placeholder: "e.g. 8N7A2K9QZ1",
      autocomplete: "off",
      spellcheck: "false",
      maxlength: "64",
      "aria-describedby": "claim-hint claim-error",
    },
  });
  const error = h("p", { class: "field-error", attrs: { id: "claim-error", role: "alert" }, hidden: true });
  const submit = h(
    "button",
    { class: "button button-primary", attrs: { type: "submit" } },
    icon("check"),
    "I have paid",
  );

  const form = h(
    "form",
    { class: "claim-form" },
    h("h2", { class: "claim-title", text: "Already paid? Tell the merchant." }),
    h("p", {
      class: "claim-text",
      text: "Enter the transaction id from your bKash/wallet app. The merchant confirms it manually — this page cannot verify your payment.",
    }),
    h(
      "div",
      { class: "claim-row" },
      h(
        "div",
        { class: "field claim-field" },
        h("label", { class: "field-label", attrs: { for: "claim-txid" }, text: "Transaction id (txid)" }),
        input,
        h("p", {
          class: "field-hint",
          attrs: { id: "claim-hint" },
          text: "4–64 characters: letters, digits, dots, dashes or underscores.",
        }),
        error,
      ),
      submit,
    ),
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.hidden = true;
    const txid = input.value.trim();
    if (!TXID_RE.test(txid)) {
      error.textContent = "Enter a transaction id of 4–64 letters, digits, dots, dashes or underscores.";
      error.hidden = false;
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }
    input.removeAttribute("aria-invalid");
    submit.disabled = true;
    try {
      await onSubmit(txid);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not record your claim.";
      error.textContent = message;
      error.hidden = false;
      toast(message, "error");
    } finally {
      submit.disabled = false;
    }
  });

  return form;
}

function badgeFor(status: InvoiceStatus): HTMLSpanElement {
  return h(
    "span",
    { class: `badge badge-${statusTone(status)}`, text: statusLabel(status) },
  );
}

function downloadButton(label: string, onClick: () => Promise<void>): HTMLButtonElement {
  const button = h(
    "button",
    { class: "button button-secondary button-small", attrs: { type: "button" } },
    icon("download"),
    label,
  );
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await onClick();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Download failed.", "error");
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

export type { InvoicePageData };
