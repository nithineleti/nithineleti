ALTER TABLE `created_agents` ADD `vapi_assistant_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `created_agents` ADD `vapi_phone_number` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `created_agents_vapi_assistant_idx` ON `created_agents` (`vapi_assistant_id`);
