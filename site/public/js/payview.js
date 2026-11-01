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

  function mount(root, initial, opts) {
    opts = opts || {};
    var page = initial;
    var method = null;
    var amount = opts.fixedAmount > 0 ? String(opts.fixedAmount) : "";
    var shown = false; // the "developing" animation only plays on first draw
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
      var save = h("button", { class: "btn", type: "button", disabled: true, onClick: onSave }, icon("download"), "Save QR image");
      qr = { input: input, err: err, box: box, save: save, payload: "" };

      input.addEventListener("input", function () {
        var s = window.DeshiQR.sanitizeAmount(input.value);
        if (s !== input.value) input.value = s;
        amount = s;
        draw();
      });

      var chips = !fixed && page.presets && page.presets.length
        ? h("div", { class: "chips" }, page.presets.map(function (a) {
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
          h("p", { class: "slip-help" }, "Paying from this phone? Save the image, then choose it from your gallery inside your payment app.")
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
      if (!(n > 0)) return empty();
      if (n > window.DeshiQR.MAX_AMOUNT) {
        qr.err.textContent = "That’s above the QR limit of ৳99,99,999.99";
        return empty();
      }
      try {
        var ref = page.ref_len ? window.DeshiQR.makeRef(page.ref_prefix, page.ref_len) : null;
        qr.payload = window.DeshiQR.build(page.qr_payload, n, ref);
        qr.box.className = "qrbox" + (shown ? "" : " dev");
        shown = true;
        qr.box.replaceChildren(T.qrSvg(qr.payload));
        qr.save.disabled = false;
      } catch (e) {
        qr.err.textContent = "Couldn’t make this QR. " + e.message;
        empty();
      }
    }
    function empty() {
      qr.payload = "";
      qr.box.className = "qrbox empty";
      qr.box.replaceChildren(h("span", null, "Enter an amount to see the QR"));
      qr.save.disabled = true;
    }
    function input_len() {
      var l = qr.input.value.length;
      if (l > 9) qr.input.setAttribute("data-len", "xl");
      else if (l > 6) qr.input.setAttribute("data-len", "l");
      else qr.input.removeAttribute("data-len");
    }
    function onSave() {
      if (!qr.payload) return;
      T.qrPng(qr.payload, 1000).then(function (blob) {
        return T.saveImage(blob, "pay-" + T.slugify(page.username || page.title || "qr") + "-" + amount + ".png");
      }).then(function (r) {
        if (r === "saved") T.toast("QR image saved");
      });
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
          return h("button", { type: "button", role: "tab", "aria-selected": String(m === method), onClick: function () { method = m; render(); } }, icon(meta[m][0]), meta[m][1]);
        }));
      }

      var card = h("section", { class: "pv-card" },
        switcher,
        panel || h("div", { class: "pv-empty" }, icon("qr"), h("b", null, "Your payment page"), h("span", null, "Add a Bangla QR, a wallet number or bank details and they’ll show up here."))
      );

      var help = method ? h("section", { class: "pv-help" },
        h("h2", null, "How to pay"),
        h("ol", { class: "pv-steps" }, STEPS[method].map(function (s) { return h("li", null, s); })),
        h("div", { class: "pv-caution" }, icon("shield"), h("span", null, "Always check the name and amount in your app before you confirm. This page doesn’t take payments; you pay from your own app."))
      ) : null;

      var tree = h("div", { class: "pv", "data-theme": page.theme || "rose" },
        h("div", { class: "pv-in" },
          h("header", { class: "pv-head" },
            h("div", { class: "pv-id" },
              h("div", { class: "pv-avatar", "aria-hidden": "true" }, T.monogram(page.title)),
              h("div", { style: "min-width:0" }, h("h1", null, page.title || "Your name"), h("div", { class: "pv-handle" }, location.host + "/" + (page.username || "yourname")))
            ),
            page.message ? h("p", { class: "pv-msg" }, page.message) : null
          ),
          card,
          help,
          h("footer", { class: "pv-foot" }, opts.preview ? null : ["Made with ", h("a", { href: "/" }, "DeshiQR")])
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
