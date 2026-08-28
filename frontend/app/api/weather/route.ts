import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

type DisplaySource = "historical" | "forecast";
type WeatherPoint = { time: string; temperature: number; humidity: number; rain: number; wind: number; source: DisplaySource };
type HourlyPayload = { hourly: Record<string, Array<string | number | null>> };
type StoredPoint = { time: string; temperature: number; humidity: number; precipitation: number; wind: number };
type MetNoPayload = { properties?: { timeseries?: Array<{ time: string; data: { instant: { details: { air_temperature?: number; relative_humidity?: number; wind_speed?: number } }; next_1_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } }; next_6_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } } } }> } };

const LATITUDE = "-23.4628";
const LONGITUDE = "-46.5333";
const TIMEZONE = "America/Sao_Paulo";

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

async function fetchForecast(primaryUrl: string) {
  const primary = await fetch(primaryUrl);
  if (primary.ok) return { response: primary, source: "open_meteo", format: "open_meteo" as const };

  const fallback = await fetch(
    `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${LATITUDE}&lon=${LONGITUDE}`,
    { headers: { "User-Agent": "WeatherFlowAnalytics/1.0 https://matheus-analytics-guarulhos.matheusalmeidasiquei.chatgpt.site" } },
  );
  return {
    response: fallback,
    source: fallback.ok ? "met_norway_fallback" : "temporarily_unavailable",
    format: "met_norway" as const,
  };
}

function rainRisk(amount: number, symbol: string) {
  if (amount >= 10) return 95;
  if (amount >= 5) return 85;
  if (amount >= 2) return 70;
  if (amount >= 0.5) return 55;
  if (amount > 0) return 35;
  if (symbol.includes("rain") || symbol.includes("sleet") || symbol.includes("snow")) return 45;
  if (symbol.includes("cloudy")) return 15;
  return 5;
}

function metNoRows(payload: MetNoPayload): WeatherPoint[] {
  return (payload.properties?.timeseries ?? []).map((entry) => {
    const details = entry.data.instant.details;
    const period = entry.data.next_1_hours ?? entry.data.next_6_hours;
    const amount = Number(period?.details?.precipitation_amount ?? 0);
    const symbol = period?.summary?.symbol_code ?? "";
    return {
      time: entry.time,
      temperature: Number(details.air_temperature),
      humidity: Number(details.relative_humidity),
      rain: rainRisk(amount, symbol),
      wind: Number(details.wind_speed) * 3.6,
      source: "forecast",
    };
  });
}

async function storedForecastRows(db: D1Database): Promise<WeatherPoint[]> {
  const result = await db.prepare(`
    SELECT valid_at, temperature, humidity, rain_probability, wind_speed
    FROM weather_forecasts
    WHERE issued_on = (SELECT MAX(issued_on) FROM weather_forecasts)
    ORDER BY valid_at
  `).all<{ valid_at: string; temperature: number; humidity: number; rain_probability: number; wind_speed: number }>();
  return (result.results ?? []).map((row) => ({
    time: row.valid_at,
    temperature: Number(row.temperature),
    humidity: Number(row.humidity),
    rain: Number(row.rain_probability),
    wind: Number(row.wind_speed),
    source: "forecast",
  }));
}

function displayRows(payload: HourlyPayload, source: DisplaySource): WeatherPoint[] {
  const hourly = payload.hourly;
  return (hourly.time ?? []).map((time, index) => ({
    time: String(time),
    temperature: Number(hourly.temperature_2m?.[index]),
    humidity: Number(hourly.relative_humidity_2m?.[index]),
    rain: Number(hourly.precipitation_probability?.[index]),
    wind: Number(hourly.wind_speed_10m?.[index]),
    source,
  }));
}

function observationRows(payload: HourlyPayload): StoredPoint[] {
  const hourly = payload.hourly;
  return (hourly.time ?? []).map((time, index) => ({
    time: String(time),
    temperature: Number(hourly.temperature_2m?.[index]),
    humidity: Number(hourly.relative_humidity_2m?.[index]),
    precipitation: Number(hourly.precipitation?.[index]),
    wind: Number(hourly.wind_speed_10m?.[index]),
  })).filter((row) => [row.temperature, row.humidity, row.precipitation, row.wind].every(finite));
}

async function insertObservations(db: D1Database, rows: StoredPoint[], collectedAt: string) {
  const statements = rows.map((row) => db.prepare(`
    INSERT INTO weather_observations (id, observed_at, temperature, humidity, precipitation, wind_speed, collected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(observed_at) DO UPDATE SET
      temperature = excluded.temperature,
      humidity = excluded.humidity,
      precipitation = excluded.precipitation,
      wind_speed = excluded.wind_speed,
      collected_at = excluded.collected_at
  `).bind(row.time, row.time, row.temperature, row.humidity, row.precipitation, row.wind, collectedAt));
  for (let index = 0; index < statements.length; index += 100) await db.batch(statements.slice(index, index + 100));
}

async function insertForecasts(db: D1Database, rows: WeatherPoint[], issuedOn: string, collectedAt: string, provider: string) {
  const rainMetric = provider === "met_norway_fallback" ? "derived_risk" : "probability";
  const statements = rows.map((row) => db.prepare(`
    INSERT INTO weather_forecasts (id, issued_on, valid_at, temperature, humidity, rain_probability, rain_metric, provider, wind_speed, collected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(issued_on, valid_at) DO UPDATE SET
      temperature = excluded.temperature,
      humidity = excluded.humidity,
      rain_probability = excluded.rain_probability,
      rain_metric = excluded.rain_metric,
      provider = excluded.provider,
      wind_speed = excluded.wind_speed,
      collected_at = excluded.collected_at
  `).bind(`${issuedOn}|${row.time}`, issuedOn, row.time, row.temperature, row.humidity, row.rain, rainMetric, provider, row.wind, collectedAt));
  for (let index = 0; index < statements.length; index += 100) await db.batch(statements.slice(index, index + 100));
}

