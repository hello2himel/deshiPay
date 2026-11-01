/*
 * Owner dashboard (/app).
 *   - First visit: a 4-step onboarding (link, Bangla QR, other ways to pay, look).
 *   - After publishing: the same sections as tabs, plus Share, with a save bar.
 * When the Supabase backend is paused/unreachable the same wizard runs without
 * an account ("local mode"): a 5th Download step saves the page as one HTML file.
 * Everything the owner edits is mirrored live in the preview using PayView.
 */
(function () {
  "use strict";
  var T = window.Deshi, h = T.h, icon = T.icon, TQ = window.DeshiQR;
  var $ = function (id) { return document.getElementById(id); };
  var root = $("root"), topActions = $("topActions");
  var recovering = /type=recovery/.test(location.hash + location.search); // read before supabase clears the URL

  var STEPS = [
    { id: "link", tab: "Link", icon: "link", title: "Say who you are", lead: "This is the name customers see, and the address of your page." },
    { id: "qr", tab: "Bangla QR", icon: "qr", title: "Drop your Bangla QR", lead: "Take a screenshot of the QR in your bKash, Nagad, Rocket or bank app and drop it here. We read it right in your browser." },
    { id: "pay", tab: "Wallet & bank", icon: "wallet", title: "Other ways to pay", lead: "Optional. Add a wallet number or bank account for customers who’d rather copy the details." },
    { id: "look", tab: "Look", icon: "palette", title: "Make it yours", lead: "Pick a colour and the quick amounts your customers will see." }
  ];
  var DOWNLOAD = { id: "download", tab: "Download", icon: "download", title: "Take your page with you", lead: "Download your payment page as one HTML file. Host it anywhere — Netlify Drop, GitHub Pages, or your own server. No account needed." };
  var SHARE = { id: "share", tab: "Share", icon: "share" };
  var TAG_NAMES = { "00": "Format", "01": "Static (11) or dynamic (12)", "52": "Category", "53": "Currency (050 = BDT)", "54": "Amount", "58": "Country", "59": "Merchant name", "60": "City", "62": "Additional data", "63": "Checksum (recalculated)" };

  var LOCAL_DRAFT_KEY = "deshiqr.local.v1";
  var sb, user;
  var localMode = false; // backend paused/unreachable: no sb, no user
  var S = blank();
  var isNew = true, step = 0, tabId = "link";
  var savedSnap = "", originalUsername = "", justPublished = false, busy = false;
  var U = { state: "idle", for: "", msg: "" };
  var pv = null, ui = {};

  /* ---------------- state ---------------- */

  function uid() { return Math.random().toString(36).slice(2, 9); }
  function blank() {
    return { username: "", usernameTouched: false, title: "", message: "", theme: "rose", presets: [100, 500, 1000, 5000], qr: null, qrInfo: null, wallets: [], banks: [], published: true };
  }
  function fromRow(r) {
    return {
      username: r.username, usernameTouched: true, title: r.title, message: r.message || "", theme: r.theme, presets: r.presets || [],
      qr: r.qr_payload ? { payload: r.qr_payload, name: r.qr_name || "", city: r.qr_city || "", refPrefix: r.ref_prefix || "", refLen: r.ref_len || 0 } : null,
      qrInfo: null,
      wallets: (r.wallets || []).map(function (w) { return { id: uid(), provider: w.provider, type: w.type, number: w.number }; }),
      banks: (r.banks || []).map(function (b) { return { id: uid(), bank: b.bank || "", name: b.name || "", number: b.number || "", branch: b.branch || "", routing: b.routing || "", swift: b.swift || "" }; }),
      published: r.is_published !== false
    };
  }
  function cleanWallets(strict) {
    return S.wallets.filter(function (w) { return w.number.trim(); }).map(function (w) {
      return { provider: w.provider, type: w.type, number: T.normalizePhone(w.number) };
    }).filter(function (w) { return !strict || T.PHONE_RE.test(w.number); });
  }
  function cleanBanks(strict) {
    return S.banks.map(function (b) {
      return { bank: b.bank.trim(), name: b.name.trim(), number: b.number.trim(), branch: b.branch.trim(), routing: T.bnToEn(b.routing).replace(/\D/g, ""), swift: b.swift.trim().toUpperCase() };
    }).filter(function (b) {
      var any = b.bank || b.name || b.number || b.branch || b.routing || b.swift;
      return strict ? b.bank && b.name && b.number && bankErrors(b).length === 0 : any;
    });
  }
  function bankErrors(b) {
    var e = [];
    if (b.routing && !/^\d{9}$/.test(b.routing)) e.push("Routing numbers have 9 digits");
    if (b.swift && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(b.swift)) e.push("SWIFT codes are 8 or 11 letters and digits");
    return e;
  }
  function parsePresets(str) {
    return T.bnToEn(str).split(/[,\s]+/).map(Number).filter(function (n) { return n > 0 && n < 1e7 && isFinite(n); }).slice(0, 6);
  }
  function toRow() {
    var q = S.qr;
    return {
      username: S.username, title: S.title.trim(), message: S.message.trim(), theme: S.theme, presets: S.presets,
      qr_payload: q ? q.payload : null, qr_name: q ? q.name : null, qr_city: q ? q.city : null,
      ref_prefix: q ? q.refPrefix : "", ref_len: q ? q.refLen : 0,
      wallets: cleanWallets(true), banks: cleanBanks(true), is_published: S.published
    };
  }
  function previewRow() {
    var r = toRow();
    r.username = r.username || "yourname";
    r.title = r.title || "Your name";
    return r;
  }
  function dirty() { return !isNew && JSON.stringify(toRow()) !== savedSnap; }
  function draftKey() { return localMode ? LOCAL_DRAFT_KEY : "deshiqr.draft.v1:" + user.id; }
  function saveDraft() {
    if (!isNew) return;
    try { localStorage.setItem(draftKey(), JSON.stringify(S)); } catch (e) { /* private mode */ }
  }

  /* ---------------- validation ---------------- */

  function validate() {
    var i;
    if (!S.title.trim()) return { step: "link", msg: "Add your name or business name.", focus: "f-title" };
    if (!localMode) {
      var ue = T.usernameError(S.username);
      if (ue) return { step: "link", msg: ue + ".", focus: "f-user" };
      if (U.state === "taken" && U.for === S.username) return { step: "link", msg: "That link is already taken. Try another.", focus: "f-user" };
    }
    for (i = 0; i < S.wallets.length; i++) {
      var w = S.wallets[i];
      if (w.number.trim() && !T.PHONE_RE.test(T.normalizePhone(w.number))) return { step: "pay", msg: "Check the wallet number. It should be 11 digits, like 01XXXXXXXXX.", focus: "w-" + w.id + "-n" };
    }
    for (i = 0; i < S.banks.length; i++) {
      var b = S.banks[i], c = cleanBanks(false)[i];
      if (!c) continue;
      if (!c.bank) return { step: "pay", msg: "Add the bank name.", focus: "b-" + b.id + "-bank" };
      if (!c.name) return { step: "pay", msg: "Add the account name.", focus: "b-" + b.id + "-name" };
      if (!c.number) return { step: "pay", msg: "Add the account number.", focus: "b-" + b.id + "-number" };
      var be = bankErrors(c);
      if (be.length) return { step: "pay", msg: be[0] + ".", focus: "b-" + b.id + (/Routing/.test(be[0]) ? "-routing" : "-swift") };
    }
    if (!S.qr && !cleanWallets(true).length && !cleanBanks(true).length) return { step: "qr", final: true, msg: "Add at least one way to get paid: a Bangla QR, a wallet or a bank account." };
    return null;
  }
  function validateStep(id) {
    var v = validate();
    if (!v) return null;
    if (id === "look") return v;
    if (v.final) return null; // "add at least one method" only blocks publishing
    // for earlier steps, only block on problems that belong to that step
    return v.step === id ? v : null;
  }

  /* ---------------- username check ---------------- */

  function paintUser() {
    var el = $("userStatus");
    if (!el) return;
    var kids = [], cls = "status";
    if (U.state === "checking") kids = [h("span", { class: "spin" }), "Checking…"];
    else if (U.state === "ok") { cls += " ok"; kids = [icon("check"), U.msg || "Available"]; }
    else if (U.state === "taken") { cls += " bad"; kids = [icon("alert"), "Already taken. Try another."]; }
    else if (U.state === "bad" || U.state === "error") { cls += " bad"; kids = [icon("alert"), U.msg]; }
    el.className = cls;
    el.replaceChildren.apply(el, kids);
    var aff = $("userAffix");
    if (aff) aff.classList.toggle("bad", U.state === "bad" || U.state === "taken");
  }
  async function runCheck(u) {
    var r;
    if (localMode || !sb) return U.state; // nothing to check against without a backend
    try { r = await sb.rpc("username_available", { p_username: u }); } catch (e) { r = { error: e }; }
    if (S.username !== u) return U.state;
    U = r.error ? { state: "error", for: u, msg: "Couldn’t check right now. We’ll check again when you save." } : r.data ? { state: "ok", for: u } : { state: "taken", for: u };
    paintUser();
    return U.state;
  }
  var debouncedCheck = T.debounce(function (u) { runCheck(u); }, 350);
  function onUsername() {
    var u = S.username;
    if (!u) { U = { state: "idle", for: "" }; return paintUser(); }
    var err = T.usernameError(u);
    if (err) { U = { state: "bad", for: u, msg: err }; return paintUser(); }
    if (localMode) { U = { state: "idle", for: "" }; return paintUser(); } // no username/link in local mode
    if (u === originalUsername) { U = { state: "ok", for: u, msg: "This is your current link" }; return paintUser(); }
    U = { state: "checking", for: u };
    paintUser();
    debouncedCheck(u);
  }

  /* ---------------- shell ---------------- */

  function current() { return isNew ? STEPS[step].id : tabId; }

  function changed() {
    saveDraft();
    paintBar();
    if (pv) pv.update(previewRow());
  }

  function renderAll() {
    root.replaceChildren(
      h("div", { class: "studio" },
        h("main", { class: "studio-main" }, h("div", { id: "nav" }), h("div", { id: "panel" })),
        h("aside", { class: "preview-col", "aria-label": localMode ? "Preview" : "Live preview" },
          h("div", { class: "frame" },
            h("div", { class: "frame-bar" }, h("span", { class: "live" }), localMode ? "Preview" : "Live preview"),
            h("div", { class: "frame-body", id: "previewBody" })))
      ),
      h("div", { class: "actionbar", id: "bar" })
    );
    pv = window.PayView.mount($("previewBody"), previewRow(), localMode ? { preview: true, hideHandle: true } : { preview: true });
    paintNav();
    paintPanel();
    paintBar();
    paintTop();
  }

  function paintTop() {
    if (localMode) {
      topActions.replaceChildren(h("span", { class: "user-chip local" }, "Offline mode"));
      return;
    }
    var kids = [];
    if (!isNew && originalUsername) kids.push(h("a", { class: "btn sec sm", href: "/" + originalUsername, target: "_blank", rel: "noopener" }, icon("external"), "View page"));
    kids.push(h("span", { class: "user-chip" }, user.email || ""));
    kids.push(h("button", { class: "btn ghost sm", type: "button", onClick: signOut }, icon("logout"), "Sign out"));
    topActions.replaceChildren.apply(topActions, kids);
  }

  function paintNav() {
    var nav = $("nav");
    document.body.setAttribute("data-step", current());
    if (isNew) {
      var bars = STEPS.map(function (s, i) { return h("i", { class: i < step ? "done" : i === step ? "now" : "" }); });
      nav.replaceChildren(h("div", { class: "progress" }, h("div", { class: "count" }, "Step " + (step + 1) + " of " + STEPS.length + " · " + STEPS[step].tab), h("div", { class: "bars", "aria-hidden": "true" }, bars)));
    } else {
      var problem = validate();
      var all = STEPS.concat([SHARE]);
      nav.replaceChildren(h("div", { class: "tabs", role: "tablist" }, all.map(function (s) {
        return h("button", { type: "button", role: "tab", "aria-selected": String(s.id === tabId), onClick: function () { tabId = s.id; paintNav(); paintPanel(); window.scrollTo({ top: 0 }); } },
          icon(s.icon), h("span", { class: "tab-label" }, s.tab), problem && problem.step === s.id ? h("span", { class: "dot", title: "Needs attention" }) : null);
      })));
    }
  }

  function paintBar() {
    var bar = $("bar");
    if (!bar) return;
    var kids, show = true;
    if (isNew) {
      var last = step === STEPS.length - 1;
      var saving = localMode && current() === "download";
      var label = saving ? "Download page" : last ? "Publish page" : current() === "qr" && !S.qr ? "Skip for now" : "Continue";
      kids = [
        step > 0 ? h("button", { class: "btn sec", type: "button", onClick: back }, icon("back"), "Back") : null,
        h("button", { class: "btn grow", id: "primary", type: "button", disabled: busy, onClick: saving ? downloadNow : next },
          busy ? h("span", { class: "spin" }) : null,
          busy ? (saving ? "Preparing…" : "Publishing") : label,
          busy ? null : icon(saving ? "download" : last ? "check" : "next"))
      ];
    } else if (dirty()) {
      kids = [
        h("button", { class: "btn sec", type: "button", disabled: busy, onClick: discard }, "Discard"),
        h("button", { class: "btn grow", id: "primary", type: "button", disabled: busy, onClick: save }, busy ? h("span", { class: "spin" }) : null, busy ? "Saving" : "Save changes")
      ];
    } else show = false;
    var msg = bar.querySelector(".bar-msg");
    var keep = msg ? msg.textContent : "";
    var kcls = msg ? msg.className : "bar-msg";
    bar.hidden = !show;
    document.body.classList.toggle("has-bar", show);
    var row = h("div", { class: "actionbar-btns" }, kids);
    var m = h("p", { class: kcls, id: "barMsg", role: "status", "aria-live": "polite" }, keep);
    bar.replaceChildren(h("div", { class: "actionbar-in" }, h("div", null, m, row)));
  }
  function barMsg(text, bad) {
    var m = $("barMsg");
    if (m) { m.textContent = text || ""; m.className = "bar-msg" + (bad ? " bad" : ""); }
  }

  function paintPanel() {
    var id = current(), p = $("panel"), node;
    if (id === "link") node = linkPanel();
    else if (id === "qr") node = qrPanel();
    else if (id === "pay") node = payPanel();
    else if (id === "look") node = lookPanel();
    else if (id === "download") node = downloadPanel();
    else node = sharePanel();
    p.replaceChildren(node);
    barMsg("");
    if (id === "link") {
      if (localMode) U = { state: "idle", for: "" };
      else onUsername();
    }
  }

  function head(id) {
    var s = STEPS.filter(function (x) { return x.id === id; })[0];
    return h("div", { class: "panel-head" }, h("h1", null, s.title), h("p", null, s.lead));
  }

  /* ---------------- navigation ---------------- */

  function back() { if (step > 0) { step--; paintNav(); paintPanel(); paintBar(); window.scrollTo({ top: 0 }); } }

  async function next() {
    if (busy) return;
    var id = STEPS[step].id;
    if (id === "link" && U.state === "checking") await runCheck(S.username);
    var v = validateStep(id);
    if (v) return showProblem(v);
    if (step === STEPS.length - 1) return save();
    step++;
    paintNav(); paintPanel(); paintBar();
    window.scrollTo({ top: 0 });
  }
  function showProblem(v) {
    barMsg(v.msg, true);
    if (isNew) {
      var idx = STEPS.map(function (s) { return s.id; }).indexOf(v.step);
      if (idx >= 0 && idx !== step) step = idx;
      paintNav(); paintPanel(); paintBar();
    } else if (tabId !== v.step) {
      tabId = v.step; paintNav(); paintPanel(); paintBar();
    }
    barMsg(v.msg, true);
    if (v.focus) setTimeout(function () { var el = $(v.focus); if (el) { el.focus(); if (el.scrollIntoView) el.scrollIntoView({ block: "center", behavior: "smooth" }); } }, 30);
  }

  /* ---------------- panels ---------------- */

  function field(label, input, hint, opt) {
    return h("div", { class: "field" }, h("label", { for: input.id }, label, opt ? h("span", { class: "opt" }, " (optional)") : null), input, hint ? h("div", { class: "hint" }, hint) : null);
  }

  function linkPanel() {
    var title = h("input", { class: "input", id: "f-title", type: "text", maxlength: "60", autocomplete: "organization", placeholder: "e.g. Rahim Traders", value: S.title });
    // Local mode has no account and nobody to claim a username against, so the
    // whole "Your link" field group is left out; the page address is derived
    // from the title when the file is made.
    var user = localMode ? null : h("input", { class: "input", id: "f-user", type: "text", maxlength: "30", autocomplete: "off", autocapitalize: "none", autocorrect: "off", spellcheck: "false", placeholder: "rahim-traders", value: S.username });
    var message = h("input", { class: "input", id: "f-msg", type: "text", maxlength: "160", placeholder: "e.g. Orders ship after payment", value: S.message });

    title.addEventListener("input", function () {
      S.title = title.value;
      if (localMode) S.username = T.slugify(S.title) || "page";
      else if (!S.usernameTouched) { S.username = T.slugify(S.title); user.value = S.username; onUsername(); }
      changed();
    });
    if (user) {
      user.addEventListener("input", function () {
        var v = user.value.toLowerCase().replace(/[^a-z0-9_-]/g, "");
        if (v !== user.value) user.value = v;
        S.username = v; S.usernameTouched = true;
        onUsername(); changed();
      });
    }
    message.addEventListener("input", function () { S.message = message.value; changed(); });

    var linkField = localMode ? null : h("div", { class: "field" },
      h("label", { for: "f-user" }, "Your link"),
      h("div", { class: "affix", id: "userAffix" }, h("span", null, location.host + "/"), user),
      h("div", { class: "status", id: "userStatus", "aria-live": "polite" }),
      !isNew ? h("div", { class: "hint" }, "Changing this breaks links you’ve already shared.") : null
    );

    return h("div", { class: "panel" }, head("link"),
      h("div", { class: "stack" },
        field("Your name or business name", title, "Shown at the top of your page."),
        linkField,
        field("A note for customers", message, "Shown under your name.", true)
      ));
  }

  /* ----- Bangla QR ----- */

  function qrPanel() {
    var body = h("div", { class: "stack" });
    var msgEl = h("div", { class: "form-msg", role: "status", "aria-live": "polite" });
    function say(t, kind) { msgEl.textContent = t || ""; msgEl.className = "form-msg" + (kind ? " " + kind : ""); }

    var fileIn = h("input", { type: "file", accept: "image/*", class: "file-hidden", "aria-label": "Choose a QR image", tabindex: "-1", onChange: function (e) { handle(e.target.files[0]); e.target.value = ""; } });
    var camIn = h("input", { type: "file", accept: "image/*", capture: "environment", class: "file-hidden", "aria-label": "Take a photo of the QR", tabindex: "-1", onChange: function (e) { handle(e.target.files[0]); e.target.value = ""; } });
    ui.qrHandle = handle;

    async function handle(file) {
      if (!file) return;
      say("Reading the QR…");
      try {
        var text = await T.reader.decode(file);
        if (!text) return say(T.reader.hasJsQR() ? "Couldn’t find a QR in that image. Crop the screenshot closer to the QR and try again, or paste the code text." : "The QR reader didn’t load. Paste the code text instead.", "bad");
        accept(text);
      } catch (e) {
        say("Couldn’t open that image. Try a PNG or JPG screenshot.", "bad");
      }
    }
    function accept(text) {
      var r = TQ.inspect(text);
      if (!r.ok) return say(r.error, "bad");
      S.qr = { payload: r.base, name: r.name, city: r.city, refPrefix: r.refPrefix, refLen: r.refLen };
      S.qrInfo = { srcAmount: r.srcAmount };
      paint();
      changed();
    }

    function dropzone() {
      var paste = h("textarea", { class: "textarea mono", spellcheck: "false", placeholder: "00020101021126…", "aria-label": "QR code text", onInput: function (e) { var v = e.target.value.trim(); if (v.length > 40) accept(v); } });
      var pasteBox = h("div", { class: "paste-box", hidden: true }, h("div", { class: "hint" }, "Paste the text your QR contains (it starts with 000201)."), paste);
      var zone = h("div", { class: "drop" },
        h("div", { class: "big-ic" }, icon("scan")),
        h("div", null, h("h2", null, "Drop your Bangla QR here"), h("p", null, "A screenshot or photo of the QR from bKash, Nagad, Rocket or any bank app. You can also paste a screenshot.")),
        h("div", { class: "drop-actions" },
          h("button", { class: "btn", type: "button", onClick: function () { fileIn.click(); } }, icon("image"), "Choose image"),
          h("button", { class: "btn sec", type: "button", onClick: function () { camIn.click(); } }, icon("camera"), "Take photo")),
        msgEl,
        h("button", { class: "linkbtn", type: "button", onClick: function () { pasteBox.hidden = !pasteBox.hidden; if (!pasteBox.hidden) paste.focus(); } }, "Paste the code text instead"),
        pasteBox
      );
      ["dragenter", "dragover"].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add("over"); }); });
      ["dragleave", "drop"].forEach(function (ev) {
        zone.addEventListener(ev, function (e) {
          e.preventDefault();
          zone.classList.remove("over");
          if (ev === "drop" && e.dataTransfer && e.dataTransfer.files[0]) handle(e.dataTransfer.files[0]);
        });
      });
      return zone;
    }

    function okCard() {
      var info = TQ.inspect(S.qr.payload);
      var tags = info.ok ? info.tags : [];
      var srcAmt = S.qrInfo && S.qrInfo.srcAmount;
      return h("div", { class: "stack" },
        h("div", { class: "card qr-ok" },
          h("div", { class: "qr-ok-head" },
            h("div", { class: "avatar", "aria-hidden": "true" }, T.monogram(S.qr.name)),
            h("div", { class: "who" }, h("b", null, S.qr.name), h("span", null, [S.qr.city, info.ok && info.guid ? info.guid : ""].filter(Boolean).join(" · "))),
            h("span", { class: "pill ok" }, icon("check"), "Checksum verified")
          ),
          srcAmt > 0 ? h("div", { class: "notice" }, icon("info"), h("span", null, "This QR had a fixed amount (" + T.taka(srcAmt) + "). We removed it so each customer can enter their own.")) : null,
          h("div", { class: "notice" }, icon("shield"), h("span", null, "Check that the name above is the account you want to be paid into. Customers will see it in their app before they confirm.")),
          h("div", { class: "qr-ok-actions" },
            h("button", { class: "btn sec", type: "button", onClick: function () { fileIn.click(); } }, icon("image"), "Replace QR"),
            h("button", { class: "btn ghost", type: "button", onClick: function () { S.qr = null; S.qrInfo = null; say(""); paint(); changed(); } }, "Remove"))
        ),
        h("div", { class: "notice" }, icon("scan"), h("span", null, "Try it in the preview: enter an amount and scan the QR with another phone to confirm it opens your payment app with the right amount.")),
        h("details", { class: "more" },
          h("summary", null, "How your QR is used"),
          h("div", { class: "body" },
            h("p", null, "We keep every value in your QR exactly as it is: account, name, city and the bank’s own tokens. Only three things change for each payment: the amount is added, the QR is marked as having an amount, and the checksum is recalculated. Your image never leaves this device."),
            h("table", { class: "tlv" }, tags.map(function (t) {
              var name = TAG_NAMES[t[0]] || (+t[0] >= 2 && +t[0] <= 51 ? "Merchant account" : +t[0] >= 80 ? "Bank token (kept as is)" : "");
              return h("tr", null, h("td", null, t[0]), h("td", null, name), h("td", null, t[1]));
            })),
            info.ok && info.refLen ? h("p", null, "This QR carries a reference. A fresh one with the same first 10 characters is generated for each payment.") : null
          ))
      );
    }

    function paint() { body.replaceChildren(S.qr ? okCard() : dropzone()); }
    paint();
    return h("div", { class: "panel" }, head("qr"), body, fileIn, camIn);
  }

  /* ----- wallets and banks ----- */

  function payPanel() {
    var walletList = h("div", { class: "stack" }), bankList = h("div", { class: "stack" });
    var datalist = h("datalist", { id: "banks-list" }, T.BANKS.map(function (b) { return h("option", { value: b }); }));

    function paintWallets() {
      T.fill(walletList,
        S.wallets.length ? S.wallets.map(walletEntry) : h("div", { class: "empty-hint" }, "No wallet added yet."),
        S.wallets.length < 6 ? h("button", { class: "add", type: "button", onClick: function () { var w = { id: uid(), provider: "bkash", type: "personal", number: "" }; S.wallets.push(w); paintWallets(); changed(); setTimeout(function () { var n = $("w-" + w.id + "-n"); if (n) n.focus(); }, 30); } }, icon("plus"), "Add a wallet") : null
      );
    }
    function paintBanks() {
      T.fill(bankList,
        S.banks.length ? S.banks.map(bankEntry) : h("div", { class: "empty-hint" }, "No bank account added yet."),
        S.banks.length < 4 ? h("button", { class: "add", type: "button", onClick: function () { var b = { id: uid(), bank: "", name: "", number: "", branch: "", routing: "", swift: "" }; S.banks.push(b); paintBanks(); changed(); setTimeout(function () { var n = $("b-" + b.id + "-bank"); if (n) n.focus(); }, 30); } }, icon("plus"), "Add a bank account") : null
      );
    }

    function walletEntry(w) {
      var p = T.wallet(w.provider);
      var dot = h("span", { class: "dot", style: "background:" + p.color });
      var title = h("b", null, dot, p.name);
      var err = h("div", { class: "err", id: "w-" + w.id + "-e", role: "alert" });
      var sel = h("select", { class: "select", id: "w-" + w.id + "-p" }, T.WALLETS.map(function (x) { return h("option", { value: x.id, selected: x.id === w.provider }, x.name); }));
      var typ = h("select", { class: "select", id: "w-" + w.id + "-t" }, T.WALLET_TYPES.map(function (x) { return h("option", { value: x.id, selected: x.id === w.type }, x.name); }));
      var num = h("input", { class: "input", id: "w-" + w.id + "-n", type: "tel", inputmode: "numeric", autocomplete: "off", maxlength: "20", placeholder: "01XXX XXXXXX", value: w.number });
      function check(show) {
        var raw = num.value.trim(), ok = !raw || T.PHONE_RE.test(T.normalizePhone(raw));
        num.setAttribute("aria-invalid", String(!ok && show));
        err.textContent = !ok && show ? "Enter an 11-digit mobile number, like 01712345678." : "";
      }
      sel.addEventListener("change", function () { w.provider = sel.value; var q = T.wallet(w.provider); dot.style.background = q.color; title.replaceChildren(dot, q.name); changed(); });
      typ.addEventListener("change", function () { w.type = typ.value; changed(); });
      num.addEventListener("input", function () { w.number = num.value; check(false); changed(); });
      num.addEventListener("blur", function () { check(true); });
      return h("div", { class: "entry" },
        h("div", { class: "entry-head" }, title, h("button", { class: "btn icon sec", type: "button", "aria-label": "Remove this wallet", onClick: function () { S.wallets = S.wallets.filter(function (x) { return x !== w; }); paintWallets(); changed(); } }, icon("trash"))),
        h("div", { class: "grid2" },
          field("Wallet", sel), field("Account type", typ),
          h("div", { class: "span2" }, field("Mobile number", num, "Customers see “" + T.walletType(w.type).action + "” as the way to pay it.")),
          err)
      );
    }

    function bankEntry(b) {
      function inp(key, label, o) {
        o = o || {};
        var el = h("input", { class: "input", id: "b-" + b.id + "-" + key, type: "text", autocomplete: "off", maxlength: o.max || "60", placeholder: o.ph || "", value: b[key] });
        if (o.mode) el.setAttribute("inputmode", o.mode);
        if (o.list) el.setAttribute("list", o.list);
        if (o.caps) el.setAttribute("autocapitalize", "characters");
        el.addEventListener("input", function () { b[key] = el.value; if (errEl) fieldCheck(); changed(); });
        return { el: el, wrap: field(label, el, o.hint, o.opt) };
      }
      var errEl = h("div", { class: "err", role: "alert" });
      var f = {
        bank: inp("bank", "Bank name", { list: "banks-list", ph: "Start typing, e.g. Sonali Bank" }),
        name: inp("name", "Account name", { ph: "Name on the account" }),
        number: inp("number", "Account number", { mode: "text", max: "40" }),
        branch: inp("branch", "Branch", { opt: true, ph: "e.g. Bogra" }),
        routing: inp("routing", "Routing number", { mode: "numeric", max: "12", opt: true, ph: "9 digits" }),
        swift: inp("swift", "SWIFT code", { max: "11", opt: true, caps: true, hint: "For payments from abroad." })
      };
      function fieldCheck() {
        var c = { routing: T.bnToEn(b.routing).replace(/\D/g, ""), swift: b.swift.trim().toUpperCase() };
        errEl.textContent = bankErrors(c)[0] || "";
      }
      var heading = h("b", null, icon("bank"), b.bank || "Bank account");
      f.bank.el.addEventListener("input", function () { heading.replaceChildren(icon("bank"), b.bank || "Bank account"); });
      return h("div", { class: "entry" },
        h("div", { class: "entry-head" }, heading, h("button", { class: "btn icon sec", type: "button", "aria-label": "Remove this bank account", onClick: function () { S.banks = S.banks.filter(function (x) { return x !== b; }); paintBanks(); changed(); } }, icon("trash"))),
        h("div", { class: "grid2" },
          h("div", { class: "span2" }, f.bank.wrap), h("div", { class: "span2" }, f.name.wrap),
          f.number.wrap, f.branch.wrap, f.routing.wrap, f.swift.wrap, h("div", { class: "span2" }, errEl))
      );
    }

    paintWallets();
    paintBanks();
    return h("div", { class: "panel" }, head("pay"),
      h("div", { class: "stack" },
        h("div", { class: "section-title" }, h("span", { class: "ic-tile" }, icon("wallet")), h("h2", null, "Mobile wallet")),
        walletList,
        h("div", { class: "divider" }),
        h("div", { class: "section-title" }, h("span", { class: "ic-tile" }, icon("bank")), h("h2", null, "Bank transfer")),
        bankList, datalist)
    );
  }

  /* ----- look ----- */

  function lookPanel() {
    var group = h("div", { class: "themes", role: "radiogroup", "aria-label": "Colour theme" });
    function paintThemes() {
      group.replaceChildren.apply(group, T.THEMES.map(function (t, i) {
        var on = t.id === S.theme;
        return h("button", { class: "swatch", type: "button", role: "radio", "aria-checked": String(on), tabindex: on ? "0" : "-1", "aria-label": t.name,
          onClick: function () { pick(t.id); },
          onKeydown: function (e) {
            var d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
            if (!d) return;
            e.preventDefault();
            pick(T.THEMES[(i + d + T.THEMES.length) % T.THEMES.length].id, true);
          } },
          h("span", { class: "dot", style: "background:" + t.color }, icon("check")), t.name);
      }));
    }
    function pick(id, focus) {
      S.theme = id; paintThemes(); changed();
      if (focus) { var el = group.querySelector('[aria-checked="true"]'); if (el) el.focus(); }
    }
    var presets = h("input", { class: "input", id: "f-presets", type: "text", inputmode: "numeric", autocomplete: "off", placeholder: "100, 500, 1000, 5000", value: S.presets.join(", ") });
    presets.addEventListener("input", function () { S.presets = parsePresets(presets.value); changed(); });
    paintThemes();
    return h("div", { class: "panel" }, head("look"),
      h("div", { class: "stack" },
        h("div", { class: "field" }, h("span", { class: "label" }, "Colour"), group),
        field("Quick amounts", presets, "Taka, separated by commas. Up to 6. They appear as one-tap buttons on your page.", true)
      ));
  }

  /* ----- download (local mode only) ----- */

  function downloadFilename() {
    return "deshiqr-" + (T.slugify(S.title) || "page") + ".html";
  }

  function downloadPanel() {
    var tips = [
      [icon("download"), "One file.", " Your page, styles, QR engine and payment details are all inside it."],
      [icon("wallet"), "Same page your customers see.", " Every method, colour and quick amount you added is included."],
      [icon("shield"), "Works on its own.", " Customers can enter an amount, use quick amounts and save the QR image."]
    ];
    var hosts = [
      [icon("store"), "Netlify Drop:", " drag the file onto app.netlify.com/drop."],
      [icon("share"), "GitHub Pages:", " add it to a repository and turn Pages on."],
      [icon("external"), "Any server:", " upload it wherever you already host files."]
    ];
    function tipList(items) {
      return h("ul", { class: "points" }, items.map(function (t) {
        return h("li", null, h("span", { class: "ic-tile" }, t[0]), h("span", null, h("b", null, t[1]), t[2]));
      }));
    }
    return h("div", { class: "panel" },
      h("div", { class: "panel-head" }, h("h1", null, DOWNLOAD.title), h("p", null, DOWNLOAD.lead)),
      h("div", { class: "stack" },
        h("div", { class: "card" },
          h("div", { class: "stack" },
            h("div", { class: "field" },
              h("span", { class: "label" }, "File name"),
              h("div", { class: "urlbox" }, h("span", null, downloadFilename()))),
            h("button", { class: "btn block", id: "dlBtn", type: "button", onClick: downloadNow }, icon("download"), "Download page (.html)"),
            h("p", { class: "hint" }, "Save it somewhere safe. You can come back and download a fresh copy after any edit."),
            h("div", { class: "form-msg", id: "dlHint", role: "status", "aria-live": "polite" })
          )),
        h("div", { class: "divider" }),
        h("div", { class: "section-title" }, h("span", { class: "ic-tile" }, icon("download")), h("h2", null, "What you get")),
        tipList(tips),
        h("div", { class: "divider" }),
        h("div", { class: "section-title" }, h("span", { class: "ic-tile" }, icon("store")), h("h2", null, "How to host it")),
        tipList(hosts),
        h("div", { class: "notice" }, icon("info"), h("span", null, "Only the web fonts load from the internet. Everything else is inside the file, so it works from any static host — or straight from a folder on your computer."))
      ));
  }

  /* ----- share ----- */

  function sharePanel() {
    var url = T.pageUrl(originalUsername);
    var amt = h("input", { class: "input", id: "f-linkamt", type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "e.g. 1500" });
    var qrBox = h("div", { class: "qrbox" });
    qrBox.appendChild(T.qrSvg(url));
    var toggle = h("input", { type: "checkbox", role: "switch", checked: S.published, onChange: function (e) { S.published = e.target.checked; changed(); paintNav(); } });

    amt.addEventListener("input", function () { var s = TQ.sanitizeAmount(amt.value); if (s !== amt.value) amt.value = s; });

    return h("div", { class: "panel" },
      h("div", { class: "panel-head" }, h("h1", null, "Share your page"), h("p", null, "Send the link, put the QR on your counter, or lock an amount for a specific invoice.")),
      justPublished ? h("div", { class: "live-banner" }, icon("check"), "Your page is live. Try opening it on your phone.") : null,
      h("div", { class: "stack" },
        h("div", { class: "urlbox" }, h("span", null, url.replace(/^https?:\/\//, "")), h("button", { class: "btn sm", type: "button", onClick: function () { T.copyText(url).then(function (ok) { T.toast(ok ? "Link copied" : "Couldn’t copy", { error: !ok, lift: dirty() }); }); } }, icon("copy"), "Copy")),
        h("div", { class: "row-actions" },
          h("a", { class: "btn sec", href: "/" + originalUsername, target: "_blank", rel: "noopener" }, icon("external"), "Open page"),
          navigator.share ? h("button", { class: "btn sec", type: "button", onClick: function () { navigator.share({ title: S.title, url: url }).catch(function () {}); } }, icon("share"), "Share…") : null),
        h("div", { class: "divider" }),
        h("div", { class: "section-title" }, h("span", { class: "ic-tile" }, icon("link")), h("h2", null, "Link with an amount")),
        h("p", { class: "section-sub" }, "The amount is locked on the page, so customers can’t change it."),
        h("div", { class: "field" }, h("label", { for: "f-linkamt" }, "Amount in taka"), amt),
        h("button", { class: "btn sec", type: "button", onClick: function () {
          var n = parseFloat(amt.value);
          if (!(n > 0)) { T.toast("Enter an amount first", { error: true, lift: dirty() }); return amt.focus(); }
          T.copyText(url + "?amount=" + n).then(function (ok) { T.toast(ok ? "Link with " + T.taka(n) + " copied" : "Couldn’t copy", { error: !ok, lift: dirty() }); });
        } }, icon("copy"), "Copy link with amount"),
        h("div", { class: "divider" }),
        h("div", { class: "section-title" }, h("span", { class: "ic-tile" }, icon("qr")), h("h2", null, "QR for your page")),
        h("div", { class: "share-qr" }, qrBox,
          h("p", { class: "section-sub", style: "margin:0" }, "This opens your page. It isn’t a payment QR."),
          h("button", { class: "btn sec", type: "button", onClick: function () { T.qrPng(url, 1000).then(function (b) { return T.saveImage(b, "page-" + originalUsername + ".png"); }); } }, icon("download"), "Save image")),
        h("div", { class: "divider" }),
        h("div", { class: "section-title" }, h("span", { class: "ic-tile" }, icon("download")), h("h2", null, "Download your page as HTML")),
        h("p", { class: "section-sub" }, "One file with your page, styles and QR engine inside. Host it anywhere. Changes you make here won’t reach the file, so download a fresh copy after editing."),
        h("button", { class: "btn sec", type: "button", onClick: downloadShare }, icon("download"), "Download page (.html)"),
        h("div", { class: "divider" }),
        h("label", { class: "switch" }, h("span", null, h("b", null, "Page is live"), h("span", { class: "d" }, "Turn off to hide it. The link shows “doesn’t exist” until you turn it back on.")), toggle, h("span", { class: "track" })),
        h("div", { class: "danger-zone" },
          h("b", null, "Delete my page"),
          h("p", { class: "section-sub", style: "margin:0" }, "Removes your page and frees the link. Your sign-in stays, so you can start again."),
          h("button", { class: "btn danger sm", type: "button", onClick: removePage }, icon("trash"), "Delete page"))
      )
    );
  }

  /* ---------------- actions ---------------- */

  function discard() {
    try {
      S = fromRow(JSON.parse(savedRowJson));
    } catch (e) { return location.reload(); }
    U = { state: "idle", for: "" };
    renderAll();
    toast_("Changes discarded");
  }
  var savedRowJson = "";
  function toast_(m, o) { T.toast(m, o || {}); }

  /* ----- download (local mode wizard + online Share tab) ----- */

  function paintDownloadBusy(b) {
    var btn = $("dlBtn");
    if (!btn) return;
    btn.disabled = b;
    T.fill(btn, b ? h("span", { class: "spin" }) : icon("download"), b ? "Preparing…" : "Download page (.html)");
  }

  async function downloadNow() {
    if (busy) return;
    var v = validate();
    if (v) return showProblem(v);
    if (typeof T.downloadPage !== "function") {
      barMsg("The download isn’t ready yet. Reload the page and try again.", true);
      return;
    }
    busy = true;
    paintBar();
    paintDownloadBusy(true);
    try {
      var res = await T.downloadPage(toRow());
      var hint = $("dlHint");
      if (hint) {
        hint.className = "form-msg ok";
        hint.textContent = "Downloaded " + (res && res.filename ? res.filename : downloadFilename()) + ". You can download again any time.";
      }
    } catch (e) {
      var m = (e && e.message) || "Couldn’t make the file. Try again.";
      var bad = $("dlHint");
      if (bad) { bad.className = "form-msg bad"; bad.textContent = m; }
      barMsg(m, true);
    } finally {
      busy = false;
      paintBar();
      paintDownloadBusy(false);
    }
  }

  // Online Share tab: a published page can always be saved as a standalone file.
  function downloadShare() {
    if (typeof T.downloadPage !== "function") return toast_("The download isn’t ready yet. Reload the page and try again.", { error: true, lift: dirty() });
    T.downloadPage(toRow()).catch(function (e) {
      toast_((e && e.message) || "Couldn’t make the file. Try again.", { error: true, lift: dirty() });
    });
  }

  async function save() {
    if (busy) return;
    if (localMode) return; // local mode never writes to Supabase
    if (U.state === "checking") await runCheck(S.username);
    var v = validate();
    if (v) return showProblem(v);
    busy = true; paintBar();
    var row = toRow();
    var res;
    try {
      res = await sb.from("profiles").upsert(Object.assign({ user_id: user.id }, row), { onConflict: "user_id" });
    } catch (e) { res = { error: e }; }
    busy = false;
    if (res.error) {
      paintBar();
      if (res.error.code === "23505") {
        U = { state: "taken", for: S.username };
        return showProblem({ step: "link", msg: "That link was just taken. Try another.", focus: "f-user" });
      }
      var m = /fetch|network/i.test(res.error.message || "") ? "Can’t reach the server. Check your connection and try again." : "Couldn’t save: " + (res.error.message || "unknown error");
      return barMsg(m, true);
    }
    var wasNew = isNew;
    isNew = false;
    originalUsername = S.username;
    savedSnap = JSON.stringify(row);
    savedRowJson = JSON.stringify(row);
    try { localStorage.removeItem(draftKey()); } catch (e) { /* ignore */ }
    if (wasNew) {
      justPublished = true;
      tabId = "share";
      renderAll();
      toast_("Your page is live");
    } else {
      paintBar(); paintTop();
      if (current() === "share") paintPanel();
      paintNav();
      toast_("Saved");
    }
  }

  async function removePage() {
    if (!confirm("Delete your payment page? Your link will stop working.")) return;
    var r = await sb.from("profiles").delete().eq("user_id", user.id);
    if (r.error) return toast_("Couldn’t delete: " + r.error.message, { error: true, lift: dirty() });
    S = blank(); isNew = true; step = 0; originalUsername = ""; savedSnap = ""; justPublished = false; U = { state: "idle", for: "" };
    renderAll();
    toast_("Page deleted");
  }

  async function signOut() {
    await sb.auth.signOut();
    location.replace("/");
  }

  /* ---------------- password recovery ---------------- */

  function recoverySheet() {
    var p1 = h("input", { class: "input", id: "np1", type: "password", autocomplete: "new-password", placeholder: "At least 8 characters" });
    var p2 = h("input", { class: "input", id: "np2", type: "password", autocomplete: "new-password", placeholder: "Repeat it" });
    var msg = h("div", { class: "form-msg", role: "status", "aria-live": "polite" });
    var overlay = h("div", { class: "overlay", role: "dialog", "aria-modal": "true", "aria-label": "Choose a new password" },
      h("form", { class: "sheet", novalidate: true, onSubmit: async function (e) {
        e.preventDefault();
        if (p1.value.length < 8) { msg.className = "form-msg bad"; msg.textContent = "Use at least 8 characters."; return; }
        if (p1.value !== p2.value) { msg.className = "form-msg bad"; msg.textContent = "The two passwords don’t match."; return; }
        var r = await sb.auth.updateUser({ password: p1.value });
        if (r.error) { msg.className = "form-msg bad"; msg.textContent = r.error.message; return; }
        overlay.remove();
        history.replaceState(null, "", location.pathname);
        T.toast("Password updated");
      } },
        h("h2", null, "Choose a new password"),
        h("div", { class: "field" }, h("label", { for: "np1" }, "New password"), p1),
        h("div", { class: "field" }, h("label", { for: "np2" }, "Repeat password"), p2),
        msg,
        h("button", { class: "btn block", type: "submit" }, "Update password")));
    document.body.appendChild(overlay);
    p1.focus();
  }

  /* ---------------- boot ---------------- */

  function setupMissing() {
    root.replaceChildren(h("div", { class: "setup-missing" },
      h("h1", null, "Connect Supabase"),
      h("p", null, "This site isn’t connected to a database yet. Add your project URL and anon key to public/js/config.js, or set SUPABASE_URL and SUPABASE_ANON_KEY as environment variables and redeploy. The README walks through it."),
      h("a", { class: "btn", href: "/" }, "Back to home")));
  }

  document.addEventListener("paste", function (e) {
    if (current() !== "qr" || S.qr) return;
    var items = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image/") === 0 && ui.qrHandle) { ui.qrHandle(items[i].getAsFile()); return; }
    }
  });
  window.addEventListener("beforeunload", function (e) { if (dirty()) { e.preventDefault(); e.returnValue = ""; } });

  // Offline / paused backend: the same wizard, no account, a Download step at the end.
  function startLocal() {
    localMode = true;
    STEPS.push(DOWNLOAD);
    // No account and no hosted address: step 1 just asks for a name, and the
    // address used inside the exported file comes from that name.
    STEPS[0].tab = "Name";
    STEPS[0].lead = "This is the name customers see on your page.";
    try {
      var d = JSON.parse(localStorage.getItem(LOCAL_DRAFT_KEY) || "null");
      if (d && typeof d === "object") S = Object.assign(blank(), d);
    } catch (e) { /* a bad draft is the same as no draft */ }
    S.username = T.slugify(S.title) || "page";
    renderAll();
  }

  async function backendOnline() {
    if (typeof T.checkBackend === "function") return (await T.checkBackend()).online;
    return !!T.client(); // fall back to the old behaviour if an older common.js is cached
  }

  async function boot() {
    if (!(await backendOnline())) return startLocal();
    sb = T.client();
    if (!sb) return setupMissing();
    sb.auth.onAuthStateChange(function (ev) {
      if (ev === "PASSWORD_RECOVERY") recoverySheet();
      if (ev === "SIGNED_OUT") location.replace("/");
    });
    var s = await sb.auth.getSession();
    if (!s.data || !s.data.session) return location.replace("/");
    user = s.data.session.user;
    if (recovering) recoverySheet();

    var r;
    try { r = await sb.from("profiles").select("*").eq("user_id", user.id).maybeSingle(); } catch (e) { r = { error: e }; }
    if (r.error) {
      root.replaceChildren(h("div", { class: "setup-missing" }, h("h1", null, "Couldn’t load your page"),
        h("p", null, /relation|schema|profiles/i.test(r.error.message || "") ? "The database tables aren’t set up yet. Apply the SQL in supabase/migrations/ (enable the Supabase GitHub integration, or paste the files into the SQL editor)." : "Check your connection and try again."),
        h("button", { class: "btn", type: "button", onClick: function () { location.reload(); } }, "Try again")));
      return;
    }
    if (r.data) {
      isNew = false;
      S = fromRow(r.data);
      originalUsername = S.username;
      tabId = "link";
      savedSnap = JSON.stringify(toRow());
      savedRowJson = savedSnap;
    } else {
      try {
        var d = JSON.parse(localStorage.getItem(draftKey()) || "null");
        if (d && typeof d === "object") S = Object.assign(blank(), d);
      } catch (e) { /* ignore a bad draft */ }
    }
    renderAll();
  }

  boot();
})();
