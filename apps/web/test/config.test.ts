import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveConfig } from "../src/lib/config.ts";

test("no configuration means honest local mode", () => {
  const config = resolveConfig({});
  assert.equal(config.mode, "local");
  assert.equal(config.supabaseUrl, null);
  assert.equal(config.supabaseAnonKey, null);
});

test("window.DESHIQR_CONFIG enables Supabase mode", () => {
  const config = resolveConfig({
    windowConfig: {
      supabaseUrl: "https://project.supabase.co/",
      supabaseAnonKey: "anon-key",
      canonicalOrigin: "https://deshiqr.example",
    },
  });
  assert.equal(config.mode, "supabase");
  assert.equal(config.supabaseUrl, "https://project.supabase.co");
  assert.equal(config.supabaseAnonKey, "anon-key");
  assert.equal(config.canonicalOrigin, "https://deshiqr.example");
});

test("nested window config shape is accepted", () => {
  const config = resolveConfig({
    windowConfig: { supabase: { url: "https://nested.supabase.co", anonKey: "nested-key" } },
  });
  assert.equal(config.mode, "supabase");
  assert.equal(config.supabaseUrl, "https://nested.supabase.co");
  assert.equal(config.supabaseAnonKey, "nested-key");
});

test("VITE_ env values are the fallback", () => {
  const config = resolveConfig({
    envUrl: "https://env.supabase.co",
    envKey: "env-key",
  });
  assert.equal(config.mode, "supabase");
  assert.equal(config.supabaseUrl, "https://env.supabase.co");
  assert.equal(config.supabaseAnonKey, "env-key");
});

test("window config wins over env", () => {
  const config = resolveConfig({
    windowConfig: { supabaseUrl: "https://window.supabase.co", supabaseAnonKey: "window-key" },
    envUrl: "https://env.supabase.co",
    envKey: "env-key",
  });
  assert.equal(config.supabaseUrl, "https://window.supabase.co");
});

test("partial or invalid configuration falls back to local mode", () => {
  assert.equal(resolveConfig({ envUrl: "https://env.supabase.co" }).mode, "local");
  assert.equal(resolveConfig({ envKey: "env-key" }).mode, "local");
  assert.equal(
    resolveConfig({ envUrl: "not a url", envKey: "env-key" }).mode,
    "local",
  );
  assert.equal(
    resolveConfig({ envUrl: "ftp://bad.example", envKey: "key" }).mode,
    "local",
  );
  assert.equal(resolveConfig({ windowConfig: "nope" }).mode, "local");
  assert.equal(resolveConfig({ windowConfig: [1, 2] }).mode, "local");
});

test("blank strings are treated as absent", () => {
  const config = resolveConfig({
    windowConfig: { supabaseUrl: "   ", supabaseAnonKey: "  " },
    envUrl: "https://env.supabase.co",
    envKey: "env-key",
  });
  assert.equal(config.mode, "supabase");
  assert.equal(config.supabaseUrl, "https://env.supabase.co");
});