export async function GET() {
  const startedAt = new Date().toISOString();
  const today = new Date();
  const yesterday = new Date(today); yesterday.setUTCDate(today.getUTCDate() - 1);
  const oneYearAgo = new Date(today); oneYearAgo.setUTCDate(today.getUTCDate() - 365);
  const archiveEnd = new Date(today); archiveEnd.setUTCDate(today.getUTCDate() - 5);
  const thirtyDaysAgo = new Date(archiveEnd); thirtyDaysAgo.setUTCDate(archiveEnd.getUTCDate() - 30);
  const common = { latitude: LATITUDE, longitude: LONGITUDE, timezone: TIMEZONE };
  const historicalParams = new URLSearchParams({ ...common, start_date: isoDate(oneYearAgo), end_date: isoDate(yesterday), hourly: "temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m" });
  const forecastParams = new URLSearchParams({ ...common, forecast_days: "16", hourly: "temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m" });
  const observationsParams = new URLSearchParams({ ...common, start_date: isoDate(thirtyDaysAgo), end_date: isoDate(archiveEnd), hourly: "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m" });

  try {
    const responses = await Promise.all([
      fetch(`https://historical-forecast-api.open-meteo.com/v1/forecast?${historicalParams}`),
      fetchForecast(`https://api.open-meteo.com/v1/forecast?${forecastParams}`),
      fetch(`https://archive-api.open-meteo.com/v1/archive?${observationsParams}`),
    ]);
    const [historicalResponse, forecastResult, observationsResponse] = responses;
    const forecastResponse = forecastResult.response;
    if (!historicalResponse.ok) throw new Error(`A fonte histórica retornou o status ${historicalResponse.status}.`);
    const historicalPayload = await historicalResponse.json() as HourlyPayload;
    const liveForecastRows = forecastResponse.ok
      ? forecastResult.format === "open_meteo"
        ? displayRows(await forecastResponse.json() as HourlyPayload, "forecast")
        : metNoRows(await forecastResponse.json() as MetNoPayload)
      : [];
    const fallbackForecastRows = !forecastResponse.ok && env.DB ? await storedForecastRows(env.DB) : [];
    const observationsPayload = observationsResponse.ok ? await observationsResponse.json() as HourlyPayload : null;
    const rawRows = [...displayRows(historicalPayload, "historical"), ...(liveForecastRows.length ? liveForecastRows : fallbackForecastRows)];
    const validRows = rawRows.filter((row) => [row.temperature, row.humidity, row.rain, row.wind].every(finite));
    const rows = Array.from(new Map(validRows.map((row) => [`${row.source}|${row.time}`, row])).values()).sort((a, b) => a.time.localeCompare(b.time));
    const observations = observationsPayload ? observationRows(observationsPayload) : [];
    const forecasts = rows.filter((row) => row.source === "forecast");
    const rejectedRecords = rawRows.length - validRows.length;
    const collectedAt = new Date().toISOString();
    const activeProvider = forecastResponse.ok ? forecastResult.source : fallbackForecastRows.length ? "database_fallback" : "temporarily_unavailable";
    let persistence = { status: "unavailable", observations: 0, forecasts: 0, accuracySamples: 0, temperatureMae: null as number | null, lastRunAt: collectedAt, lastRunStatus: "unavailable", provider: activeProvider };

    if (env.DB) {
      await insertObservations(env.DB, observations, collectedAt);
      if (liveForecastRows.length) await insertForecasts(env.DB, forecasts, isoDate(today), collectedAt, activeProvider);
      await env.DB.prepare(`
        INSERT INTO pipeline_runs (started_at, completed_at, status, fetched_records, rejected_records, provider, message)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(startedAt, collectedAt, "success", rawRows.length, rejectedRecords, activeProvider, "Sincronização meteorológica concluída").run();
      const counts = await env.DB.prepare(`
        SELECT
          (SELECT COUNT(*) FROM weather_observations) AS observations,
          (SELECT COUNT(*) FROM weather_forecasts) AS forecasts
      `).first<{ observations: number; forecasts: number }>();
      const accuracy = await env.DB.prepare(`
        SELECT COUNT(*) AS samples, AVG(ABS(f.temperature - o.temperature)) AS mae
        FROM weather_forecasts f
        INNER JOIN weather_observations o ON o.observed_at = f.valid_at
        WHERE f.valid_at < ?
      `).bind(collectedAt.slice(0, 16)).first<{ samples: number; mae: number | null }>();
      persistence = {
        status: "active",
        observations: Number(counts?.observations ?? 0),
        forecasts: Number(counts?.forecasts ?? 0),
        accuracySamples: Number(accuracy?.samples ?? 0),
        temperatureMae: accuracy?.mae == null ? null : Number(accuracy.mae),
        lastRunAt: collectedAt,
        lastRunStatus: "success",
        provider: activeProvider,
      };
    }

    return Response.json({ points: rows, invalidRecords: rejectedRecords, collectedAt, persistence, sources: { historical: "online", forecast: activeProvider, observations: observationsResponse.ok ? "online" : "temporarily_unavailable" } }, { headers: { "Cache-Control": "public, max-age=900, stale-while-revalidate=3600" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado na sincronização.";
    if (env.DB) {
      try {
        await env.DB.prepare(`
          INSERT INTO pipeline_runs (started_at, completed_at, status, fetched_records, rejected_records, provider, message)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(startedAt, new Date().toISOString(), "error", 0, 0, "unavailable", message).run();
      } catch {}
    }
    return Response.json({ error: message }, { status: 502 });
  }
}
