/*
 * A tiny in-browser stand-in for supabase-js, used ONLY by the UI smoke test.
 * It mimics the handful of calls the app makes and keeps its "database" in localStorage.
 */
(function () {
  var KEY = "mock.supa";
  function load() { return JSON.parse(localStorage.getItem(KEY) || '{"users":[],"profiles":[],"session":null}'); }
  function save(d) { localStorage.setItem(KEY, JSON.stringify(d)); }
  var RESERVED = ["app", "login", "admin", "pay", "api"];

  function publicRow(p) {
    return { username: p.username, title: p.title, message: p.message, avatar: p.avatar, theme: p.theme, presets: p.presets, qr_payload: p.qr_payload, qr_name: p.qr_name, qr_city: p.qr_city, ref_prefix: p.ref_prefix, ref_len: p.ref_len, wallets: p.wallets, banks: p.banks };
  }

  function createClient() {
    var listeners = [];
    var auth = {
      getSession: async function () { return { data: { session: load().session }, error: null }; },
      onAuthStateChange: function (cb) { listeners.push(cb); return { data: { subscription: { unsubscribe: function () {} } } }; },
      signUp: async function (a) {
        var d = load();
        if (d.users.some(function (u) { return u.email === a.email; })) return { data: { user: { identities: [] }, session: null }, error: null };
        d.pending = { type: "signup", email: a.email, token: "123456", password: a.password };
        save(d);
        return { data: { user: { identities: [{ id: "pending" }] }, session: null }, error: null };
      },
      resend: async function (a) {
        var d = load();
        d.pending = { type: a.type || "signup", email: a.email, token: "123456" };
        save(d);
        return { data: {}, error: null };
      },
      verifyOtp: async function (a) {
        var d = load();
        var p = d.pending;
        if (!p || p.email !== a.email || p.token !== String(a.token) || p.type !== a.type) {
          return { data: {}, error: { message: "Token has expired or is invalid" } };
        }
        var u = d.users.filter(function (x) { return x.email === a.email; })[0];
        if (!u) {
          u = { id: "u" + (d.users.length + 1), email: a.email, password: p.password || "correct-horse-1" };
          d.users.push(u);
        } else if (p.type === "recovery" && p.password) {
          u.password = p.password;
        }
        d.session = { user: { id: u.id, email: u.email } };
        delete d.pending;
        save(d);
        return { data: { session: d.session }, error: null };
      },
      signInWithPassword: async function (a) {
        var d = load();
        var u = d.users.filter(function (x) { return x.email === a.email && x.password === a.password; })[0];
        if (!u) return { data: {}, error: { message: "Invalid login credentials" } };
        d.session = { user: { id: u.id, email: u.email } };
        save(d);
        return { data: { session: d.session }, error: null };
      },
      signOut: async function () { var d = load(); d.session = null; save(d); listeners.forEach(function (cb) { cb("SIGNED_OUT"); }); return { error: null }; },
      resetPasswordForEmail: async function (email) {
        var d = load();
        d.pending = { type: "recovery", email: email, token: "123456" };
        save(d);
        return { data: {}, error: null };
      },
      updateUser: async function (a) {
        var d = load();
        if (!d.session) return { data: {}, error: { message: "not signed in" } };
        var u = d.users.filter(function (x) { return x.email === d.session.user.email; })[0];
        if (u && a.password) u.password = a.password;
        save(d);
        return { data: {}, error: null };
      },
      signInWithOAuth: async function () { return { data: {}, error: null }; }
    };

    function from(table) {
      var q = { op: "select", filters: [], row: null, single: false };
      function run() {
        var d = load();
        var rows = d.profiles.filter(function (r) { return q.filters.every(function (f) { return r[f[0]] === f[1]; }); });
        if (!d.session) return Promise.resolve({ data: null, error: { message: "not signed in" } });
        if (q.op === "select") return Promise.resolve({ data: q.single ? rows[0] || null : rows, error: null });
        if (q.op === "delete") {
          d.profiles = d.profiles.filter(function (r) { return rows.indexOf(r) < 0; });
          save(d);
          return Promise.resolve({ data: null, error: null });
        }
        var row = q.row;
        if (row.user_id !== d.session.user.id) return Promise.resolve({ data: null, error: { message: "row-level security" } });
        if (d.profiles.some(function (p) { return p.username === row.username && p.user_id !== row.user_id; })) return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key" } });
        var i = d.profiles.findIndex(function (p) { return p.user_id === row.user_id; });
        var merged = Object.assign({}, i >= 0 ? d.profiles[i] : {}, row);
        if (i >= 0) d.profiles[i] = merged; else d.profiles.push(merged);
        save(d);
        return Promise.resolve({ data: merged, error: null });
      }
      var api = {
        select: function () { q.op = "select"; return api; },
        upsert: function (r) { q.op = "upsert"; q.row = r; return api; },
        delete: function () { q.op = "delete"; return api; },
        eq: function (k, v) { q.filters.push([k, v]); return api; },
        maybeSingle: function () { q.single = true; return run(); },
        then: function (a, b) { return run().then(a, b); }
      };
      return api;
    }

    async function rpc(name, args) {
      var d = load();
      if (name === "get_public_page") {
        var p = d.profiles.filter(function (x) { return x.username === String(args.p_username).toLowerCase() && x.is_published; })[0];
        return { data: p ? publicRow(p) : null, error: null };
      }
      if (name === "username_available") {
        var u = args.p_username;
        return { data: RESERVED.indexOf(u) < 0 && !d.profiles.some(function (x) { return x.username === u; }), error: null };
      }
      return { data: null, error: { message: "unknown rpc" } };
    }

    return { auth: auth, from: from, rpc: rpc };
  }

  window.supabase = { createClient: createClient };
})();
