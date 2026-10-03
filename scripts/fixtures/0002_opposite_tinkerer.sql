ALTER TABLE `trips` ADD `driver_epoch` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `trips` ADD `handover_email` text;--> statement-breakpoint
ALTER TABLE `trips` ADD `handover_name` text;