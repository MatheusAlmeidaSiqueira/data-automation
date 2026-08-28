DROP INDEX `forecasts_issue_valid_unique`;--> statement-breakpoint
ALTER TABLE `weather_forecasts` ADD `issued_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `forecasts_issued_at_valid_provider_unique` ON `weather_forecasts` (`issued_at`,`valid_at`,`provider`);--> statement-breakpoint
CREATE INDEX `forecasts_issued_at_idx` ON `weather_forecasts` (`issued_at`);--> statement-breakpoint
ALTER TABLE `pipeline_runs` ADD `trigger` text DEFAULT 'scheduled' NOT NULL;--> statement-breakpoint
ALTER TABLE `pipeline_runs` ADD `duration_ms` integer;--> statement-breakpoint
ALTER TABLE `weather_observations` ADD `provider` text DEFAULT 'open_meteo' NOT NULL;