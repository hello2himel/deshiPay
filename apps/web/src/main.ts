/**
 * App bootstrap: config, auth (optional Supabase), routing and the site shell.
 */
import "./styles.css";
import { defineDeshiQrPay } from "deshiqr-element";

import type { Session } from "@supabase/supabase-js";
import { h } from "./lib/dom.ts";
import { decodeInlineLink } from "./lib/links.ts";
import { readRuntimeConfig } from "./lib/config.ts";
import { runtimeBase, withBase } from "./lib/base.ts";
import { resolveRoute, routeTitle, type Route } from "./lib/router.ts";
import { hasSupabase, getSession, onAuthStateChange } from "./lib/supabase.ts";
import { homePage } from "./pages/home.ts";
import { newPage } from "./pages/new.ts";
import { payPage } from "./pages/pay.ts";
import { invoicePage } from "./pages/invoice.ts";
import { dashboardPage } from "./pages/dashboard.ts";
import { loginPage } from "./pages/login.ts";
import { notFoundPage } from "./pages/not-found.ts";
import { loadingScreen, modeBanner, siteFooter, siteHeader } from "./ui.ts";
import type { AppContext } from "./types.ts";

// Register <deshiqr-pay> explicitly: a side-effect-only import can be tree-shaken
// by the production bundler because the package marks itself side-effect-free.
defineDeshiQrPay();

const config = readRuntimeConfig();
const base = runtimeBase();
const origin = config.canonicalOrigin ?? globalThis.location?.origin ?? "";
const root = document.getElementById("app");

if (!root) {
  throw new Error("deshiQR: #app root element is missing.");
}

const appRoot: HTMLElement = root;

let session: Session | null = null;
let authUnsubscribe: (() => void) | null = null;
let renderId = 0;
let hasRendered = false;

const ctx: AppContext = {
  config,
  base,
  origin,
  get session() {
    return session;
  },
  navigate,
  reload: () => renderRoute(),
};

function navigate(path: string): void {
  const target = withBase(path, base);
  const current = `${location.pathname}${location.search}`;
  if (target === current) {
    void renderRoute();
    return;
  }
  history.pushState({}, "", target);
  void renderRoute();
}

async function pageFor(route: Route): Promise<Node> {
  switch (route.name) {
    case "home":
      return homePage(ctx);
    case "new":
      return newPage(ctx);
    case "pay":
      return payPage(ctx, route);
    case "inline":
      return payPage(ctx, route);
    case "invoice":
      return invoicePage(ctx, route);
    case "dashboard":
      return dashboardPage(ctx);
    case "login":
      return loginPage(ctx);
    case "notFound":
      return notFoundPage(ctx, route.path);
  }
}

async function renderRoute(): Promise<void> {
  const token = ++renderId;
  const route = resolveRoute(
    { pathname: location.pathname, hash: location.hash, search: location.search },
    base,
  );
  const path = pathForRoute(route);
  document.title = routeTitle(route);

  const main = h("main", {
    id: "main",
    class: "site-main",
    attrs: { tabindex: "-1" },
  });
  main.append(loadingScreen("Loading…"));

  const shell = h(
    "div",
    { class: "site" },
    h("a", { class: "skip-link", href: "#main" }, "Skip to content"),
    siteHeader({ base, config, path }),
    modeBanner(config),
    main,
    siteFooter({ base, config, path }),
  );
  appRoot.replaceChildren(shell);
  if (hasRendered) main.focus({ preventScroll: true });
  hasRendered = true;

  let pageNode: Node;
  try {
    pageNode = await pageFor(route);
  } catch (error) {
    pageNode = errorView(error);
  }
  if (token !== renderId) return;
  main.replaceChildren(pageNode);
}

function pathForRoute(route: Route): string {
  switch (route.name) {
    case "home":
      return "/";
    case "new":
      return "/new";
    case "login":
      return "/login";
    case "dashboard":
      return "/dashboard";
    case "pay":
      return `/p/${route.slug}`;
    case "invoice":
      return `/i/${route.token}`;
    case "inline":
      return "/";
    case "notFound":
      return route.path;
  }
}

function errorView(error: unknown): HTMLElement {
  const message = error instanceof Error ? error.message : "Something went wrong while rendering this page.";
  return h(
    "div",
    { class: "container page-narrow" },
    h(
      "div",
      { class: "card card-pad" },
      h("h1", { class: "page-title", text: "Something went wrong" }),
      h("p", { class: "page-lede", text: message }),
      h(
        "div",
        { class: "action-row" },
        h("a", { class: "button button-primary", href: withBase("/", base) }, "Reload the app"),
      ),
    ),
  );
}

/* ------------------------------------------------------------- navigation */

document.addEventListener("click", (event) => {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const anchor = target.closest<HTMLAnchorElement>("a[href]");
  if (!anchor) return;
  if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;

  const href = anchor.getAttribute("href");
  if (!href) return;
  if (href === "#main") return; // let the browser move focus to <main>
  if (href.startsWith("#") && !href.startsWith("#p=")) return; // in-page anchors

  let url: URL;
  try {
    url = new URL(href, location.href);
  } catch {
    return;
  }
  if (url.origin !== location.origin) return;
  if (!url.pathname.startsWith(base)) return;

  // Self-contained pay links: keep the URL shareable, render in place.
  if (url.hash.startsWith("#p=")) {
    event.preventDefault();
    history.pushState({}, "", url.pathname + url.search + url.hash);
    void renderRoute();
    return;
  }

  if (url.pathname === location.pathname && url.hash) return; // in-page hash on the same page

  event.preventDefault();
  const path = url.pathname.slice(base.length - 1) || "/";
  navigate(path + url.search);
});

window.addEventListener("popstate", () => {
  void renderRoute();
});

window.addEventListener("hashchange", () => {
  if (decodeInlineLink(location.hash) || location.hash.startsWith("#/")) {
    void renderRoute();
  }
});

/* ------------------------------------------------------------------- auth */

async function initAuth(): Promise<void> {
  if (!hasSupabase(config)) {
    await renderRoute();
    return;
  }
  try {
    session = await getSession(config);
    authUnsubscribe = await onAuthStateChange(config, (next) => {
      const previousUser = session?.user?.id ?? null;
      session = next;
      if ((next?.user?.id ?? null) !== previousUser) {
        void renderRoute();
      }
    });
  } catch {
    // A broken session should not stop the demo path from rendering.
  }

  // Supabase magic links land back on the app with auth tokens in the hash.
  if (location.hash.includes("access_token=") || location.hash.includes("error_description=")) {
    const destination = location.hash.includes("access_token=")
      ? withBase("/dashboard", base)
      : withBase("/login", base);
    history.replaceState({}, "", destination);
  }
  await renderRoute();
}

window.addEventListener("pagehide", () => {
  authUnsubscribe?.();
  authUnsubscribe = null;
});

void initAuth();
