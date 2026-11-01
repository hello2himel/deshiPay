/* Landing page: sign up, sign in, reset password. */
(function () {
  "use strict";
  var T = window.Deshi, h = T.h, icon = T.icon;
  var sb = T.client();
  var card = document.getElementById("auth");

  document.querySelectorAll("[data-host]").forEach(function (el) { el.textContent = location.host; });
  [["ic1", "scan"], ["ic2", "link"], ["ic3", "wallet"]].forEach(function (p) { document.getElementById(p[0]).appendChild(icon(p[1])); });
  var demo = document.getElementById("demoQr");
  if (demo && window.qrcode) demo.appendChild(T.qrSvg(location.origin + "/"));

  var mode = new URLSearchParams(location.search).get("mode") === "signin" ? "signin" : "signup";
  var busy = false;

  if (!sb) {
    document.getElementById("setupNotice").replaceChildren(
      h("div", { class: "notice bad" }, icon("alert"), h("span", null, "Supabase isn’t connected yet. Add your project URL and anon key to public/js/config.js, or set the SUPABASE_URL and SUPABASE_ANON_KEY environment variables. The README has the 5-minute setup."))
    );
  } else {
    sb.auth.getSession().then(function (r) {
      if (r.data && r.data.session) location.replace("/app");
    });
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
      signup: ["Create your page", "Free, and it takes about a minute."],
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

  render();
})();
