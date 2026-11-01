/* Landing-page demo + the sign-in / sign-up page (login.html at /login). */
(function () {
  "use strict";
  var T = window.Deshi, h = T.h, icon = T.icon;
  var sb = null;
  var card = document.getElementById("auth");
  var notice = document.getElementById("setupNotice");

  document.querySelectorAll("[data-host]").forEach(function (el) { el.textContent = location.host; });
  [["ic1", "scan"], ["ic2", "link"], ["ic3", "wallet"]].forEach(function (p) {
    var el = document.getElementById(p[0]);
    if (el) el.appendChild(icon(p[1]));
  });

  /* ----- live payment demo -----
   * The actual customer page (PayView), mounted with a synthetic Bangla QR from
   * docs/demo-payloads.md. Visitors can type an amount and get a real,
   * amount-bearing QR built by the same engine the site uses — no real account
   * data, and nothing here talks to Supabase.
   */
  var DEMO_PAGE = {
    username: "demo",
    title: "Himel Das",
    message: "Live demo of a real Bangla QR payment page — this QR pays the account inside it. Try a small amount.",
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

  var mode = new URLSearchParams(location.search).get("mode") === "signin" ? "signin" : "signup";
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
    if (m.indexOf("invalid login") >= 0) return "That email and password don’t match.";
    if (m.indexOf("not confirmed") >= 0) return "Please confirm your email first. Check your inbox for the link.";
    if (m.indexOf("already registered") >= 0) return "An account with this email already exists. Try signing in.";
    if (c === "over_email_send_rate_limit" || m.indexOf("rate limit") >= 0 || m.indexOf("security purposes") >= 0) return "Too many attempts. Please wait a minute and try again.";
    if (m.indexOf("password") >= 0 && m.indexOf("characters") >= 0) return "Choose a longer password (at least 8 characters).";
    if (m.indexOf("fetch") >= 0 || m.indexOf("network") >= 0) return "Can’t reach the server. Check your connection.";
    return (err && err.message) || "Something went wrong. Please try again.";
  }

  function render() {
    var email = h("input", { class: "input", id: "email", type: "email", inputmode: "email", autocomplete: "email", autocapitalize: "none", autocorrect: "off", spellcheck: "false", placeholder: "you@example.com", required: true });
    var pw = null, eye = null;
    var msg = h("div", { class: "form-msg", role: "status", "aria-live": "polite" });

    var fields = [h("div", { class: "field" }, h("label", { for: "email" }, "Email"), email)];

    if (mode !== "forgot") {
      pw = h("input", { class: "input", id: "pw", type: "password", autocomplete: mode === "signup" ? "new-password" : "current-password", placeholder: mode === "signup" ? "At least 8 characters" : "Your password", minlength: "8", required: true });
      eye = h("button", { class: "eye", type: "button", "aria-label": "Show password", onClick: function () {
        var show = pw.type === "password";
        pw.type = show ? "text" : "password";
        eye.setAttribute("aria-label", show ? "Hide password" : "Show password");
        eye.replaceChildren(icon(show ? "eyeoff" : "eye"));
      } }, icon("eye"));
      fields.push(h("div", { class: "field" }, h("label", { for: "pw" }, "Password"), h("div", { class: "pw" }, pw, eye)));
    }

    var label = { signup: "Create my page", signin: "Sign in", forgot: "Send reset link" }[mode];
    var submit = h("button", { class: "btn block", type: "submit" }, label);

    function setBusy(b) {
      busy = b;
      submit.disabled = b;
      T.fill(submit, b ? h("span", { class: "spin" }) : null, b ? "Please wait" : label);
    }
    function say(text, kind) { msg.textContent = text || ""; msg.className = "form-msg" + (kind ? " " + kind : ""); }

    var form = h("form", { novalidate: true, onSubmit: async function (e) {
      e.preventDefault();
      if (busy || !sb) return;
      var em = email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { say("Enter a valid email address.", "bad"); email.focus(); return; }
      if (pw && mode === "signup" && pw.value.length < 8) { say("Use at least 8 characters for your password.", "bad"); pw.focus(); return; }
      if (pw && !pw.value) { say("Enter your password.", "bad"); pw.focus(); return; }
      say("");
      setBusy(true);
      try {
        if (mode === "signup") {
          var r = await sb.auth.signUp({ email: em, password: pw.value, options: { emailRedirectTo: location.origin + "/app" } });
          if (r.error) throw r.error;
          if (r.data.session) return location.assign("/app");
          if (r.data.user && r.data.user.identities && r.data.user.identities.length === 0) {
            mode = "signin"; render();
            document.getElementById("email").value = em;
            say("You already have an account with this email. Sign in below.", "bad");
            return;
          }
          return sent(em, "confirm");
        }
        if (mode === "signin") {
          var s = await sb.auth.signInWithPassword({ email: em, password: pw.value });
          if (s.error) throw s.error;
          return location.assign("/app");
        }
        var f = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + "/app" });
        if (f.error) throw f.error;
        sent(em, "reset");
      } catch (err) {
        say(friendly(err), "bad");
        setBusy(false);
      }
    } }, fields, submit, msg);

    var head = {
      signup: ["Create your page", "Free, and it takes about a minute — for payments, donations or support."],
      signin: ["Welcome back", "Sign in to edit your payment page."],
      forgot: ["Reset your password", "We’ll email you a link to choose a new one."]
    }[mode];

    var switcher = h("div", { class: "auth-links" },
      mode === "signup" ? h("button", { class: "linkbtn", type: "button", onClick: function () { mode = "signin"; render(); } }, "I already have an account") : null,
      mode === "signin" ? h("button", { class: "linkbtn", type: "button", onClick: function () { mode = "signup"; render(); } }, "New here? Create an account") : null,
      mode === "signin" ? h("button", { class: "linkbtn", type: "button", onClick: function () { mode = "forgot"; render(); } }, "Forgot password?") : null,
      mode === "forgot" ? h("button", { class: "linkbtn", type: "button", onClick: function () { mode = "signin"; render(); } }, "Back to sign in") : null
    );

    var google = T.cfg.googleAuth && sb && mode !== "forgot" ? [
      h("div", { class: "or" }, "or"),
      h("button", { class: "btn sec block", type: "button", onClick: function () {
        sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + "/app" } });
      } }, "Continue with Google")
    ] : null;

    T.fill(card, h("div", null, h("h2", null, head[0]), h("p", { class: "sub" }, head[1])), form, google, switcher);
    if (!sb) submit.disabled = true;
  }

  function sent(email, kind) {
    card.replaceChildren(h("div", { class: "mailed" },
      h("div", { class: "ic-big" }, icon("check")),
      h("h2", null, "Check your inbox"),
      h("p", { class: "sub" }, (kind === "reset" ? "We sent a password reset link to " : "We sent a confirmation link to ") + email + ". Open it on this device to continue."),
      h("button", { class: "linkbtn", type: "button", onClick: function () { mode = kind === "reset" ? "signin" : "signup"; render(); } }, "Use a different email")
    ));
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
