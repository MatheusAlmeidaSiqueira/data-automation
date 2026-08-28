import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../app/api/weather/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../drizzle/0002_adorable_ted_forrester.sql", import.meta.url), "utf8");

test("public weather endpoint is read-only", () => {
  const getHandler = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
  assert.match(getHandler, /FROM weather_observations/);
  assert.match(getHandler, /FROM weather_forecasts/);
  assert.doesNotMatch(getHandler, /\bfetch\s*\(/);
  assert.doesNotMatch(getHandler, /\bINSERT\b/);
});

test("collector validates, retries, falls back and rate limits", () => {
  assert.match(route, /AbortSignal\.timeout\(REQUEST_TIMEOUT_MS\)/);
  assert.match(route, /schema\.parse/);
  assert.match(route, /Promise\.allSettled/);
  assert.match(route, /met_norway_fallback/);
  assert.match(route, /COLLECTION_COOLDOWN_MS/);
  assert.match(route, /status:\s*"skipped"/);
});

test("forecast history has a timestamped immutable identity", () => {
  assert.match(schema, /issuedAt:\s*text\("issued_at"\)/);
  assert.match(schema, /forecasts_issued_at_valid_provider_unique/);
  assert.match(migration, /DROP INDEX `forecasts_issue_valid_unique`/);
  assert.match(migration, /ADD `issued_at` text/);
});

test("dashboard exposes accessible data controls", () => {
  assert.match(page, /aria-pressed=/);
  assert.match(page, /role="alert"/);
  assert.match(page, /<caption className="sr-only">/);
  assert.match(page, /rainMetric/);
});

test("production build emits the server entrypoint", async () => {
  await access(new URL("../dist/server/index.js", import.meta.url));
});
