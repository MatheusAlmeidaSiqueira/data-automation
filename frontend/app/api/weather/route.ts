import { env } from "cloudflare:workers";
import { z } from "zod";

export const dynamic = "force-dynamic";

type DisplaySource = "historical" | "forecast";
type RainMetric = "amount" | "probability" | "derived_risk";
type WeatherPoint = { time: string; temperature: number; humidity: number; rain: number; wind: number; source: DisplaySource; rainMetric: RainMetric };
type ObservationPoint = { time: string; temperature: number; humidity: number; precipitation: number; wind: number };

const LATITUDE = "-23.4628";
const LONGITUDE = "-46.5333";
const TIMEZONE = "America/Sao_Paulo";
const REQUEST_TIMEOUT_MS = 10_000;
const COLLECTION_COOLDOWN_MS = 45 * 60 * 1000;
const INITIAL_HISTORY_TARGET = 8_000;

const hourlySchema = z.object({
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: z.array(z.number().nullable()),
    relative_humidity_2m: z.array(z.number().nullable()),
    precipitation_probability: z.array(z.number().nullable()).optional(),
    precipitation: z.array(z.number().nullable()).optional(),
    wind_speed_10m: z.array(z.number().nullable()),
  }),
});

const metNoSchema = z.object({
  properties: z.object({
    timeseries: z.array(z.object({
      time: z.string(),
      data: z.object({
        instant: z.object({ details: z.object({ air_temperature: z.number(), relative_humidity: z.number(), wind_speed: z.number() }) }),
        next_1_hours: z.object({ summary: z.object({ symbol_code: z.string().optional() }).optional(), details: z.object({ precipitation_amount: z.number().optional() }).optional() }).optional(),
        next_6_hours: z.object({ summary: z.object({ symbol_code: z.string().optional() }).optional(), details: z.object({ precipitation_amount: z.number().optional() }).optional() }).optional(),
      }),
    })),
  }),
});

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function validValues(temperature: number, humidity: number, rain: number, wind: number) {
  return [temperature, humidity, rain, wind].every(finite)
    && temperature >= -60 && temperature <= 60
    && humidity >= 0 && humidity <= 100
    && rain >= 0 && wind >= 0 && wind <= 400;
}

async function fetchValidated<T>(url: string, schema: z.ZodType<T>, headers?: HeadersInit): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`Upstream status ${response.status}`);
      return schema.parse(await response.json());
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Upstream unavailable");
}

function openMeteoRows(payload: z.infer<typeof hourlySchema>, source: DisplaySource) {
  const { hourly } = payload;
  const isForecast = source === "forecast";
  let rejected = 0;
  const rows: WeatherPoint[] = [];
  hourly.time.forEach((time, index) => {
    const temperature = Number(hourly.temperature_2m[index]);
    const humidity = Number(hourly.relative_humidity_2m[index]);
    const rain = Number(isForecast ? hourly.precipitation_probability?.[index] : hourly.precipitation?.[index]);
    const wind = Number(hourly.wind_speed_10m[index]);
    if (!time || !validValues(temperature, humidity, rain, wind)) { rejected += 1; return; }
    rows.push({ time, temperature, humidity, rain, wind, source, rainMetric: isForecast ? "probability" : "amount" });
  });
  return { rows, rejected };
}

function rainRisk(amount: number, symbol: string) {
  if (amount >= 10) return 95;
  if (amount >= 5) return 85;
  if (amount >= 2) return 70;
  if (amount >= 0.5) return 55;
  if (amount > 0) return 35;
  if (/rain|sleet|snow/.test(symbol)) return 45;
  if (symbol.includes("cloudy")) return 15;
  return 5;
}

function metNoRows(payload: z.infer<typeof metNoSchema>) {
  let rejected = 0;
  const rows: WeatherPoint[] = [];
  payload.properties.timeseries.forEach((entry) => {
    const details = entry.data.instant.details;
    const period = entry.data.next_1_hours ?? entry.data.next_6_hours;
    const amount = Number(period?.details?.precipitation_amount ?? 0);
    const row: WeatherPoint = {
      time: entry.time,
      temperature: details.air_temperature,
      humidity: details.relative_humidity,
      rain: rainRisk(amount, period?.summary?.symbol_code ?? ""),
      wind: details.wind_speed * 3.6,
      source: "forecast",
      rainMetric: "derived_risk",
    };
    if (!validValues(row.temperature, row.humidity, row.rain, row.wind)) { rejected += 1; return; }
    rows.push(row);
  });
  return { rows, rejected };
}

