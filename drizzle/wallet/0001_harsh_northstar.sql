CREATE TABLE `sent_notes` (
	`commitment` text PRIMARY KEY NOT NULL,
	`wallet_id` text NOT NULL,
	`txid` text NOT NULL,
	`token` text NOT NULL,
	`amount` text NOT NULL,
	`output_type` integer,
	`wallet_source` text,
	`recipient_address` text NOT NULL,
	`commitment_type` text NOT NULL,
	`block_number` text NOT NULL,
	`tree_id` integer NOT NULL,
	`leaf_index` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sent_notes_wallet_idx` ON `sent_notes` (`wallet_id`);--> statement-breakpoint
CREATE INDEX `sent_notes_txid_idx` ON `sent_notes` (`txid`);--> statement-breakpoint
ALTER TABLE `notes` ADD `commitment_type` text DEFAULT 'TransactCommitmentV2' NOT NULL;--> statement-breakpoint
ALTER TABLE `notes` ADD `output_type` integer;--> statement-breakpoint
ALTER TABLE `notes` ADD `pois_per_list` text;