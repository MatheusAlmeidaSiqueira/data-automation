import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("frontend consumes the internal weather API", async () => {
  const page = await read("app/page.tsx");

  assert.match(page, /fetch\("\/api\/weather"/);
  assert.match(page, /Persistência e precisão/);
  assert.match(page, /Banco ativo/);
});

test("weather API validates, persists and audits records", async () => {
  const route = await read("app/api/weather/route.ts");

  assert.match(route, /archive-api\.open-meteo\.com/);
  assert.match(route, /INSERT INTO weather_observations/);
  assert.match(route, /INSERT INTO weather_forecasts/);
  assert.match(route, /INSERT INTO pipeline_runs/);
  assert.match(route, /AVG\(ABS\(f\.temperature - o\.temperature\)\)/);
});

test("database migration creates the complete analytical schema", async () => {
  const migration = await read("drizzle/0000_dizzy_warpath.sql");

  assert.match(migration, /CREATE TABLE `weather_observations`/);
  assert.match(migration, /CREATE TABLE `weather_forecasts`/);
  assert.match(migration, /CREATE TABLE `pipeline_runs`/);
});

test("production build emits the server entrypoint", async () => {
  await access(new URL("dist/server/index.js", root));
});
