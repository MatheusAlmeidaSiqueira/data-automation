CREATE TABLE `pipeline_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text NOT NULL,
	`status` text NOT NULL,
	`fetched_records` integer NOT NULL,
	`rejected_records` integer NOT NULL,
	`message` text
);
--> statement-breakpoint
CREATE TABLE `weather_forecasts` (
	`id` text PRIMARY KEY NOT NULL,
	`issued_on` text NOT NULL,
	`valid_at` text NOT NULL,
	`temperature` real NOT NULL,
	`humidity` real NOT NULL,
	`rain_probability` real NOT NULL,
	`wind_speed` real NOT NULL,
	`collected_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `forecasts_issue_valid_unique` ON `weather_forecasts` (`issued_on`,`valid_at`);--> statement-breakpoint
CREATE INDEX `forecasts_valid_at_idx` ON `weather_forecasts` (`valid_at`);--> statement-breakpoint
CREATE TABLE `weather_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`observed_at` text NOT NULL,
	`temperature` real NOT NULL,
	`humidity` real NOT NULL,
	`precipitation` real NOT NULL,
	`wind_speed` real NOT NULL,
	`collected_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `observations_observed_at_unique` ON `weather_observations` (`observed_at`);