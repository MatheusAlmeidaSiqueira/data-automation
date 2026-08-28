import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const weatherObservations = sqliteTable("weather_observations", {
  id: text("id").primaryKey(),
  observedAt: text("observed_at").notNull(),
  temperature: real("temperature").notNull(),
  humidity: real("humidity").notNull(),
  precipitation: real("precipitation").notNull(),
  windSpeed: real("wind_speed").notNull(),
  collectedAt: text("collected_at").notNull(),
}, (table) => [uniqueIndex("observations_observed_at_unique").on(table.observedAt)]);

export const weatherForecasts = sqliteTable("weather_forecasts", {
  id: text("id").primaryKey(),
  issuedOn: text("issued_on").notNull(),
  validAt: text("valid_at").notNull(),
  temperature: real("temperature").notNull(),
  humidity: real("humidity").notNull(),
  rainProbability: real("rain_probability").notNull(),
  windSpeed: real("wind_speed").notNull(),
  collectedAt: text("collected_at").notNull(),
}, (table) => [
  uniqueIndex("forecasts_issue_valid_unique").on(table.issuedOn, table.validAt),
  index("forecasts_valid_at_idx").on(table.validAt),
]);

export const pipelineRuns = sqliteTable("pipeline_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at").notNull(),
  status: text("status").notNull(),
  fetchedRecords: integer("fetched_records").notNull(),
  rejectedRecords: integer("rejected_records").notNull(),
  message: text("message"),
});
