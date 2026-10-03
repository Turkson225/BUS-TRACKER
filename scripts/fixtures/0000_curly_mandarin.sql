CREATE TABLE `alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`trip_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`push_state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_alerts_trip_user_kind` ON `alerts` (`trip_id`,`user_id`,`kind`);--> statement-breakpoint
CREATE INDEX `idx_alerts_user_created` ON `alerts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `buses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`plate` text NOT NULL,
	`route_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`email` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`role` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `routes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`stops` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`bus_id` text NOT NULL,
	`route_id` text NOT NULL,
	`stop_id` text NOT NULL,
	`on_shift` integer NOT NULL,
	`radius` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_shifts_user_date` ON `shifts` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_shifts_bus_date` ON `shifts` (`bus_id`,`date`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`endpoint` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`subscription` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_subscriptions_user` ON `subscriptions` (`user_id`);--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`bus_id` text NOT NULL,
	`route_id` text NOT NULL,
	`driver_id` text NOT NULL,
	`driver_name` text NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	`test` integer DEFAULT 0 NOT NULL,
	`next_stop` integer DEFAULT 0 NOT NULL,
	`lat` real,
	`lng` real,
	`accuracy` real,
	`speed` real,
	`updated_at` integer,
	`started_at` integer NOT NULL,
	`delay_minutes` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_trips_active_bus` ON `trips` (`bus_id`) WHERE "trips"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX `idx_trips_active_driver` ON `trips` (`driver_id`) WHERE "trips"."status" = 'active';--> statement-breakpoint
CREATE INDEX `idx_trips_date_status` ON `trips` (`date`,`status`);