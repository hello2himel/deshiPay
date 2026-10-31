/**
 * Hosted pay page: `/p/:slug` (and `/@:slug`), plus the self-contained
 * `#p=<payload>&t=…` demo link.
 */
import { decodeSafe, institutionOf, maskAccount, referenceFrom } from "deshiqr";
import { emptyState, h, icon, toast } from "../lib/dom.ts";
import { absoluteUrl, withBase } from "../lib/base.ts";
import { DEMO_MERCHANT, DEMO_SLUG } from "../lib/demo.ts";
import { buildPosterSvg } from "../lib/poster.ts";
import { downloadPosterPng, downloadSvg, qrSvg } from "../lib/qr.ts";
import { hasSupabase, fetchPublicMerchant } from "../lib/supabase.ts";
import { getLocalMerchant } from "../lib/store.ts";
import { shareLink } from "../lib/dom.ts";
import { currentTheme } from "../lib/theme.ts";
import type { InlinePayLink } from "../lib/links.ts";
import type { AppContext } from "../types.ts";
import { alertBox, copyButton, primaryLink } from "../ui.ts";

interface PayData {
  payload: string;
  title: string;
  note: string;
  presets: number[];
  amount: number | null;
  refPrefix: string;
  refLen: number;
  merchantName: string | null;
  city: string | null;
  accountMasked: string | null;
  verified: boolean;
  slug: string | null;
  hosted: boolean;
}

export async function payPage(ctx: AppContext, route: Extract<import("../lib/router.ts").Route, { name: "pay" | "inline" }>): Promise<HTMLElement> {
  const page = h("div", { class: "page" });

  if (route.name === "inline") {
    page.append(payView(ctx, inlineData(route.link), { selfContained: true }));
    return page;
  }

  const slug = route.slug;

  // Local mode: look in this browser first, then fall back to the demo shop.
  if (!hasSupabase(ctx.config)) {
    const local =
      getLocalMerchant(slug) ?? (slug === DEMO_SLUG ? DEMO_MERCHANT : null);
    if (!local) {
      page.append(
        notFoundView(
          ctx,
          `No pay page called “${slug}” is saved in this browser.`,
          "Hosted pay pages need Supabase configured for this deployment. The demo dashboard stores pages locally on this device only.",
        ),
      );
      return page;
    }
    page.append(
      payView(
        ctx,
        {
          payload: local.basePayload,
          title: local.title,
          note: local.note,
          presets: local.presets,
          amount: null,
          refPrefix: local.refPrefix,
          refLen: local.refLen,
          merchantName: local.name,
          city: local.city,
          accountMasked: local.accountMasked,
          verified: local.verified,
          slug: local.slug,
          hosted: true,
        },
        { local: true },
      ),
    );
    return page;
  }

  // Supabase mode: public merchant read.
  let merchant;
  try {
    merchant = await fetchPublicMerchant(ctx.config, slug);
  } catch (error) {
    page.append(
      notFoundView(
        ctx,
        "The pay page could not be loaded.",
        error instanceof Error ? error.message : "Please try again in a moment.",
      ),
    );
    return page;
  }
  if (!merchant) {
    page.append(notFoundView(ctx, `No published pay page called “${slug}”.`, "Check the link, or ask the merchant for the current address."));
    return page;
  }
  page.append(
    payView(
      ctx,
      {
        payload: merchant.basePayload,
        title: merchant.title,
        note: merchant.note,
        presets: merchant.presets,
        amount: null,
        refPrefix: merchant.refPrefix,
        refLen: merchant.refLen,
        merchantName: merchant.name,
        city: merchant.city,
        accountMasked: merchant.accountMasked,
        verified: merchant.verified,
        slug: merchant.slug,
        hosted: true,
      },
      {},
    ),
  );
  return page;
}

/** Build pay data from a self-contained inline link. */
export function inlineData(link: InlinePayLink): PayData {
  const decoded = decodeSafe(link.payload);
  const qr = decoded.ok ? decoded.qr : null;
  return {
    payload: link.payload,
    title: link.title || qr?.merchant.name || "Bangla QR payment",
    note: link.note,
    presets: link.presets,
    amount: link.amount,
    refPrefix: link.refPrefix,
    refLen: link.refLen,
    merchantName: qr?.merchant.name ?? null,
    city: qr?.merchant.city ?? null,
    accountMasked: qr ? maskAccount(qr.merchant.account) : null,
    verified: qr ? institutionOf(qr)?.verified === true : false,
    slug: null,
    hosted: false,
  };
}

