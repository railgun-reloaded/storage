CREATE TABLE `balances` (
	`wallet_id` text NOT NULL,
	`token` text NOT NULL,
	`amount` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`wallet_id`, `token`),
	FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`commitment` text PRIMARY KEY NOT NULL,
	`wallet_id` text NOT NULL,
	`nullifier` text NOT NULL,
	`token` text NOT NULL,
	`amount` text NOT NULL,
	`spent` integer DEFAULT false NOT NULL,
	`spent_txid` text,
	`block_number` text NOT NULL,
	`tree_id` integer NOT NULL,
	`leaf_index` text NOT NULL,
	`decrypted_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notes_nullifier_unique` ON `notes` (`nullifier`);--> statement-breakpoint
CREATE INDEX `notes_wallet_spent_idx` ON `notes` (`wallet_id`,`spent`);--> statement-breakpoint
CREATE INDEX `notes_wallet_token_idx` ON `notes` (`wallet_id`,`token`);--> statement-breakpoint
CREATE INDEX `notes_nullifier_idx` ON `notes` (`nullifier`);--> statement-breakpoint
CREATE INDEX `notes_tree_leaf_idx` ON `notes` (`tree_id`,`leaf_index`);--> statement-breakpoint
CREATE TABLE `scan_state` (
	`wallet_id` text NOT NULL,
	`chain_id` integer NOT NULL,
	`last_scanned_block` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`wallet_id`, `chain_id`),
	FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tx_history` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet_id` text NOT NULL,
	`type` text NOT NULL,
	`txid` text NOT NULL,
	`block_number` text NOT NULL,
	`timestamp` integer NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tx_history_wallet_block_idx` ON `tx_history` (`wallet_id`,`block_number`);--> statement-breakpoint
CREATE INDEX `tx_history_txid_idx` ON `tx_history` (`txid`);--> statement-breakpoint
CREATE TABLE `wallets` (
	`id` text PRIMARY KEY NOT NULL,
	`encrypted_keys` blob NOT NULL,
	`name` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
