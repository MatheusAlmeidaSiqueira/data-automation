ALTER TABLE `pipeline_runs` ADD `provider` text DEFAULT 'open_meteo' NOT NULL;--> statement-breakpoint
ALTER TABLE `weather_forecasts` ADD `rain_metric` text DEFAULT 'probability' NOT NULL;--> statement-breakpoint
ALTER TABLE `weather_forecasts` ADD `provider` text DEFAULT 'open_meteo' NOT NULL;