function payView(
  ctx: AppContext,
  data: PayData,
  options: { selfContained?: boolean; local?: boolean } = {},
): HTMLElement {
  const decoded = decodeSafe(data.payload);
  const qr = decoded.ok ? decoded.qr : null;
  const institution = qr ? institutionOf(qr) : null;
  const title = data.title || qr?.merchant.name || "Bangla QR payment";
  const account = data.accountMasked ?? (qr ? maskAccount(qr.merchant.account) : null);
  const city = data.city ?? qr?.merchant.city ?? null;

  const shareUrl = options.selfContained
    ? globalThis.location?.href ?? ""
    : absoluteUrl(`/p/${data.slug ?? ""}`, ctx.base, ctx.origin);

  const attributes: Record<string, string> = {
    payload: data.payload,
    title,
    theme: currentTheme(),
    size: "300",
  };
  if (data.note) attributes.note = data.note;
  if (data.presets.length > 0) attributes.presets = data.presets.join(",");
  if (data.refPrefix) attributes["ref-prefix"] = data.refPrefix;
  if (data.refLen > 0) attributes["ref-length"] = String(data.refLen);
  if (data.amount !== null) {
    attributes.amount = String(data.amount);
    attributes["lock-amount"] = "lock-amount";
  }

  const panel = h("deshiqr-pay", { attrs: attributes, class: "pay-panel" });

  const saveQrButton = actionButton("Download QR", "download", async () => {
    await panel.downloadPng(`deshiqr-${data.slug ?? "pay"}.png`);
    toast("QR PNG downloaded", "success");
  });

  const shareButton = actionButton("Share page", "share", async () => {
    const result = await shareLink({ title: `Pay ${title}`, text: data.note || undefined, url: shareUrl });
    if (result === "shared") toast("Shared", "success");
    else if (result === "copied") toast("Link copied", "success");
    else toast("Could not share — copy the link manually.", "error");
  });

  const posterButton = actionButton("A4 poster (PNG)", "printer", async () => {
    const qrMarkup = panel.getSvg() || qrSvg(data.payload, { title: `Pay ${title}` });
    const currentPayload = panel.getPayload() || data.payload;
    const poster = buildPosterSvg({
      qrSvg: qrMarkup,
      title,
      merchantName: data.merchantName ?? qr?.merchant.name ?? title,
      note: data.note,
      city,
      accountMasked: account,
      amount: data.amount,
      reference: referenceFrom(currentPayload),
      payUrl: shareUrl,
      verified: data.verified,
    });
    await downloadPosterPng(poster, `deshiqr-poster-${data.slug ?? "pay"}.png`);
    toast("Poster PNG downloaded (A4, 300 dpi)", "success");
  });

  const posterSvgButton = actionButton("SVG", "download", async () => {
    const qrMarkup = panel.getSvg() || qrSvg(data.payload);
    const currentPayload = panel.getPayload() || data.payload;
    const poster = buildPosterSvg({
      qrSvg: qrMarkup,
      title,
      merchantName: data.merchantName ?? qr?.merchant.name ?? title,
      note: data.note,
      city,
      accountMasked: account,
      amount: data.amount,
      reference: referenceFrom(currentPayload),
      payUrl: shareUrl,
      verified: data.verified,
    });
    downloadSvg(poster, `deshiqr-poster-${data.slug ?? "pay"}.svg`);
    toast("Poster SVG downloaded", "success");
  });

  const aside = h(
    "aside",
    { class: "card pay-aside" },
    h("span", { class: "eyebrow", text: options.selfContained ? "Self-contained link" : "Bangla QR pay page" }),
    h(
      "div",
      { class: "merchant-head" },
      h("span", { class: "merchant-avatar", attrs: { "aria-hidden": "true" }, text: initials(title) }),
      h(
        "div",
        { class: "merchant-heading" },
        h("h1", { class: "merchant-title", attrs: { tabindex: "-1" }, text: title }),
        h(
          "p",
          { class: "merchant-sub" },
          institution ? institution.label : "Bangla QR",
          data.verified ? h("span", { class: "inline-badge" }, icon("check"), "Verified merchant") : null,
        ),
      ),
    ),
    data.note ? h("p", { class: "merchant-note", text: data.note }) : null,
    h(
      "dl",
      { class: "meta-list" },
      metaRow("Merchant", data.merchantName ?? qr?.merchant.name ?? title),
      city ? metaRow("City", city) : null,
      account ? metaRow("Account (masked)", account) : null,
      metaRow("Provider", institution?.label ?? "Bangla QR"),
    ),
    h(
      "div",
      { class: "provider-verified" },
      data.verified
        ? h("p", { class: "provider-note" }, icon("check"), "bKash verified today, more providers planned.")
        : h("p", { class: "provider-note" }, icon("alert"), "Unverified institution — check with the merchant before paying."),
    ),
    h("p", {
      class: "merchant-foot",
      text: "Pay with bKash or any app that supports Bangla QR. deshiQR never holds funds.",
    }),
  );

  const notices: HTMLElement[] = [];
  if (options.selfContained) {
    notices.push(
      alertBox(
        "This self-contained link renders without any backend. The payload is public data — the same QR printed at the merchant's counter. Nothing is stored on a server.",
        "info",
      ),
    );
  }
  if (options.local) {
    notices.push(
      alertBox(
        "Local demo page: it exists in this browser only. Configure Supabase to publish a hosted page anyone can open.",
        "info",
      ),
    );
  }
  if (!decoded.ok) {
    notices.push(alertBox(`This payload could not be verified: ${decoded.error.message}`, "error"));
  }

  const actions = h(
    "div",
    { class: "action-row pay-actions" },
    saveQrButton,
    shareButton,
    copyButton(shareUrl, "Copy link"),
    posterButton,
    posterSvgButton,
  );

  return h(
    "div",
    { class: "container pay-page" },
    h(
      "div",
      { class: "pay-topline" },
      h(
        "a",
        { class: "back-link", href: withBase("/", ctx.base) },
        icon("arrow-left"),
        "deshiQR",
      ),
      h("span", { class: "pay-topline-meta", text: options.selfContained ? "No backend needed" : data.slug ? `Hosted at /p/${data.slug}` : "" }),
    ),
    ...notices,
    h(
      "div",
      { class: "pay-shell" },
      aside,
      h(
        "div",
        { class: "pay-main" },
        h("div", { class: "pay-panel-wrap" }, panel),
        actions,
        h("p", {
          class: "pay-hint",
          text: data.amount !== null
            ? "The amount is locked into the QR. The payer scans it, confirms in their app, and the merchant sees the payment in their wallet."
            : "Type an amount to include it in the QR, or leave it empty and the payer enters the amount in their wallet app.",
        }),
      ),
    ),
    h(
      "div",
      { class: "card pay-foot" },
      h("h2", { class: "pay-foot-title", text: "After the scan" }),
      h("p", {
        class: "pay-foot-text",
        text: "This page only encodes a payment QR. The money moves inside bKash or whichever wallet scans it — deshiQR has no access to the funds and cannot confirm a payment. Merchants confirm manually from their dashboard.",
      }),
      options.selfContained
        ? h(
            "div",
            { class: "action-row" },
            primaryLink(withBase("/new", ctx.base), "Build your own pay page", "arrow-right"),
            h(
              "a",
              { class: "button button-secondary", href: withBase("/dashboard", ctx.base) },
              "Open the dashboard",
            ),
          )
        : null,
    ),
  );
}

