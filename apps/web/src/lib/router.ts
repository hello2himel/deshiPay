/**
 * Client-side route resolution. Pure and framework-free.
 *
 * Path routes are the canonical form; hash forms (`#/p/slug`) and `?m=slug` are
 * static-host fallbacks, and `#p=<payload>&t=…` renders a pay page with no
 * backend at all.
 */
import type { InlinePayLink } from "./links.ts";
import { decodeInlineLink } from "./links.ts";
import { stripBase } from "./base.ts";

export type Route =
  | { name: "home" }
  | { name: "new" }
  | { name: "login" }
  | { name: "dashboard" }
  | { name: "pay"; slug: string }
  | { name: "inline"; link: InlinePayLink }
  | { name: "invoice"; token: string }
  | { name: "notFound"; path: string };

export interface LocationParts {
  pathname: string;
  hash: string;
  search: string;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function cleanPath(path: string): string {
  if (!path.startsWith("/")) path = `/${path}`;
  const withoutQuery = path.split("?")[0] ?? "/";
  if (withoutQuery.length > 1) return withoutQuery.replace(/\/+$/, "");
  return "/";
}

/** Resolve a pathname (already base-prefixed) into a route. */
export function resolvePath(path: string, search: string = ""): Route {
  const clean = cleanPath(path);
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const merchantFallback = params.get("m")?.trim() ?? "";

  if (clean === "/") {
    if (merchantFallback) return { name: "pay", slug: safeDecode(merchantFallback) };
    return { name: "home" };
  }
  if (clean === "/new" || clean === "/create") return { name: "new" };
  if (clean === "/login" || clean === "/signin") return { name: "login" };
  if (clean === "/dashboard" || clean.startsWith("/dashboard/")) return { name: "dashboard" };

  const payMatch = /^\/p\/([^/]+)$/.exec(clean);
  if (payMatch) return { name: "pay", slug: safeDecode(payMatch[1]) };

  const atMatch = /^\/@([^/]+)$/.exec(clean);
  if (atMatch) return { name: "pay", slug: safeDecode(atMatch[1]) };

  const invoiceMatch = /^\/i\/([^/]+)$/.exec(clean);
  if (invoiceMatch) return { name: "invoice", token: safeDecode(invoiceMatch[1]) };

  // Unknown path: `?m=slug` still opens the pay page (legacy fallback).
  if (merchantFallback) return { name: "pay", slug: safeDecode(merchantFallback) };
  return { name: "notFound", path: clean };
}

/** Resolve the current location into a route. */
export function resolveRoute(location: LocationParts, base: string = "/"): Route {
  const hash = location.hash ?? "";

  // Self-contained pay link: `#p=<payload>&t=…` wins over everything else.
  const inline = decodeInlineLink(hash);
  if (inline) return { name: "inline", link: inline };

  // Hash-router fallback: `#/p/demo`, `#/i/<token>`, `#/dashboard`, `#/new`, `#/login`.
  if (hash.startsWith("#/")) {
    const hashPath = hash.slice(1);
    const [hashPathname, hashSearch = ""] = hashPath.split("?", 2);
    return resolvePath(cleanPath(hashPathname ?? "/"), hashSearch);
  }

  return resolvePath(stripBase(location.pathname, base), location.search ?? "");
}

/** Route → canonical path (base added by the caller). */
export function routePath(route: Route): string {
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
      return `/p/${encodeURIComponent(route.slug)}`;
    case "invoice":
      return `/i/${encodeURIComponent(route.token)}`;
    case "inline":
      return "/";
    case "notFound":
      return route.path;
  }
}

/** Document title for a route. */
export function routeTitle(route: Route): string {
  switch (route.name) {
    case "home":
      return "deshiQR — Bangla QR pay pages, posters and embeds";
    case "new":
      return "New pay page · deshiQR";
    case "login":
      return "Sign in · deshiQR";
    case "dashboard":
      return "Dashboard · deshiQR";
    case "pay":
      return `Pay ${route.slug} · deshiQR`;
    case "inline":
      return `${route.link.title || "Bangla QR payment"} · deshiQR`;
    case "invoice":
      return "Invoice · deshiQR";
    case "notFound":
      return "Not found · deshiQR";
  }
}
