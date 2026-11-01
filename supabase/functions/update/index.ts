/**
 * deshiQR `update` edge function — edit Bangla QR payloads over HTTP.
 *
 * Deploy: `supabase functions deploy update --no-verify-jwt`
 * (no database, no secrets; JWT verification is optional).
 *
 * Route (Supabase mounts the function at `/functions/v1/update`):
 *
 *   POST /update  { "payload": "00020101021126…", "edits": { … }, "warnings": true }
 *     200         { ok: true, payload, warnings }
 *     4xx/5xx     { ok: false, error: { code, message, tag? } }
 *
 * Everything is stateless: the function validates TLV + CRC, edits the tags the
 * caller asked for, re-seals with CRC-16 and returns the new payload. It never
 * stores payloads and never talks to a database.
 */
import { CORS_DEFAULT_ORIGIN, handleUpdateRequest } from "./update-core.ts";

const corsOrigin = Deno.env.get("DESHIQR_CORS_ORIGIN") ?? CORS_DEFAULT_ORIGIN;

Deno.serve((request: Request) => handleUpdateRequest(request, { corsOrigin }));
