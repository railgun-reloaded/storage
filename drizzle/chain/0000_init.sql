CREATE TABLE `commitments` (
	`hash` blob PRIMARY KEY NOT NULL,
	`commitmentType` integer NOT NULL,
	`transactionHash` blob NOT NULL,
	`blockNumber` text NOT NULL,
	`treeNumber` integer NOT NULL,
	`treePosition` integer NOT NULL,
	`commitment` blob NOT NULL,
	CONSTRAINT "tree_position_check" CHECK("commitments"."treePosition" < 65536)
);
--> statement-breakpoint
CREATE INDEX `commitment_tree_data_index` ON `commitments` (`treeNumber`,`treePosition`);--> statement-breakpoint
CREATE INDEX `commitment_tx_hash_index` ON `commitments` (`transactionHash`);--> statement-breakpoint
CREATE TABLE `merkle_trees` (
	`treeNumber` integer PRIMARY KEY NOT NULL,
	`leaves` blob NOT NULL,
	`leafCount` integer NOT NULL,
	CONSTRAINT "merkle_tree_element_byte_size_check" CHECK(length("merkle_trees"."leaves") = 4194272),
	CONSTRAINT "merkle_tree_leaf_count_check" CHECK("merkle_trees"."leafCount" <= 65536)
);
--> statement-breakpoint
CREATE TABLE `nullifiers` (
	`nullifier` blob NOT NULL,
	`transaction_hash` blob NOT NULL,
	`block_number` text NOT NULL,
	`tree_number` integer NOT NULL,
	PRIMARY KEY(`nullifier`, `tree_number`),
	CONSTRAINT "nullifier_size_check" CHECK(length("nullifiers"."nullifier") = 32)
);
--> statement-breakpoint
CREATE INDEX `nullifiers_block_number_index` ON `nullifiers` (`block_number`);--> statement-breakpoint
CREATE INDEX `nullifiers_tree_number_index` ON `nullifiers` (`tree_number`);--> statement-breakpoint
CREATE TABLE `railgun_transactions` (
	`railgun_txid` blob PRIMARY KEY NOT NULL,
	`txid_version` integer NOT NULL,
	`chain_txid` blob NOT NULL,
	`graph_id` blob,
	`block_number` text NOT NULL,
	`timestamp` text NOT NULL,
	`nullifiers` blob NOT NULL,
	`commitments` blob NOT NULL,
	`bound_params_hash` blob NOT NULL,
	`has_unshield` integer NOT NULL,
	`unshield` blob,
	`utxo_tree_in` integer NOT NULL,
	`utxo_tree_out` integer NOT NULL,
	`utxo_batch_start_position_out` integer NOT NULL,
	`verification_hash` blob,
	CONSTRAINT "railgun_transactions_txid_size_check" CHECK(length("railgun_transactions"."railgun_txid") = 32),
	CONSTRAINT "railgun_transactions_chain_txid_size_check" CHECK(length("railgun_transactions"."chain_txid") = 32),
	CONSTRAINT "railgun_transactions_bound_params_hash_size_check" CHECK(length("railgun_transactions"."bound_params_hash") = 32)
);
--> statement-breakpoint
CREATE INDEX `railgun_transactions_block_tx_index` ON `railgun_transactions` (`block_number`,`chain_txid`);--> statement-breakpoint
CREATE INDEX `railgun_transactions_tree_range_index` ON `railgun_transactions` (`utxo_tree_out`,`utxo_batch_start_position_out`);--> statement-breakpoint
CREATE TABLE `snapshot_checkpoints` (
	`chain_id` integer PRIMARY KEY NOT NULL,
	`cid` text NOT NULL,
	`block_height` text NOT NULL,
	`trees` blob NOT NULL,
	`validated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_states` (
	`chain_id` integer PRIMARY KEY NOT NULL,
	`last_block_height` text NOT NULL,
	`last_txid_sync_block_height` text DEFAULT '0000000000000000000000000000000000000000000000000000000000000000' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `unshields` (
	`transactionHash` blob NOT NULL,
	`blockNumber` text NOT NULL,
	`timestamp` text NOT NULL,
	`toAddress` blob NOT NULL,
	`token` blob,
	`amount` text NOT NULL,
	`fee` text NOT NULL,
	`eventLogIndex` integer NOT NULL,
	PRIMARY KEY(`transactionHash`, `eventLogIndex`),
	CONSTRAINT "to_address_check" CHECK(length("unshields"."toAddress") <= 20)
);
