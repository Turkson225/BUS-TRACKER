CREATE TABLE `pickups` (
	`user_id` text PRIMARY KEY NOT NULL,
	`bus_id` text NOT NULL,
	`route_id` text NOT NULL,
	`route_revision` integer NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`name` text NOT NULL,
	`route_offset` real NOT NULL,
	`radius` integer NOT NULL,
	`email_arrival` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `route_recordings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`points` text DEFAULT '[]' NOT NULL,
	`point_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_recordings_owner_draft` ON `route_recordings` (`owner_id`) WHERE "route_recordings"."status" IN ('recording','review');--> statement-breakpoint
ALTER TABLE `alerts` ADD `email_to` text;--> statement-breakpoint
ALTER TABLE `alerts` ADD `email_state` text DEFAULT 'not-requested' NOT NULL;--> statement-breakpoint
ALTER TABLE `alerts` ADD `email_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `routes` ADD `path` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `routes` ADD `revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `routes` ADD `recorded` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `shifts` ADD `pickup_lat` real;--> statement-breakpoint
ALTER TABLE `shifts` ADD `pickup_lng` real;--> statement-breakpoint
ALTER TABLE `shifts` ADD `pickup_name` text;--> statement-breakpoint
ALTER TABLE `shifts` ADD `route_offset` real;--> statement-breakpoint
ALTER TABLE `shifts` ADD `route_revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `shifts` ADD `email_arrival` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `trips` ADD `route_progress` real DEFAULT 0 NOT NULL;