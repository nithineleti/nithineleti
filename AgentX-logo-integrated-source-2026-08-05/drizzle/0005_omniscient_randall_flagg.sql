ALTER TABLE `appointment_requests` ADD `owner_email` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `appointment_requests_owner_idx` ON `appointment_requests` (`owner_email`);--> statement-breakpoint
ALTER TABLE `conversation_events` ADD `owner_email` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `conversation_events_conversation_idx` ON `conversation_events` (`conversation_id`);--> statement-breakpoint
ALTER TABLE `conversations` ADD `owner_email` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `conversations_owner_idx` ON `conversations` (`owner_email`);--> statement-breakpoint
ALTER TABLE `handoff_requests` ADD `owner_email` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `handoff_requests_owner_idx` ON `handoff_requests` (`owner_email`);--> statement-breakpoint
ALTER TABLE `leads` ADD `owner_email` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `leads_owner_idx` ON `leads` (`owner_email`);