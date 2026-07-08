CREATE TABLE `notes` (
	`commitment` blob NOT NULL,
	`wallet_id` text NOT NULL,
	`chain_id` integer NOT NULL,
	`nullifier` blob NOT NULL,
	`token` text NOT NULL,
	`amount` text NOT NULL,
	`token_type` integer DEFAULT 0 NOT NULL,
	`token_sub_id` blob DEFAULT x'0000000000000000000000000000000000000000000000000000000000000000' NOT NULL,
	`spent` integer DEFAULT false NOT NULL,
	`spent_txid` blob,
	`block_number` text NOT NULL,
	`tree_id` integer NOT NULL,
	`leaf_index` integer NOT NULL,
	`commitment_type` integer NOT NULL,
	`output_type` integer,
	`npk` blob,
	`random` blob,
	`blinded_commitment` blob,
	`creation_railgun_txid` blob,
	`creation_txid` blob,
	`pois_per_list` blob,
	`decrypted_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`wallet_id`, `chain_id`, `commitment`),
	FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notes_wallet_chain_spent_idx` ON `notes` (`wallet_id`,`chain_id`,`spent`);--> statement-breakpoint
CREATE INDEX `notes_wallet_chain_token_idx` ON `notes` (`wallet_id`,`chain_id`,`token`);--> statement-breakpoint
CREATE INDEX `notes_chain_nullifier_idx` ON `notes` (`chain_id`,`nullifier`);--> statement-breakpoint
CREATE INDEX `notes_chain_tree_leaf_idx` ON `notes` (`chain_id`,`tree_id`,`leaf_index`);--> statement-breakpoint
CREATE UNIQUE INDEX `notes_chain_nullifier_tree_unique` ON `notes` (`chain_id`,`nullifier`,`tree_id`);--> statement-breakpoint
CREATE TABLE `scan_state` (
	`wallet_id` text NOT NULL,
	`chain_id` integer NOT NULL,
	`last_scanned_block` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`wallet_id`, `chain_id`),
	FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sent_commitments` (
	`commitment` blob NOT NULL,
	`wallet_id` text NOT NULL,
	`chain_id` integer NOT NULL,
	`tree_id` integer NOT NULL,
	`leaf_index` integer NOT NULL,
	`token` text NOT NULL,
	`amount` text NOT NULL,
	`npk` blob NOT NULL,
	`random` blob,
	`blinded_commitment` blob,
	`creation_railgun_txid` blob,
	`output_type` integer,
	`recipient_mpk` blob NOT NULL,
	`block_number` text NOT NULL,
	`decrypted_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`wallet_id`, `chain_id`, `commitment`),
	FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sent_commitments_wallet_chain_idx` ON `sent_commitments` (`wallet_id`,`chain_id`);--> statement-breakpoint
CREATE TABLE `tx_history` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet_id` text NOT NULL,
	`chain_id` integer NOT NULL,
	`type` text NOT NULL,
	`txid` text NOT NULL,
	`block_number` text NOT NULL,
	`timestamp` integer NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tx_history_wallet_chain_block_idx` ON `tx_history` (`wallet_id`,`chain_id`,`block_number`);--> statement-breakpoint
CREATE INDEX `tx_history_txid_idx` ON `tx_history` (`txid`);--> statement-breakpoint
CREATE TABLE `wallets` (
	`id` text PRIMARY KEY NOT NULL,
	`encrypted_keys` blob NOT NULL,
	`name` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