async function collectForecast() {
  const params = new URLSearchParams({
    latitude: LATITUDE, longitude: LONGITUDE, timezone: TIMEZONE, forecast_days: "16",
    hourly: "temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m",
  });
  try {
    const payload = await fetchValidated(`https://api.open-meteo.com/v1/forecast?${params}`, hourlySchema);
    return { ...openMeteoRows(payload, "forecast"), provider: "open_meteo" };
  } catch {
    const payload = await fetchValidated(
      `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${LATITUDE}&lon=${LONGITUDE}`,
      metNoSchema,
      { "User-Agent": "WeatherFlowAnalytics/2.0 matheusalmeidasiqueira2006@gmail.com" },
    );
    return { ...metNoRows(payload), provider: "met_norway_fallback" };
  }
}

async function collectObservations(db: D1Database) {
  const count = await db.prepare("SELECT COUNT(*) AS total FROM weather_observations").first<{ total: number }>();
  const end = new Date(); end.setUTCDate(end.getUTCDate() - 5);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - (Number(count?.total ?? 0) < INITIAL_HISTORY_TARGET ? 365 : 7));
  const params = new URLSearchParams({
    latitude: LATITUDE, longitude: LONGITUDE, timezone: TIMEZONE,
    start_date: isoDate(start), end_date: isoDate(end),
    hourly: "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m",
  });
  const parsed = openMeteoRows(await fetchValidated(`https://archive-api.open-meteo.com/v1/archive?${params}`, hourlySchema), "historical");
  return {
    rows: parsed.rows.map((row): ObservationPoint => ({ time: row.time, temperature: row.temperature, humidity: row.humidity, precipitation: row.rain, wind: row.wind })),
    rejected: parsed.rejected,
  };
}

async function insertObservations(db: D1Database, rows: ObservationPoint[], collectedAt: string) {
  const statements = rows.map((row) => db.prepare(`
    INSERT INTO weather_observations (id, observed_at, temperature, humidity, precipitation, wind_speed, provider, collected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(observed_at) DO UPDATE SET temperature=excluded.temperature, humidity=excluded.humidity,
      precipitation=excluded.precipitation, wind_speed=excluded.wind_speed, provider=excluded.provider, collected_at=excluded.collected_at
  `).bind(row.time, row.time, row.temperature, row.humidity, row.precipitation, row.wind, "open_meteo", collectedAt));
  for (let index = 0; index < statements.length; index += 100) await db.batch(statements.slice(index, index + 100));
}

async function insertForecasts(db: D1Database, rows: WeatherPoint[], issuedAt: string, provider: string) {
  const statements = rows.map((row) => db.prepare(`
    INSERT INTO weather_forecasts (id, issued_on, issued_at, valid_at, temperature, humidity, rain_probability, rain_metric, provider, wind_speed, collected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(issued_at, valid_at, provider) DO UPDATE SET temperature=excluded.temperature, humidity=excluded.humidity,
      rain_probability=excluded.rain_probability, rain_metric=excluded.rain_metric, wind_speed=excluded.wind_speed, collected_at=excluded.collected_at
  `).bind(`${issuedAt}|${row.time}|${provider}`, issuedAt.slice(0, 10), issuedAt, row.time, row.temperature, row.humidity, row.rain, row.rainMetric, provider, row.wind, issuedAt));
  for (let index = 0; index < statements.length; index += 100) await db.batch(statements.slice(index, index + 100));
}

async function latestRun(db: D1Database) {
  return db.prepare(`SELECT completed_at, status, rejected_records, provider FROM pipeline_runs ORDER BY id DESC LIMIT 1`)
    .first<{ completed_at: string; status: string; rejected_records: number; provider: string }>();
}

