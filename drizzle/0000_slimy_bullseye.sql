CREATE TABLE `comment_map` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`github_comment_id` integer NOT NULL,
	`discord_message_id` text NOT NULL,
	`issue_map_id` integer NOT NULL,
	FOREIGN KEY (`issue_map_id`) REFERENCES `issue_map`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_comment_map_github` ON `comment_map` (`github_comment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_comment_map_discord` ON `comment_map` (`discord_message_id`);--> statement-breakpoint
CREATE INDEX `idx_comment_map_issue_map_id` ON `comment_map` (`issue_map_id`);--> statement-breakpoint
CREATE TABLE `event_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`idempotency_key` text NOT NULL,
	`source` text NOT NULL,
	`event_type` text NOT NULL,
	`processed_at` text DEFAULT (datetime('now')) NOT NULL,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_log_idempotency_key_unique` ON `event_log` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `issue_map` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`github_issue_id` integer NOT NULL,
	`github_issue_number` integer NOT NULL,
	`discord_thread_id` text NOT NULL,
	`discord_first_message_id` text,
	`repo` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`synced_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_issue_map_github` ON `issue_map` (`github_issue_id`,`repo`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_issue_map_discord` ON `issue_map` (`discord_thread_id`);--> statement-breakpoint
CREATE TABLE `summary_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`issue_map_id` integer NOT NULL,
	`last_message_id` text NOT NULL,
	`github_comment_id` integer NOT NULL,
	`message_count` integer NOT NULL,
	`summarized_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`issue_map_id`) REFERENCES `issue_map`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_summary_log_issue_map_id` ON `summary_log` (`issue_map_id`,`summarized_at`);