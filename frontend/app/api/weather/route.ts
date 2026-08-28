import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

type DisplaySource = "historical" | "forecast";
type WeatherPoint = { time: string; temperature: number; humidity: number; rain: number; wind: number; source: DisplaySource };
type HourlyPayload = { hourly: Record<string, Array<string | number | null>> };
type StoredPoint = { time: string; temperature: number; humidity: number; precipitation: number; wind: number };

const LATITUDE = "-23.4628";
const LONGITUDE = "-46.5333";
const TIMEZONE = "America/Sao_Paulo";

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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

async function insertForecasts(db: D1Database, rows: WeatherPoint[], issuedOn: string, collectedAt: string) {
  const statements = rows.map((row) => db.prepare(`
    INSERT INTO weather_forecasts (id, issued_on, valid_at, temperature, humidity, rain_probability, wind_speed, collected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(issued_on, valid_at) DO UPDATE SET
      temperature = excluded.temperature,
      humidity = excluded.humidity,
      rain_probability = excluded.rain_probability,
      wind_speed = excluded.wind_speed,
      collected_at = excluded.collected_at
  `).bind(`${issuedOn}|${row.time}`, issuedOn, row.time, row.temperature, row.humidity, row.rain, row.wind, collectedAt));
  for (let index = 0; index < statements.length; index += 100) await db.batch(statements.slice(index, index + 100));
}

export async function GET() {
  const startedAt = new Date().toISOString();
  const today = new Date();
  const yesterday = new Date(today); yesterday.setUTCDate(today.getUTCDate() - 1);
  const oneYearAgo = new Date(today); oneYearAgo.setUTCDate(today.getUTCDate() - 365);
  const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setUTCDate(today.getUTCDate() - 30);
  const common = { latitude: LATITUDE, longitude: LONGITUDE, timezone: TIMEZONE };
  const historicalParams = new URLSearchParams({ ...common, start_date: isoDate(oneYearAgo), end_date: isoDate(yesterday), hourly: "temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m" });
  const forecastParams = new URLSearchParams({ ...common, forecast_days: "16", hourly: "temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m" });
  const observationsParams = new URLSearchParams({ ...common, start_date: isoDate(thirtyDaysAgo), end_date: isoDate(yesterday), hourly: "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m" });

  try {
    const responses = await Promise.all([
      fetch(`https://historical-forecast-api.open-meteo.com/v1/forecast?${historicalParams}`),
      fetch(`https://api.open-meteo.com/v1/forecast?${forecastParams}`),
      fetch(`https://archive-api.open-meteo.com/v1/archive?${observationsParams}`),
    ]);
    if (responses.some((response) => !response.ok)) throw new Error("A fonte meteorológica retornou uma resposta inválida.");
    const [historicalPayload, forecastPayload, observationsPayload] = await Promise.all(responses.map((response) => response.json())) as [HourlyPayload, HourlyPayload, HourlyPayload];
    const rawRows = [...displayRows(historicalPayload, "historical"), ...displayRows(forecastPayload, "forecast")];
    const validRows = rawRows.filter((row) => [row.temperature, row.humidity, row.rain, row.wind].every(finite));
    const rows = Array.from(new Map(validRows.map((row) => [`${row.source}|${row.time}`, row])).values()).sort((a, b) => a.time.localeCompare(b.time));
    const observations = observationRows(observationsPayload);
    const forecasts = rows.filter((row) => row.source === "forecast");
    const rejectedRecords = rawRows.length - validRows.length;
    const collectedAt = new Date().toISOString();
    let persistence = { status: "unavailable", observations: 0, forecasts: 0, accuracySamples: 0, temperatureMae: null as number | null };

    if (env.DB) {
      await insertObservations(env.DB, observations, collectedAt);
      await insertForecasts(env.DB, forecasts, isoDate(today), collectedAt);
      await env.DB.prepare(`
        INSERT INTO pipeline_runs (started_at, completed_at, status, fetched_records, rejected_records, message)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(startedAt, collectedAt, "success", rawRows.length, rejectedRecords, "Sincronização Open-Meteo concluída").run();
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
      };
    }

    return Response.json({ points: rows, invalidRecords: rejectedRecords, collectedAt, persistence }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado na sincronização.";
    if (env.DB) {
      try {
        await env.DB.prepare(`
          INSERT INTO pipeline_runs (started_at, completed_at, status, fetched_records, rejected_records, message)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(startedAt, new Date().toISOString(), "error", 0, 0, message).run();
      } catch {}
    }
    return Response.json({ error: message }, { status: 502 });
  }
}
