/** 404 page. */
import { emptyState, h } from "../lib/dom.ts";
import { withBase } from "../lib/base.ts";
import type { AppContext } from "../types.ts";

export function notFoundPage(ctx: AppContext, path: string): HTMLElement {
  return h(
    "div",
    { class: "container page-narrow not-found-page" },
    h(
      "div",
      { class: "card card-pad" },
      emptyState({
        icon: "qr",
        title: "This page does not exist",
        body: `Nothing is routed at ${path}. The demo, the pay-page wizard and the dashboard are one click away.`,
        actions: [
          h("a", { class: "button button-primary", href: withBase("/", ctx.base) }, "Go home"),
          h("a", { class: "button button-secondary", href: withBase("/new", ctx.base) }, "New pay page"),
          h("a", { class: "button button-ghost", href: withBase("/dashboard", ctx.base) }, "Dashboard"),
        ],
      }),
    ),
  );
}