function notFoundView(ctx: AppContext, title: string, body: string): HTMLElement {
  return h(
    "div",
    { class: "container page-narrow" },
    h(
      "div",
      { class: "card card-pad not-found" },
      emptyState({
        title,
        body,
        icon: "qr",
        actions: [
          h("a", { class: "button button-primary", href: withBase("/", ctx.base) }, "Go home"),
          h("a", { class: "button button-secondary", href: withBase("/new", ctx.base) }, "Build a pay page"),
          h("a", { class: "button button-ghost", href: `${withBase("/", ctx.base)}#p=${DEMO_MERCHANT.basePayload}` }, "Open the demo link"),
        ],
      }),
    ),
  );
}

function metaRow(label: string, value: string): HTMLElement {
  return h(
    "div",
    { class: "meta-row" },
    h("dt", { text: label }),
    h("dd", { text: value }),
  );
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

function actionButton(
  label: string,
  iconName: Parameters<typeof icon>[0],
  onClick: () => Promise<void> | void,
): HTMLButtonElement {
  const button = h(
    "button",
    { class: "button button-secondary button-small", attrs: { type: "button" } },
    icon(iconName),
    h("span", { text: label }),
  );
  button.addEventListener("click", async () => {
    const original = label;
    button.disabled = true;
    try {
      await onClick();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Something went wrong.", "error");
    } finally {
      button.disabled = false;
      button.querySelector("span")?.replaceChildren(document.createTextNode(original));
    }
  });
  return button;
}

