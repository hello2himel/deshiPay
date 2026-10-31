/**
 * Base-path handling for static hosting.
 *
 * Netlify/Cloudflare serve the app from `/`; GitHub Pages serves it from
 * `/deshiQR/` (`DESHIQR_BASE=/deshiQR/` at build time). Every generated link and
 * every route lookup goes through these helpers instead of assuming `/`.
 */

/** Normalise a Vite `base` value to always start and end with `/`. */
export function normalizeBase(value: string | null | undefined): string {
  if (value === null || value === undefined) return "/";
  let base = value.trim();
  if (!base) return "/";
  if (!base.startsWith("/")) base = `/${base}`;
  if (!base.endsWith("/")) base = `${base}/`;
  return base;
}

/** The runtime base from Vite (`import.meta.env.BASE_URL`). */
export function runtimeBase(): string {
  const env = import.meta.env;
  return normalizeBase(env?.BASE_URL);
}

/** Strip the deploy base from a pathname: `/deshiQR/p/demo` → `/p/demo`. */
export function stripBase(pathname: string, base: string = "/"): string {
  const normalisedBase = normalizeBase(base);
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (normalisedBase === "/") return path;
  const baseWithoutSlash = normalisedBase.slice(0, -1);
  if (path === baseWithoutSlash) return "/";
  if (path.startsWith(normalisedBase)) {
    const rest = path.slice(normalisedBase.length);
    return rest === "" ? "/" : `/${rest.replace(/^\/+/, "")}`;
  }
  return path;
}

/** Prefix an app path with the deploy base: `p/demo` → `/deshiQR/p/demo`. */
export function withBase(path: string, base: string = "/"): string {
  const normalisedBase = normalizeBase(base);
  const clean = path.replace(/^\/+/, "");
  return `${normalisedBase}${clean}`;
}

/** Absolute URL for sharing/canonical links. */
export function absoluteUrl(path: string, base: string, origin: string): string {
  const normalisedOrigin = origin.replace(/\/+$/, "");
  return `${normalisedOrigin}${withBase(path, base)}`;
}
