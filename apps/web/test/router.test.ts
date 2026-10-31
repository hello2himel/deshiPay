import { test } from "node:test";
import assert from "node:assert/strict";

import { resolvePath, resolveRoute, routePath, routeTitle } from "../src/lib/router.ts";

const BASE = "/deshiQR/";

test("resolves the canonical path routes", () => {
  assert.deepEqual(resolveRoute({ pathname: "/", hash: "", search: "" }, "/"), { name: "home" });
  assert.deepEqual(resolveRoute({ pathname: "/new", hash: "", search: "" }, "/"), { name: "new" });
  assert.deepEqual(resolveRoute({ pathname: "/login", hash: "", search: "" }, "/"), { name: "login" });
  assert.deepEqual(resolveRoute({ pathname: "/dashboard", hash: "", search: "" }, "/"), {
    name: "dashboard",
  });
  assert.deepEqual(resolveRoute({ pathname: "/p/demo", hash: "", search: "" }, "/"), {
    name: "pay",
    slug: "demo",
  });
  assert.deepEqual(resolveRoute({ pathname: "/@demo", hash: "", search: "" }, "/"), {
    name: "pay",
    slug: "demo",
  });
  assert.deepEqual(resolveRoute({ pathname: "/i/abc123", hash: "", search: "" }, "/"), {
    name: "invoice",
    token: "abc123",
  });
});

test("strips a deploy base such as /deshiQR/", () => {
  assert.deepEqual(resolveRoute({ pathname: "/deshiQR/", hash: "", search: "" }, BASE), { name: "home" });
  assert.deepEqual(resolveRoute({ pathname: "/deshiQR/p/demo", hash: "", search: "" }, BASE), {
    name: "pay",
    slug: "demo",
  });
  assert.deepEqual(resolveRoute({ pathname: "/deshiQR/new", hash: "", search: "" }, BASE), { name: "new" });
  assert.deepEqual(resolveRoute({ pathname: "/deshiQR/@shop", hash: "", search: "" }, BASE), {
    name: "pay",
    slug: "shop",
  });
  assert.deepEqual(resolveRoute({ pathname: "/deshiQR/i/token", hash: "", search: "" }, BASE), {
    name: "invoice",
    token: "token",
  });
  assert.deepEqual(resolveRoute({ pathname: "/deshiQR/dashboard", hash: "", search: "" }, BASE), {
    name: "dashboard",
  });
});

test("hash-router fallbacks work", () => {
  assert.deepEqual(resolveRoute({ pathname: "/", hash: "#/p/demo", search: "" }, "/"), {
    name: "pay",
    slug: "demo",
  });
  assert.deepEqual(resolveRoute({ pathname: "/", hash: "#/i/token", search: "" }, "/"), {
    name: "invoice",
    token: "token",
  });
  assert.deepEqual(resolveRoute({ pathname: "/", hash: "#/dashboard", search: "" }, "/"), {
    name: "dashboard",
  });
  assert.deepEqual(resolveRoute({ pathname: "/", hash: "#/new", search: "" }, "/"), { name: "new" });
  assert.deepEqual(resolveRoute({ pathname: "/", hash: "#/login", search: "" }, "/"), { name: "login" });
});

test("self-contained #p= links resolve to the inline pay page", () => {
  const route = resolveRoute(
    { pathname: "/", hash: "#p=0002010102&t=DEMO%20STORE&pr=100%2C500", search: "" },
    "/",
  );
  assert.equal(route.name, "inline");
  if (route.name !== "inline") return;
  assert.equal(route.link.payload, "0002010102");
  assert.equal(route.link.title, "DEMO STORE");
  assert.deepEqual(route.link.presets, [100, 500]);

  // The inline link wins over a path route.
  const overPath = resolveRoute(
    { pathname: "/new", hash: "#p=0002010102&t=Shop", search: "" },
    "/",
  );
  assert.equal(overPath.name, "inline");
});

test("?m=slug fallback opens the pay page", () => {
  assert.deepEqual(resolveRoute({ pathname: "/", hash: "", search: "?m=demo" }, "/"), {
    name: "pay",
    slug: "demo",
  });
  assert.deepEqual(resolveRoute({ pathname: "/unknown", hash: "", search: "?m=demo" }, "/"), {
    name: "pay",
    slug: "demo",
  });
});

test("trailing slashes, encoded slugs and unknown paths", () => {
  assert.deepEqual(resolveRoute({ pathname: "/p/demo/", hash: "", search: "" }, "/"), {
    name: "pay",
    slug: "demo",
  });
  assert.deepEqual(resolveRoute({ pathname: "/p/demo%20shop", hash: "", search: "" }, "/"), {
    name: "pay",
    slug: "demo shop",
  });
  assert.deepEqual(resolveRoute({ pathname: "/nope", hash: "", search: "" }, "/"), {
    name: "notFound",
    path: "/nope",
  });
  assert.deepEqual(resolvePath("/dashboard/settings"), { name: "dashboard" });
});

test("routePath and routeTitle round-trip", () => {
  const routes = [
    { name: "home" } as const,
    { name: "new" } as const,
    { name: "login" } as const,
    { name: "dashboard" } as const,
    { name: "pay", slug: "demo" } as const,
    { name: "invoice", token: "abc" } as const,
  ];
  for (const route of routes) {
    const path = routePath(route);
    assert.ok(path.startsWith("/"));
    const resolved = resolvePath(path);
    assert.equal(resolved.name, route.name);
  }
  assert.match(routeTitle({ name: "home" }), /deshiQR/);
  assert.match(routeTitle({ name: "pay", slug: "demo" }), /demo/);
});
