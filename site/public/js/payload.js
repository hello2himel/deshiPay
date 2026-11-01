/*
 * DeshiPay site adapter: the thin layer between these pages and the deshiQR engine.
 *
 * The payload logic lives in the separate deshiQR engine repo, loaded here as
 * `/vendor/deshiqr.global.js`. This file does not edit, encode or checksum
 * payloads itself; it only:
 *
 *   - keeps the shapes the pages already use:
 *       DeshiQR.inspect(raw), DeshiQR.build(base, amount, ref),
 *       DeshiQR.makeRef(prefix, len), DeshiQR.sanitizeAmount(text),
 *       DeshiQR.MAX_AMOUNT
 *   - delegates every payload validation to `DeshiQR.validate(payload, {warnings:false})`
 *   - delegates every payload edit + re-seal to `DeshiQR.update(payload, edits, {warnings:false})`
 *   - reuses the legacy screen copy and a small READ-ONLY TLV reader that only
 *     supplies display metadata and picks the legacy error message
 *
 * Load order: `/vendor/deshiqr.global.js` first, then `/js/payload.js`.
 * Browser: augments the engine bundle's `window.DeshiQR`. Node: `module.exports`
 * (evaluate the vendored bundle and set `globalThis.DeshiQR` before requiring).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root.DeshiQR, root);
  else root.DeshiQR = factory(root.DeshiQR, root);
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function (engine, root) {
  "use strict";

  if (!engine || typeof engine.update !== "function" || typeof engine.validate !== "function") {
    throw new Error(
      "DeshiQR site adapter: the deshiqr engine bundle is missing. Load /vendor/deshiqr.global.js before /js/payload.js.",
    );
  }

  var enc8 = new TextEncoder();
  var dec8 = new TextDecoder();
  var MAX_AMOUNT = 9999999.99;

  /* ---------------- READ-ONLY TLV reader (metadata + legacy error copy only) ----------------
   *
   * Mirrors the legacy engine's detectMode/parseTLV so an uploaded payload is
   * read with the same length unit (UTF-8 bytes first, then characters) and the
   * same TLV rules. This code only ever READS: build() returns
   * DeshiQR.update()'s output, never anything produced here.
   */

  function lengthIn(value, mode) {
    return mode === "bytes" ? enc8.encode(value).length : value.length;
  }

  function readTLV(str, mode) {
    var out = [];
    var i;
    if (mode === "bytes") {
      var b = enc8.encode(str);
      i = 0;
      while (i < b.length) {
        if (i + 4 > b.length) throw new Error("Truncated item at " + i);
        var tag = dec8.decode(b.slice(i, i + 2));
        var ls = dec8.decode(b.slice(i + 2, i + 4));
        if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(ls)) throw new Error("Bad item header at " + i);
        var len = parseInt(ls, 10);
        if (i + 4 + len > b.length) throw new Error("Item overruns the payload at " + i);
        out.push([tag, dec8.decode(b.slice(i + 4, i + 4 + len))]);
        i += 4 + len;
      }
    } else {
      i = 0;
      while (i < str.length) {
        if (i + 4 > str.length) throw new Error("Truncated item at " + i);
        var t = str.substr(i, 2);
        var l = str.substr(i + 2, 2);
        if (!/^\d{2}$/.test(t) || !/^\d{2}$/.test(l)) throw new Error("Bad item header at " + i);
        var n = parseInt(l, 10);
        if (i + 4 + n > str.length) throw new Error("Item overruns the payload at " + i);
        out.push([t, str.substr(i + 4, n)]);
        i += 4 + n;
      }
    }
    return out;
  }

  // Read-only re-encode, used solely to confirm which length unit round-trips.
  function reencodeReadOnly(items, mode) {
    return items
      .map(function (it) {
        var len = lengthIn(it[1], mode);
        if (len > 99) throw new Error("Value too long for tag " + it[0]);
        return it[0] + String(len).padStart(2, "0") + it[1];
      })
      .join("");
  }

  // { mode, items } for the first unit that parses and round-trips, else null.
  function readPayload(str) {
    var modes = ["bytes", "chars"];
    for (var k = 0; k < modes.length; k++) {
      try {
        var items = readTLV(str, modes[k]);
        if (items.length && reencodeReadOnly(items, modes[k]) === str) return { mode: modes[k], items: items };
      } catch (e) {
        /* try the next one */
      }
    }
    return null;
  }

  function readFirst(items, tag) {
    for (var i = 0; i < items.length; i++) if (items[i][0] === tag) return items[i][1];
    return undefined;
  }

  function readSub(value, mode) {
    try {
      return readTLV(value, mode);
    } catch (e) {
      return null;
    }
  }

  /* ---------------- inspect ---------------- */

  function fail(error) {
    return { ok: false, error: error };
  }

  // Validates a scanned/pasted payload and returns what the app needs to store.
  // The report shape and the messages are the historical ones the UI shows.
  function inspect(raw) {
    var p = String(raw == null ? "" : raw).trim();
    if (p.length < 20) return fail("That doesn’t look like a payment QR. It’s too short.");
    if (p.slice(-8, -4) !== "6304") return fail("This QR has no checksum field, so it isn’t a Bangla QR.");

    var report;
    try {
      report = engine.validate(p, { warnings: false });
    } catch (e) {
      report = { ok: false, errors: [{ code: "BAD_PAYLOAD", message: e && e.message }], warnings: [] };
    }
    var errors = (report && report.errors) || [];

    // A checksum mismatch is the legacy first message regardless of anything else.
    for (var e = 0; e < errors.length; e++) {
      if (errors[e] && errors[e].code === "CHECKSUM_MISMATCH") {
        return fail("The checksum doesn’t match. The QR may be damaged, or it isn’t a Bangla QR. Try a sharper screenshot.");
      }
    }

    var read = readPayload(p);
    if (!read) return fail("The QR data is not in the standard merchant QR format.");

    if (errors.length) {
      var first = errors[0] || {};
      return fail("Couldn’t read this QR: " + String(first.message || first.code || "unknown error"));
    }

    var items = read.items;
    var mode = read.mode;

    if (items[0][0] !== "00" || items[0][1] !== "01") return fail("This isn’t an EMV merchant QR (format indicator missing).");

    var hasAccount = items.some(function (x) {
      var n = +x[0];
      return n >= 2 && n <= 51;
    });
    if (!hasAccount) return fail("This QR has no account details in it.");

    var name = readFirst(items, "59");
    if (!name) return fail("This QR has no merchant name, so customers couldn’t verify who they’re paying.");

    var currency = readFirst(items, "53");
    if (currency && currency !== "050") return fail("This QR isn’t in Bangladeshi taka (BDT).");

    var city = readFirst(items, "60") || "";
    var amountText = readFirst(items, "54");
    var srcAmount = amountText ? parseFloat(amountText) || 0 : 0;

    var ref = null;
    var t62 = readFirst(items, "62");
    if (t62) {
      var sub = readSub(t62, mode);
      if (sub) ref = readFirst(sub, "01") || null;
    }

    // First merchant-account template carries a GUID in sub-tag 00 (e.g. "bd.org.bb.npsb")
    var guid = "";
    var acct = "";
    for (var i = 0; i < items.length; i++) {
      var n = +items[i][0];
      if (n >= 2 && n <= 51) {
        var s = readSub(items[i][1], mode);
        if (s) {
          guid = readFirst(s, "00") || "";
          acct = readFirst(s, "03") || "";
        }
        break;
      }
    }

    // The stored payload is the amount-free, reference-free version.
    var edits = { amount: null };
    if (t62 !== undefined) edits["62/01"] = null;
    var base;
    try {
      base = engine.update(p, edits, { warnings: false });
    } catch (err) {
      return fail("Couldn’t read this QR: " + err.message);
    }

    return {
      ok: true,
      base: base,
      mode: mode,
      name: name,
      city: city,
      guid: guid,
      acct: acct,
      srcAmount: srcAmount,
      hasRef: !!ref,
      refPrefix: ref ? ref.slice(0, 10) : "",
      refLen: ref ? ref.length : 0,
      tags: items
    };
  }

  /* ---------------- build ---------------- */

  function validAmount(n) {
    return typeof n === "number" && isFinite(n) && n > 0 && n <= MAX_AMOUNT;
  }

  // base: a valid payload (checksum included) as stored by inspect().base
  // amount: taka; 0 or undefined gives the plain static QR
  // ref: optional reference string (only used when amount > 0 and the QR has a tag 62)
  function build(base, amount, ref) {
    var payload = String(base == null ? "" : base).trim();
    var read = readPayload(payload);
    if (!read) throw new Error("Stored QR payload is not valid");

    var dynamic = amount !== undefined && amount !== null && amount !== 0;
    if (dynamic && !validAmount(amount)) throw new Error("Amount must be between 0.01 and 9,999,999.99");

    var has62 = read.items.some(function (x) {
      return x[0] === "62";
    });
    var edits = { amount: dynamic ? Math.round(amount * 100) / 100 : null };
    if (has62) edits["62/01"] = dynamic && ref ? ref : null;

    // Legacy compatibility: when the reference is removed from the stored base,
    // the engine collapses a tag 62 that only carried the reference, so a
    // reference-only (or empty) 62 disappears from inspect().base. Re-create the
    // container in the SAME update() call when a fresh reference is injected, so
    // the generated payload matches the legacy engine byte for byte. The
    // reference is ASCII, so its byte length is its character length.
    if (dynamic && ref && !has62) {
      var refText = String(ref);
      edits["62"] = "01" + String(refText.length).padStart(2, "0") + refText;
    }

    // The repo's engine does the edit, the re-encode and the checksum.
    return engine.update(payload, edits, { warnings: false });
  }

  /* ---------------- helpers ---------------- */

  var ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  // Keeps `prefix`, fills the remaining characters at random up to `len`.
  function makeRef(prefix, len) {
    if (!len) return null;
    var out = String(prefix || "").slice(0, len);
    var rnd = new Uint8Array(len - out.length);
    (globalThis.crypto || require("crypto").webcrypto).getRandomValues(rnd);
    for (var i = 0; i < rnd.length; i++) out += ALPHABET[rnd[i] % ALPHABET.length];
    return out;
  }

  // Typing helper: accepts Bangla digits, commas, stray characters. Max 2 decimals.
  function sanitizeAmount(s) {
    s = String(s == null ? "" : s).replace(/[০-৯]/g, function (d) {
      return String(d.charCodeAt(0) - 0x09e6);
    });
    s = s.replace(/,/g, "").replace(/[^\d.]/g, "");
    var dot = s.indexOf(".");
    if (dot >= 0) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "").slice(0, 2);
    return s.replace(/^0+(?=\d)/, "").slice(0, 11);
  }

  return Object.assign(engine, {
    inspect: inspect,
    build: build,
    makeRef: makeRef,
    sanitizeAmount: sanitizeAmount,
    MAX_AMOUNT: MAX_AMOUNT
  });
});