export async function GET() {
  if (!env.DB) return Response.json({ error: "Banco meteorológico indisponível." }, { status: 503 });
  try {
    const [observations, forecasts, run, counts, accuracy] = await Promise.all([
      env.DB.prepare(`SELECT observed_at, temperature, humidity, precipitation, wind_speed FROM weather_observations WHERE observed_at >= datetime('now','-365 days') ORDER BY observed_at`)
        .all<{ observed_at: string; temperature: number; humidity: number; precipitation: number; wind_speed: number }>(),
      env.DB.prepare(`SELECT valid_at, temperature, humidity, rain_probability, rain_metric, wind_speed, provider FROM weather_forecasts WHERE COALESCE(issued_at, issued_on || 'T00:00:00Z')=(SELECT MAX(COALESCE(issued_at, issued_on || 'T00:00:00Z')) FROM weather_forecasts) ORDER BY valid_at`)
        .all<{ valid_at: string; temperature: number; humidity: number; rain_probability: number; rain_metric: RainMetric; wind_speed: number; provider: string }>(),
      latestRun(env.DB),
      env.DB.prepare(`SELECT (SELECT COUNT(*) FROM weather_observations) observations, (SELECT COUNT(*) FROM weather_forecasts) forecasts`)
        .first<{ observations: number; forecasts: number }>(),
      env.DB.prepare(`SELECT COUNT(*) samples, AVG(ABS(f.temperature-o.temperature)) mae FROM weather_forecasts f JOIN weather_observations o ON o.observed_at=f.valid_at WHERE f.valid_at < datetime('now')`)
        .first<{ samples: number; mae: number | null }>(),
    ]);
    const historical: WeatherPoint[] = (observations.results ?? []).map((row) => ({ time: row.observed_at, temperature: Number(row.temperature), humidity: Number(row.humidity), rain: Number(row.precipitation), wind: Number(row.wind_speed), source: "historical", rainMetric: "amount" }));
    const forecast: WeatherPoint[] = (forecasts.results ?? []).map((row) => ({ time: row.valid_at, temperature: Number(row.temperature), humidity: Number(row.humidity), rain: Number(row.rain_probability), wind: Number(row.wind_speed), source: "forecast", rainMetric: row.rain_metric }));
    if (!historical.length && !forecast.length) return Response.json({ error: "A base aguarda a primeira coleta automática." }, { status: 503, headers: { "Retry-After": "60" } });
    const provider = forecasts.results?.[0]?.provider ?? run?.provider ?? "database";
    const collectedAt = run?.completed_at ?? new Date().toISOString();
    return Response.json({
      points: [...historical, ...forecast], invalidRecords: Number(run?.rejected_records ?? 0), collectedAt,
      persistence: { status: "active", observations: Number(counts?.observations ?? 0), forecasts: Number(counts?.forecasts ?? 0), accuracySamples: Number(accuracy?.samples ?? 0), temperatureMae: accuracy?.mae == null ? null : Number(accuracy.mae), lastRunAt: collectedAt, lastRunStatus: run?.status ?? "unknown", provider },
      sources: { historical: "database", forecast: provider, observations: "database" },
    }, { headers: { "Cache-Control": "public, max-age=900, stale-while-revalidate=3600" } });
  } catch {
    return Response.json({ error: "Não foi possível consultar a base meteorológica." }, { status: 500 });
  }
}

export async function POST() {
  if (!env.DB) return Response.json({ error: "Banco meteorológico indisponível." }, { status: 503 });
  const startedAt = new Date();
  const previous = await latestRun(env.DB);
  if (previous?.status === "success") {
    const elapsed = startedAt.getTime() - new Date(previous.completed_at).getTime();
    if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < COLLECTION_COOLDOWN_MS) {
      return Response.json({ status: "skipped", reason: "collection_cooldown", lastCollectedAt: previous.completed_at });
    }
  }
  try {
    const [observationResult, forecastResult] = await Promise.allSettled([collectObservations(env.DB), collectForecast()]);
    const observations = observationResult.status === "fulfilled" ? observationResult.value : { rows: [], rejected: 0 };
    const forecasts = forecastResult.status === "fulfilled" ? forecastResult.value : { rows: [], rejected: 0, provider: "database_fallback" };
    if (!observations.rows.length && !forecasts.rows.length) throw new Error("All sources unavailable");
    const collectedAt = new Date().toISOString();
    if (observations.rows.length) await insertObservations(env.DB, observations.rows, collectedAt);
    if (forecasts.rows.length) await insertForecasts(env.DB, forecasts.rows, collectedAt, forecasts.provider);
    const rejected = observations.rejected + forecasts.rejected;
    const fetched = observations.rows.length + forecasts.rows.length;
    const durationMs = Date.now() - startedAt.getTime();
    await env.DB.prepare(`INSERT INTO pipeline_runs (started_at,completed_at,status,fetched_records,rejected_records,provider,trigger,duration_ms,message) VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(startedAt.toISOString(), collectedAt, "success", fetched, rejected, forecasts.provider, "scheduled", durationMs, "Coleta meteorológica concluída").run();
    return Response.json({ status: "success", collectedAt, provider: forecasts.provider, observations: observations.rows.length, forecasts: forecasts.rows.length, rejectedRecords: rejected, durationMs }, { status: 201 });
  } catch {
    const completedAt = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO pipeline_runs (started_at,completed_at,status,fetched_records,rejected_records,provider,trigger,duration_ms,message) VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(startedAt.toISOString(), completedAt, "error", 0, 0, "unavailable", "scheduled", Date.now() - startedAt.getTime(), "Falha ao consultar fontes meteorológicas").run();
    return Response.json({ error: "A coleta meteorológica falhou temporariamente." }, { status: 502 });
  }
}
