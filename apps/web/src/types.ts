import type { Session } from "@supabase/supabase-js";
import type { AppConfig } from "./lib/config.ts";
import type { Route } from "./lib/router.ts";

/** Shared render context passed to every page. */
export interface AppContext {
  config: AppConfig;
  /** Deploy base with a trailing slash, e.g. "/" or "/deshiQR/". */
  base: string;
  /** Origin used for absolute share links. */
  origin: string;
  session: Session | null;
  /** Push a client-side route (path with leading slash). */
  navigate(path: string): void;
  /** Re-render the current route (after auth changes, etc.). */
  reload(): Promise<void>;
}

export type PageRenderer = (ctx: AppContext, route: Route) => Node | Promise<Node>;

/** Absolute URL for an app path. */
export function appPath(ctx: AppContext, path: string): string {
  const base = ctx.base;
  const clean = path.replace(/^\/+/, "");
  return `${base}${clean}`;
}
