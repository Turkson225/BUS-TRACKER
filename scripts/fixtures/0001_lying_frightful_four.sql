ALTER TABLE `buses` ADD `slot` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buses_singleton` ON `buses` (`slot`);