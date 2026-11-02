/*
 * PayView renders the customer-facing payment page. It is used by pay.html
 * (the real page) and by the dashboard (the live preview), so what the owner
 * sees while editing is exactly what customers get.
 *
 * It only ever SHOWS payment details. There is no payment confirmation logic.
 *
 * page shape (same as get_public_page() / the profiles row):
 *   { username, title, message, theme, presets[], qr_payload, qr_name, qr_city,
 *     ref_prefix, ref_len, wallets[{provider,type,number}], banks[{bank,name,number,branch,routing,swift}] }
 */
(function () {
  "use strict";
  var T = window.Deshi, h = T.h, icon = T.icon;
  var HELP_TEXT = "Paying from this phone? Save it to your gallery, then choose it inside your payment app.";

  function mount(root, initial, opts) {
    opts = opts || {};
    var page = initial;
    var method = opts.method || null;
    var amount = opts.fixedAmount > 0
      ? String(opts.fixedAmount)
      : (opts.preferredAmount > 0 ? String(opts.preferredAmount) : "");
    var inputLimit = (window.DeshiQR && (window.DeshiQR.MAX_INPUT_AMOUNT || window.DeshiQR.MAX_AMOUNT)) || 50000;
    var qr = {}; // live refs for the QR panel

    function methods() {
      var m = [];
      if (page.qr_payload) m.push("qr");
      if (page.wallets && page.wallets.length) m.push("wallet");
      if (page.banks && page.banks.length) m.push("bank");
      return m;
    }

    /* ---------- QR panel ---------- */

    function qrPanel() {
      var fixed = opts.fixedAmount > 0;
      var input = h("input", {
        class: "amt-input", type: "text", inputmode: "decimal", autocomplete: "off", autocapitalize: "off",
        spellcheck: "false", placeholder: "0", "aria-label": "Amount in taka", value: amount, readOnly: fixed
      });
      var err = h("div", { class: "amt-err", role: "alert" });
      var box = h("div", { class: "qrbox empty", "aria-live": "polite" }, h("span", null, "Enter an amount to see the QR"));
      var save = h("button", { class: "btn", type: "button", disabled: true, onClick: onSave }, icon("download"), "Save to gallery");
      var help = h("p", { class: "slip-help" }, HELP_TEXT);
      qr = { input: input, err: err, box: box, save: save, help: help, payload: "" };

      input.addEventListener("input", function () {
        var s = window.DeshiQR.sanitizeAmount(input.value);
        if (s !== input.value) input.value = s;
        amount = s;
        draw();
      });

      var chips = !fixed && page.presets && page.presets.length
        ? h("div", { class: "chips" }, page.presets.filter(function (a) { return a <= inputLimit; }).map(function (a) {
            return h("button", { class: "chip", type: "button", onClick: function () { input.value = String(a); amount = String(a); draw(); } }, T.taka(a));
          }))
        : null;

      var slip = h("div", { class: "slip" },
        h("div", { class: "slip-top" },
          h("div", { class: "slip-to" }, h("span", null, "Pay to"), h("b", null, page.qr_name || page.title)),
          h("div", { class: "amt" }, h("span", { class: "amt-sym" }, "৳"), input),
          err,
          chips,
          fixed ? h("p", { class: "fixed-note" }, "Amount set by " + page.title) : null
        ),
        h("div", { class: "cut" }),
        h("div", { class: "slip-bot center" },
          box,
          h("div", { class: "slip-actions" }, save),
          help
        )
      );
      draw();
      if (!opts.preview && !fixed && window.matchMedia && matchMedia("(pointer: fine)").matches) setTimeout(function () { input.focus(); }, 50);
      return slip;
    }

    function draw() {
      var n = parseFloat(amount);
      input_len();
      qr.err.textContent = "";
      if (!(n > 0)) return showBaseQr();
      if (n > inputLimit) {
        qr.err.textContent = "That’s above the page limit of ৳50,000.";
        showBaseQr();
        qr.help.textContent = "Amounts are capped at ৳50,000. Scan the QR and type the amount in your app, or enter a smaller amount above.";
        return;
      }
      try {
        var ref = page.ref_len ? window.DeshiQR.makeRef(page.ref_prefix, page.ref_len) : null;
        qr.payload = window.DeshiQR.build(page.qr_payload, n, ref);
        qr.box.className = "qrbox dev";
        qr.box.replaceChildren(T.qrSvg(qr.payload));
        qr.save.disabled = false;
        qr.help.textContent = HELP_TEXT;
      } catch (e) {
        qr.err.textContent = "Couldn’t make this QR. " + e.message;
        empty();
      }
    }
    // No amount: show the owner's static QR so the payer can type the amount
    // inside their own banking app.
    function showBaseQr() {
      if (!page.qr_payload) return empty();
      try {
        qr.payload = page.qr_payload;
        qr.box.className = "qrbox dev";
        qr.box.replaceChildren(T.qrSvg(page.qr_payload));
        qr.save.disabled = false;
        qr.help.textContent = "No amount set. Scan this QR and type the amount in your payment app, or enter one above for a ready-made QR.";
      } catch (e) {
        empty();
      }
    }
    function empty() {
      qr.payload = "";
      qr.box.className = "qrbox empty";
      qr.box.replaceChildren(h("span", null, "Enter an amount to see the QR"));
      qr.save.disabled = true;
      if (qr.help) qr.help.textContent = HELP_TEXT;
    }
    function input_len() {
      var l = qr.input.value.length;
      if (l > 9) qr.input.setAttribute("data-len", "xl");
      else if (l > 6) qr.input.setAttribute("data-len", "l");
      else qr.input.removeAttribute("data-len");
    }
    function onSave() {
      if (!qr.payload) return;
      // Download the A5 print poster as a 300 dpi PNG. The QR reflects the
      // amount currently on screen (or stays amount-free if none is set).
      if (!window.DeshiPoster || !page.qr_payload) {
        return T.qrPng(qr.payload, 1000).then(function (blob) {
          return T.saveImage(blob, "pay-" + T.slugify(page.username || page.title || "qr") + "-" + (amount || "no-amount") + ".png");
        }).then(function (r) { if (r === "saved") T.toast("Image saved"); });
      }
      var n = parseFloat(amount);
      var pp = {
        username: page.username, title: page.title, message: page.message,
        qr_name: page.qr_name, qr_city: page.qr_city,
        ref_prefix: page.ref_prefix, ref_len: page.ref_len,
        qr_payload: page.qr_payload
      };
      if (n > 0) {
        try {
          var ref = page.ref_len ? window.DeshiQR.makeRef(page.ref_prefix, page.ref_len) : null;
          pp.qr_payload = window.DeshiQR.build(page.qr_payload, n, ref);
          pp.amount = n;
          pp.amountLabel = T.taka(n);
        } catch (e) {
          return T.toast("Couldn’t make the poster QR", { error: true });
        }
      }
      var svg = window.DeshiPoster.build(pp, "a5");
      if (!svg) return T.toast("Couldn’t make the poster", { error: true });
      var xml = new XMLSerializer().serializeToString(svg);
      var url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
      var img = new Image();
      img.onload = function () {
        var c = document.createElement("canvas");
        c.width = 1748; c.height = 2480; // A5 at 300 dpi
        var g = c.getContext("2d");
        g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (blob) {
          if (!blob) return T.toast("Couldn’t prepare the poster", { error: true });
          T.saveImage(blob, window.DeshiPoster.filename(pp, "a5").replace(/\.svg$/, ".png")).then(function (r) {
            if (r === "saved") T.toast("Saved to gallery");
          });
        }, "image/png");
      };
      img.onerror = function () { URL.revokeObjectURL(url); T.toast("Couldn’t prepare the poster", { error: true }); };
      img.src = url;
    }

    /* ---------- wallet and bank panels ---------- */

    function copyRow(label, value, o) {
      o = o || {};
      var go = h("span", { class: "go" }, icon("copy"));
      var btn = h("button", {
        class: "copyrow" + (o.big ? " big" : ""), type: "button", "aria-label": "Copy " + label + " " + (o.shown || value),
        onClick: function () {
          T.copyText(value).then(function (ok) {
            if (!ok) return T.toast("Couldn’t copy. Press and hold to select it.", { error: true });
            btn.classList.add("done");
            go.replaceChildren(icon("check"));
            T.toast(label + " copied");
            setTimeout(function () { btn.classList.remove("done"); go.replaceChildren(icon("copy")); }, 1400);
          });
        }
      }, h("span", { class: "kv" }, h("span", { class: "k" }, label), h("span", { class: "v" }, o.shown || value)), go);
      return btn;
    }

    function walletPanel() {
      var rows = page.wallets.map(function (w) {
        var p = T.wallet(w.provider), ty = T.walletType(w.type);
        return h("div", { class: "item" },
          h("div", { class: "item-head" },
            h("div", { class: "logo", style: "background:" + p.color, "aria-hidden": "true" }, p.name.charAt(0)),
            h("div", null, h("div", { class: "item-title" }, p.name), h("div", { class: "item-sub" }, ty.name + " number · use “" + ty.action + "”"))
          ),
          copyRow("Number", w.number, { big: true, shown: T.showPhone(w.number) })
        );
      });
      return h("div", { class: "slip" },
        h("div", { class: "slip-top" }, h("div", { class: "slip-to" }, h("span", null, "Send to"), h("b", null, page.title))),
        h("div", { class: "cut" }),
        h("div", { class: "slip-bot" }, h("div", { class: "rows" }, rows), h("p", { class: "rows-note" }, "Tap a number to copy it."))
      );
    }

    function bankPanel() {
      var rows = page.banks.map(function (b) {
        var lines = [["Account name", b.name], ["Account number", b.number, true], ["Bank", b.bank], ["Branch", b.branch], ["Routing number", b.routing, true], ["SWIFT", b.swift]]
          .filter(function (r) { return r[1]; });
        var all = lines.map(function (r) { return r[0] + ": " + r[1]; }).join("\n");
        return h("div", { class: "item" },
          h("div", { class: "item-head" },
            h("div", { class: "logo", style: "background:var(--slip-accent)", "aria-hidden": "true" }, icon("bank")),
            h("div", null, h("div", { class: "item-title" }, b.bank), h("div", { class: "item-sub" }, b.branch ? b.branch + " branch" : "Bank transfer"))
          ),
          lines.filter(function (r) { return r[0] !== "Bank"; }).map(function (r) { return copyRow(r[0], r[1], { big: r[2] }); }),
          h("div", { class: "item-foot" }, h("button", { class: "btn sec block sm", type: "button", onClick: function () {
            T.copyText(all).then(function (ok) { T.toast(ok ? "All bank details copied" : "Couldn’t copy", { error: !ok }); });
          } }, icon("copy"), "Copy all details"))
        );
      });
      return h("div", { class: "slip" },
        h("div", { class: "slip-top" }, h("div", { class: "slip-to" }, h("span", null, "Bank transfer to"), h("b", null, page.title))),
        h("div", { class: "cut" }),
        h("div", { class: "slip-bot" }, h("div", { class: "rows" }, rows), h("p", { class: "rows-note" }, "Tap any line to copy it."))
      );
    }

    function worksWithStrip() {
      var L = window.DeshiPayIcons;
      if (!L) return null;
      var wanted = { "Citytouch": 1, "BRAC Bank Astha": 1, "EBL Skybanking": 1, "MTB Neo": 1 };
      var apps = h("span", { class: "works-with-apps" }, L.mfs.concat(L.banks.filter(function (b) { return wanted[b.name]; })).map(function (it) {
        return h("span", { class: "works-with-app", title: it.name },
          h("img", { src: it.src, alt: it.name, loading: "lazy" }));
      }));
      return h("section", { class: "works-with pv-works", "aria-label": "Works with" },
        h("span", { class: "works-with-inner" },
          h("span", { class: "works-with-label" }, "Works with"),
          apps,
          h("span", null, "and any bank app")));
    }

    /* ---------- page ---------- */

    var STEPS = {
      qr: [opts.fixedAmount > 0 ? "Check the amount due" : "Enter the amount to pay", "Open bKash, Nagad or any bank app and choose Scan QR", "Check the name, confirm, and enter your PIN"],
      wallet: ["Open your wallet app and choose Send Money", "Paste the number and enter the amount", "Check the name, confirm, and enter your PIN"],
      bank: ["Open your banking app and choose Transfer", "Copy the account details and enter the amount", "Check the name, confirm, and keep the receipt"]
    };

    function render() {
      var ms = methods();
      if (ms.indexOf(method) < 0) method = ms[0] || null;
      var panel = method === "qr" ? qrPanel() : method === "wallet" ? walletPanel() : method === "bank" ? bankPanel() : null;

      var switcher = null;
      if (ms.length > 1) {
        var meta = { qr: ["qr", "Scan QR"], wallet: ["wallet", "Wallet"], bank: ["bank", "Bank"] };
        switcher = h("div", { class: "seg pv-methods", role: "tablist", "aria-label": "How do you want to pay?" }, ms.map(function (m) {
          return h("button", { type: "button", role: "tab", "aria-selected": String(m === method), onClick: function () {
          method = m;
          if (opts.syncUrl) {
            try {
              var u = new URL(location.href);
              if (m === "qr") u.searchParams.delete("method");
              else u.searchParams.set("method", m);
              history.replaceState(null, "", u);
            } catch (e) { /* URL sync is a nicety */ }
          }
          render();
        } }, icon(meta[m][0]), meta[m][1]);
        }));
      }

      var card = h("section", { class: "pv-card" },
        switcher,
        panel || h("div", { class: "pv-empty" }, icon("qr"), h("b", null, "Your payment page"), h("span", null, "Add a Bangla QR, a wallet number or bank details and they’ll show up here."))
      );

      var help = method ? h("section", { class: "pv-help" },
        h("h2", null, "How to pay"),
        h("ol", { class: "pv-steps" }, STEPS[method].map(function (s) { return h("li", null, s); })),
        h("div", { class: "pv-caution" }, icon("shield"), h("span", null, "DeshiPay is not a payment processor: it never takes, holds or confirms payments, and takes no cut or commission. Always check the name and amount in your app; you pay from your own banking app."))
      ) : null;

      var tree = h("div", { class: "pv", "data-theme": page.theme || "emerald" },
        h("div", { class: "pv-in" },
          h("header", { class: "pv-head" },
            h("div", { class: "pv-id" },
              h("div", { class: "pv-avatar", "aria-hidden": "true" },
                (page.avatar && T.avatar ? T.avatar(page.avatar) : null) || T.monogram(page.title)),
              h("div", { style: "min-width:0" }, h("h1", null, page.title || "Your name"), opts.hideHandle ? null : h("div", { class: "pv-handle" }, location.host + "/" + (page.username || "yourname")))
            ),
            page.message ? h("p", { class: "pv-msg" }, page.message) : null
          ),
          card,
          help,
          opts.preview ? null : worksWithStrip(),
          opts.preview ? null : h("footer", { class: "pv-foot" },
            h("div", { class: "made-line" },
              h("span", { class: "made-kicker" }, "Made with"),
              h("a", { class: "brand made-brand", href: opts.footerHref || "/" }, T.mark(), "DeshiPay")
            ),
            h("div", { class: "made-actions" },
              h("a", { class: "made-cta", href: opts.footerHref || "/" },
                "Create your own page", icon("next")),
              h("a", { class: "made-cta made-report", href: "mailto:stargzr.science@gmail.com?subject=" + encodeURIComponent("Report abuse on DeshiPay: " + (page.username || page.title || "")) },
                icon("alert"), "Report abuse")
            )
          )
        )
      );
      root.replaceChildren(tree);
    }

    render();
    return {
      update: function (p) { page = p; render(); },
      destroy: function () { root.replaceChildren(); }
    };
  }

  window.PayView = { mount: mount };
})();
