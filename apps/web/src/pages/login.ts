/**
 * Magic-link sign in (Supabase mode). In demo mode there are no accounts, which
 * the page states plainly instead of showing a broken form.
 */
import { h, icon, toast } from "../lib/dom.ts";
import { withBase } from "../lib/base.ts";
import { hasSupabase, signInWithMagicLink, signOut } from "../lib/supabase.ts";
import type { AppContext } from "../types.ts";
import { alertBox, field, input, pageHeader, primaryLink } from "../ui.ts";

export function loginPage(ctx: AppContext): HTMLElement {
  const root = h("div", { class: "page" });
  const content = h("div", { class: "container page-narrow" });

  if (!hasSupabase(ctx.config)) {
    content.append(
      pageHeader({
        eyebrow: "Accounts",
        title: "Sign in needs Supabase",
        lede: "deshiQR runs as a static site. Accounts, hosted pay pages and invoices are stored in a Supabase project you configure.",
      }),
      h(
        "div",
        { class: "card card-pad stack" },
        alertBox(
          "This deployment is in demo mode. Everything except publishing works locally in your browser; no email will be sent and no account is created.",
          "info",
        ),
        h(
          "div",
          { class: "action-row" },
          primaryLink(withBase("/dashboard", ctx.base), "Open the demo dashboard", "arrow-right"),
          h("a", { class: "button button-secondary", href: withBase("/", ctx.base) }, "Back to the demo"),
        ),
        h("p", {
          class: "card-small",
          text: "To enable accounts: set window.DESHIQR_CONFIG or VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY at build time, apply supabase/schema.sql, and deploy the invoice edge function. See docs/self-hosting.md in the repository.",
        }),
      ),
    );
    root.append(content);
    return root;
  }

  if (ctx.session) {
    content.append(
      pageHeader({
        eyebrow: "Signed in",
        title: ctx.session.user.email ?? "You are signed in",
        lede: "Your dashboard lists the pay pages and invoices owned by this account. Row-level security keeps other merchants' data unreadable.",
      }),
      h(
        "div",
        { class: "card card-pad stack" },
        h(
          "div",
          { class: "action-row" },
          primaryLink(withBase("/dashboard", ctx.base), "Open dashboard", "arrow-right"),
          signOutButton(ctx),
        ),
      ),
    );
    root.append(content);
    return root;
  }

  const emailInput = input({
    id: "login-email",
    type: "email",
    placeholder: "you@example.com",
    autocomplete: "email",
    required: true,
  });
  const status = h("div", { class: "login-status" });
  const submit = h(
    "button",
    { class: "button button-primary", attrs: { type: "submit" } },
    icon("link"),
    "Send magic link",
  );

  const form = h(
    "form",
    { class: "login-form" },
    field({
      id: "login-email",
      label: "Email address",
      control: emailInput,
      hint: "We email a one-time sign-in link. No password is stored.",
    }),
    submit,
    status,
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.replaceChildren();
    const email = emailInput.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      status.append(alertBox("Enter a valid email address.", "error"));
      emailInput.focus();
      return;
    }
    submit.disabled = true;
    try {
      await signInWithMagicLink(ctx.config, email, `${ctx.origin}${ctx.base}`);
      status.append(
        alertBox(
          "Check your inbox. The link signs you in and returns you to this app. Ask the deployment owner to allow this origin in Supabase Auth → URL configuration.",
          "success",
        ),
      );
      toast("Magic link sent", "success");
    } catch (error) {
      status.append(
        alertBox(error instanceof Error ? error.message : "Could not send the link.", "error"),
      );
    } finally {
      submit.disabled = false;
    }
  });

  content.append(
    pageHeader({
      eyebrow: "Accounts",
      title: "Sign in to publish",
      lede: "Login uses a Supabase magic link — no password. Publishers need an account; the demo path does not.",
    }),
    h(
      "div",
      { class: "card card-pad stack" },
      form,
      h(
        "p",
        { class: "card-small" },
        "Signing in lets you publish hosted pay pages and create invoices. The app only ever uses the Supabase anon key; every row is protected by row-level security.",
      ),
    ),
    h(
      "div",
      { class: "action-row" },
      h("a", { class: "button button-ghost", href: withBase("/", ctx.base) }, "Back to the demo"),
    ),
  );
  root.append(content);
  return root;
}

function signOutButton(ctx: AppContext): HTMLButtonElement {
  const button = h(
    "button",
    { class: "button button-secondary", attrs: { type: "button" } },
    icon("logout"),
    "Sign out",
  );
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await signOut(ctx.config);
      toast("Signed out", "success");
      await ctx.reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not sign out.", "error");
      button.disabled = false;
    }
  });
  return button;
}
