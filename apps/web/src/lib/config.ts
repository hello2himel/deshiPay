/**
 * App configuration.
 *
 * Resolution order (docs/architecture.md §6):
 *   1. `window.DESHIQR_CONFIG` — set by the host page without a rebuild.
 *   2. `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
 *   3. Local mode: no backend, localStorage, honest banner.
 *
 * Only the anon key is ever read here. Service keys must never reach the browser.
 */
export interface WindowConfig {
  supabaseUrl?: unknown;
  supabaseAnonKey?: unknown;
  supabase?: { url?: unknown; anonKey?: unknown; anon_key?: unknown };
  canonicalOrigin?: unknown;
  [key: string]: unknown;
}

export interface AppConfig {
  mode: "supabase" | "local";
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  /** Origin used for absolute share links; `null` means "use window.location.origin". */
  canonicalOrigin: string | null;
}

export interface ConfigSources {
  windowConfig?: unknown;
  envUrl?: string | null;
  envKey?: string | null;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function validSupabaseUrl(value: string | null): string | null {
  if (value === null) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return value.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function readWindowConfig(value: unknown): WindowConfig | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as WindowConfig)
    : null;
}

/** Resolve the runtime configuration. Pure: pass the window config/env in. */
export function resolveConfig(sources: ConfigSources = {}): AppConfig {
  const windowConfig = readWindowConfig(sources.windowConfig);
  const nested = windowConfig?.supabase;

  const url =
    validSupabaseUrl(text(windowConfig?.supabaseUrl)) ??
    validSupabaseUrl(text(nested?.url)) ??
    validSupabaseUrl(text(sources.envUrl));
  const anonKey =
    text(windowConfig?.supabaseAnonKey) ??
    text(nested?.anonKey) ??
    text(nested?.anon_key) ??
    text(sources.envKey);

  const configured = url !== null && anonKey !== null;
  return {
    mode: configured ? "supabase" : "local",
    supabaseUrl: configured ? url : null,
    supabaseAnonKey: configured ? anonKey : null,
    canonicalOrigin: text(windowConfig?.canonicalOrigin),
  };
}

/** Read config from the actual browser globals. */
export function readRuntimeConfig(): AppConfig {
  const env = import.meta.env;
  return resolveConfig({
    windowConfig: (globalThis as { DESHIQR_CONFIG?: unknown }).DESHIQR_CONFIG,
    envUrl: env?.VITE_SUPABASE_URL,
    envKey: env?.VITE_SUPABASE_ANON_KEY,
  });
}

/** True when the app can publish/host pages (Supabase is configured). */
export function isSupabaseMode(config: AppConfig): boolean {
  return config.mode === "supabase";
}
