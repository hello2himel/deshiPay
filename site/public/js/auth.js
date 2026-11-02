/* Landing-page demo + the sign-in / sign-up page (login.html at /login). */
(function () {
  "use strict";
  var T = window.Deshi, h = T.h, icon = T.icon;
  var sb = null;
  var card = document.getElementById("auth");
  var notice = document.getElementById("setupNotice");

  /* ----- live payment demo -----
   * The actual customer page (PayView), mounted with a synthetic Bangla QR from
   * docs/demo-payloads.md. Visitors can type an amount and get a real,
   * amount-bearing QR built by the same engine the site uses, with no real account
   * data, and nothing here talks to Supabase.
   */
  var DEMO_PAGE = {
    username: "demo",
    title: "DeshiPay",
    avatar: "shop",
    message: "Support DeshiPay. This is a live demo: the QR and bank details are real, so try a small amount.",
    theme: "emerald",
    presets: [100, 500, 1000, 5000],
    // Base payload of the demo QR (a real Bangla QR: NPSB account template,
    // merchant name/city in tags 59/60 and the provider token templates).
    qr_payload: "00020101021126470014bd.org.bb.npsb010202020420020311018687352695204601653030505802BD5909HIMEL DAS6005Bogra62060602FT80660014bd.org.bb.npsb01445XNCJK94czExK9lJvOzkThJZ1WeRL9ejOv/DpI3gIk8w81660014bd.org.bb.npsb0144OS4dluMwFWQdIe4vJT3fc22f2V7L2grFuN9FjRKYAw==63044901",
    qr_name: "HIMEL DAS",
    qr_city: "Bogra",
    ref_prefix: "",
    ref_len: 0,
    wallets: [
      { provider: "bkash", type: "personal", number: "01700000000" },
      { provider: "nagad", type: "personal", number: "01800000000" }
    ],
    banks: [
      { bank: "BRAC Bank", name: "Demo Store", number: "1234567890123", branch: "Bogra", routing: "123456789", swift: "" }
    ]
  };

  function mountDemo() {
    var host = document.getElementById("demo") || document.getElementById("demoPayment");
    if (!host || !window.PayView) return;
    // The same customer page pay.js mounts, minus the page-only tail (footer)
    // and the landing-page autofocus: full QR / Wallet / Bank tabs. The
    // "How to pay" block is hidden for the landing demo in studio.css.
    window.PayView.mount(host, DEMO_PAGE, { preview: true });
    // Keep the phone note (the Save button is hidden on the homepage demo), but
    // point at the thing a visitor can actually do with a phone: screenshot it.
    var note = host.querySelector(".slip-help");
    if (note) note.textContent = "Paying from this phone? Screenshot the QR, then choose it from your gallery inside your payment app.";
    // Start at ৳1,500 so the demo shows a real amount-bearing QR immediately;
    // the visitor can edit it or use the quick-amount chips.
    var amount = host.querySelector(".amt-input");
    if (amount) {
      amount.value = "1500";
      amount.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  mountDemo();

  var mode = "email"; // "email" (send a code) or "otp" (enter the code)
  var lastEmail = "";
  var pendingEmail = "";
  var busy = false;

  /* ----- online vs offline ----- */

  // Shown while the health probe is in flight, so the sign-in form never flashes.
  function paintLoading() {
    card.replaceChildren(
      h("h2", null, "One moment"),
      h("p", { class: "sub" }, h("span", { class: "spin", role: "status", "aria-label": "Checking whether sign-in is available" }), " Checking whether sign-in is available…")
    );
  }

  // No login, no sign-up: the same wizard at /app runs without an account and
  // ends with a downloadable single HTML file. The status detail (paused,
  // restricted, unreachable) is deliberately left out of the card.
  function renderOffline() {
    card.replaceChildren(
      h("h2", null, "Create your page"),
      h("p", { class: "sub" }, "Sign-in is offline right now, but you can still build your payment page and download it as one HTML file to host yourself."),
      h("a", { class: "btn block", href: "/app" }, icon("next"), "Create my page")
    );
  }

  function setupNotice() {
    var box = h("div", { class: "notice bad" }, icon("alert"), h("span", null, "Supabase isn’t connected yet. Add your project URL and anon key to public/js/config.js, or set the SUPABASE_URL and SUPABASE_ANON_KEY environment variables. The README has the 5-minute setup."));
    if (notice) { notice.replaceChildren(box); return true; }
    card.replaceChildren(box);
    return false;
  }

  function friendly(err) {
    var m = (err && (err.message || err.msg) || "").toLowerCase(), c = err && err.code;
    if (m.indexOf("token") >= 0 || m.indexOf("otp") >= 0) return "That code didn’t work. Check it, or send a new code.";
    if (m.indexOf("invalid login") >= 0) return "That email and password don’t match.";
    if (m.indexOf("not confirmed") >= 0) return "Please confirm your email first. Check your inbox for the link.";
    if (m.indexOf("already registered") >= 0) return "An account with this email already exists. Try signing in.";
    if (c === "over_email_send_rate_limit" || m.indexOf("rate limit") >= 0 || m.indexOf("security purposes") >= 0) return "Too many attempts. Please wait a minute and try again.";
    if (m.indexOf("password") >= 0 && m.indexOf("characters") >= 0) return "Choose a longer password (at least 8 characters).";
    if (m.indexOf("fetch") >= 0 || m.indexOf("network") >= 0) return "Can’t reach the server. Check your connection.";
    return (err && err.message) || "Something went wrong. Please try again.";
  }

  function render() {
    busy = false;
    if (mode === "signup-otp") return renderSignupOtp();
    if (mode === "forgot-email") return renderForgotEmail();
    if (mode === "forgot-otp") return renderForgotOtp();
    if (mode === "forgot-newpw") return renderForgotNewPw();
    return renderEmailPassword();
  }

  function busyButton(btn, label, b) {
    busy = b;
    btn.disabled = b;
    T.fill(btn, b ? h("span", { class: "spin" }) : null, b ? "Please wait" : label);
  }

  function sayInto(msg) {
    return function (text, kind) {
      msg.textContent = text || "";
      msg.className = "form-msg" + (kind ? " " + kind : "");
    };
  }

  function noLoginOption() {
    return h("div", { class: "no-login" },
      h("span", null, "Don’t want to create an account?"),
      h("a", { class: "btn dashed block", href: "/app?local=1" }, "Create a page without login")
    );
  }

  function linkButton(text, onClick) {
    return h("button", { class: "linkbtn", type: "button", onClick: onClick }, text);
  }

  function disabledIfNoSb() {
    var btn = card.querySelector('button[type="submit"]');
    if (btn && !sb) btn.disabled = true;
  }

  function emailField(value) {
    return h("input", { class: "input", id: "email", type: "email", inputmode: "email", autocomplete: "email", autocapitalize: "none", autocorrect: "off", spellcheck: "false", placeholder: "you@example.com", value: value || lastEmail, required: true });
  }

  function pwField(id, label, autocomplete) {
    var pw = h("input", { class: "input", id: id, type: "password", autocomplete: autocomplete, placeholder: "At least 8 characters", minlength: "8", required: true });
    var eye = h("button", { class: "eye", type: "button", "aria-label": "Show password", onClick: function () {
      var show = pw.type === "password";
      pw.type = show ? "text" : "password";
      eye.setAttribute("aria-label", show ? "Hide password" : "Show password");
      eye.replaceChildren(icon(show ? "eyeoff" : "eye"));
    } }, icon("eye"));
    return { field: h("div", { class: "field" }, h("label", { for: id }, label), h("div", { class: "pw" }, pw, eye)), input: pw };
  }

  function otpField() {
    return h("input", { class: "input otp-input", id: "otp", type: "text", inputmode: "numeric", autocomplete: "one-time-code", placeholder: "123456", maxlength: "6", required: true });
  }

  function renderEmailPassword() {
    var email = emailField();
    var pw = pwField("pw", "Password", "current-password");
    var msg = h("div", { class: "form-msg", role: "status", "aria-live": "polite" });
    var say = sayInto(msg);
    var label = "Continue";
    var submit = h("button", { class: "btn block", type: "submit" }, label);

    var form = h("form", { novalidate: true, onSubmit: async function (e) {
      e.preventDefault();
      if (busy || !sb) return;
      var em = email.value.trim();
      var pass = pw.input.value;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { say("Enter a valid email address.", "bad"); email.focus(); return; }
      if (pass.length < 8) { say("Use at least 8 characters for your password.", "bad"); pw.input.focus(); return; }
      lastEmail = em;
      say("");
      busyButton(submit, label, true);
      try {
        // Existing account first. New email falls through to sign-up.
        var s = await sb.auth.signInWithPassword({ email: em, password: pass });
        if (!s.error) return location.assign("/app");
        var m = (s.error.message || "").toLowerCase();
        var invalid = /invalid login credentials|invalid credentials/.test(m) || s.error.code === "invalid_credentials";
        if (!invalid) throw s.error;

        var r = await sb.auth.signUp({ email: em, password: pass, options: { emailRedirectTo: location.origin + "/app" } });
        if (r.error) throw r.error;
        if (r.data.session) return location.assign("/app"); // confirmations are off
        var exists = r.data.user && r.data.user.identities && r.data.user.identities.length === 0;
        if (exists) {
          say("That email and password don’t match. This email already has an account; reset your password if you’ve forgotten it.", "bad");
          return busyButton(submit, label, false);
        }
        pendingEmail = em;
        mode = "signup-otp";
        render();
      } catch (err) {
        var emsg = (err && (err.message || "")).toLowerCase();
        if (/already registered|already been registered|user already/.test(emsg)) {
          say("That email and password don’t match. This email already has an account; reset your password if you’ve forgotten it.", "bad");
          return busyButton(submit, label, false);
        }
        say(friendly(err), "bad");
        busyButton(submit, label, false);
      }
    } }, emailFieldToField(email), pw.field, submit, msg);

    T.fill(card,
      h("div", null, h("h2", null, "Create your page"), h("p", { class: "sub" }, "Sign in, or create an account with your email and password. It takes about a minute.")),
      form,
      h("div", { class: "auth-links" }, linkButton("Forgot password?", function () { mode = "forgot-email"; render(); })),
      noLoginOption());
    if (!sb) submit.disabled = true;
  }

  function emailFieldToField(input) {
    return h("div", { class: "field" }, h("label", { for: "email" }, "Email"), input);
  }

  function renderSignupOtp() {
    var otp = otpField();
    var msg = h("div", { class: "form-msg", role: "status", "aria-live": "polite" });
    var say = sayInto(msg);
    var label = "Confirm email";
    var submit = h("button", { class: "btn block", type: "submit" }, label);

    var form = h("form", { novalidate: true, onSubmit: async function (e) {
      e.preventDefault();
      if (busy || !sb) return;
      var code = otp.value.replace(/\D/g, "");
      if (code.length !== 6) { say("Enter the 6-digit code from the email.", "bad"); otp.focus(); return; }
      say("");
      busyButton(submit, label, true);
      try {
        var r = await sb.auth.verifyOtp({ email: pendingEmail, token: code, type: "signup" });
        if (r.error) throw r.error;
        location.assign("/app");
      } catch (err) {
        say(friendly(err), "bad");
        busyButton(submit, label, false);
        otp.focus();
      }
    } }, h("div", { class: "field" }, h("label", { for: "otp" }, "6-digit code"), otp), submit, msg);

    var resend = h("button", { class: "linkbtn", type: "button", onClick: async function () {
      if (busy || !sb) return;
      say("");
      resend.disabled = true;
      try {
        var r = await sb.auth.resend({ type: "signup", email: pendingEmail, options: { emailRedirectTo: location.origin + "/app" } });
        if (r.error) throw r.error;
        say("A new code is on its way.", "ok");
      } catch (err) { say(friendly(err), "bad"); }
      finally { resend.disabled = false; }
    } }, "Send a new code");

    T.fill(card,
      h("div", null, h("h2", null, "Check your email"), h("p", { class: "sub" }, "We sent a 6-digit code to " + pendingEmail + ". Enter it to confirm your account and sign in.")),
      form,
      h("div", { class: "auth-links" }, resend, linkButton("Use a different email", function () { mode = "email"; render(); })));
    if (!sb) submit.disabled = true;
  }

  function renderForgotEmail() {
    var email = emailField();
    var msg = h("div", { class: "form-msg", role: "status", "aria-live": "polite" });
    var say = sayInto(msg);
    var label = "Send reset code";
    var submit = h("button", { class: "btn block", type: "submit" }, label);

    var form = h("form", { novalidate: true, onSubmit: async function (e) {
      e.preventDefault();
      if (busy || !sb) return;
      var em = email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { say("Enter a valid email address.", "bad"); email.focus(); return; }
      lastEmail = em;
      say("");
      busyButton(submit, label, true);
      try {
        var r = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + "/app" });
        if (r.error) throw r.error;
        pendingEmail = em;
        mode = "forgot-otp";
        render();
      } catch (err) { say(friendly(err), "bad"); busyButton(submit, label, false); }
    } }, h("div", { class: "field" }, h("label", { for: "email" }, "Email"), email), submit, msg);

    T.fill(card,
      h("div", null, h("h2", null, "Reset your password"), h("p", { class: "sub" }, "Enter your email and we’ll send you a 6-digit code.")),
      form,
      h("div", { class: "auth-links" }, linkButton("Back", function () { mode = "email"; render(); })));
    if (!sb) submit.disabled = true;
  }

  function renderForgotOtp() {
    var otp = otpField();
    var msg = h("div", { class: "form-msg", role: "status", "aria-live": "polite" });
    var say = sayInto(msg);
    var label = "Continue";
    var submit = h("button", { class: "btn block", type: "submit" }, label);

    var form = h("form", { novalidate: true, onSubmit: async function (e) {
      e.preventDefault();
      if (busy || !sb) return;
      var code = otp.value.replace(/\D/g, "");
      if (code.length !== 6) { say("Enter the 6-digit code from the email.", "bad"); otp.focus(); return; }
      say("");
      busyButton(submit, label, true);
      try {
        var r = await sb.auth.verifyOtp({ email: pendingEmail, token: code, type: "recovery" });
        if (r.error) throw r.error;
        mode = "forgot-newpw";
        render();
      } catch (err) { say(friendly(err), "bad"); busyButton(submit, label, false); otp.focus(); }
    } }, h("div", { class: "field" }, h("label", { for: "otp" }, "6-digit code"), otp), submit, msg);

    var resend = h("button", { class: "linkbtn", type: "button", onClick: async function () {
      if (busy || !sb) return;
      say("");
      resend.disabled = true;
      try {
        var r = await sb.auth.resetPasswordForEmail(pendingEmail, { redirectTo: location.origin + "/app" });
        if (r.error) throw r.error;
        say("A new code is on its way.", "ok");
      } catch (err) { say(friendly(err), "bad"); }
      finally { resend.disabled = false; }
    } }, "Send a new code");

    T.fill(card,
      h("div", null, h("h2", null, "Check your email"), h("p", { class: "sub" }, "We sent a 6-digit code to " + pendingEmail + ". Enter it to continue.")),
      form,
      h("div", { class: "auth-links" }, resend, linkButton("Back", function () { mode = "email"; render(); })));
    if (!sb) submit.disabled = true;
  }

  function renderForgotNewPw() {
    var pw = pwField("pw", "New password", "new-password");
    var msg = h("div", { class: "form-msg", role: "status", "aria-live": "polite" });
    var say = sayInto(msg);
    var label = "Save password";
    var submit = h("button", { class: "btn block", type: "submit" }, label);

    var form = h("form", { novalidate: true, onSubmit: async function (e) {
      e.preventDefault();
      if (busy || !sb) return;
      if (pw.input.value.length < 8) { say("Use at least 8 characters for your password.", "bad"); pw.input.focus(); return; }
      say("");
      busyButton(submit, label, true);
      try {
        var r = await sb.auth.updateUser({ password: pw.input.value });
        if (r.error) throw r.error;
        location.assign("/app");
      } catch (err) { say(friendly(err), "bad"); busyButton(submit, label, false); pw.input.focus(); }
    } }, pw.field, submit, msg);

    T.fill(card,
      h("div", null, h("h2", null, "Choose a new password"), h("p", { class: "sub" }, "You’re verified. Set a new password for your account.")),
      form,
      h("div", { class: "auth-links" }, linkButton("Back to sign in", function () { mode = "email"; render(); })));
    if (!sb) submit.disabled = true;
  }

  function boot() {
    // The landing page only mounts the demo; the auth form lives on /login.
    if (!card) return;
    paintLoading();
    var probe = typeof T.checkBackend === "function"
      ? T.checkBackend()
      : Promise.resolve({ configured: !!T.configured, online: !!T.client(), reason: T.configured ? "online" : "not-configured", status: null });
    probe.then(function (backend) {
      if (!backend.online) return renderOffline();
      sb = T.client();
      if (!sb) {
        if (setupNotice()) render();
        return;
      }
      sb.auth.getSession().then(function (r) {
        if (r.data && r.data.session) location.replace("/app");
      });
      render();
    }, function () {
      renderOffline();
    });
  }

  boot();
})();
