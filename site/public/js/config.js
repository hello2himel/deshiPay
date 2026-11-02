/*
 * Supabase connection. Replace the two placeholders, or leave this file alone
 * and set SUPABASE_URL / SUPABASE_ANON_KEY as environment variables so that
 * `npm run build` writes it for you (that is what Netlify does).
 *
 * The anon key is meant to be public. Row Level Security keeps the data safe.
 * Never put the service_role key here.
 */
window.DESHIPAY_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabaseAnonKey: "YOUR-ANON-KEY",
  googleAuth: false
};
