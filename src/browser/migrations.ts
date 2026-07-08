/**
 * One migration from the embedded catalog. Field semantics match
 * `readMigrationFiles` from `drizzle-orm/migrator`: `hash` is the sha256 of
 * the whole migration file, `folderMillis` is the journal timestamp used for
 * ordering and applied-state comparison, and `statements` are the file's
 * statements split on the drizzle statement breakpoint.
 */
type MigrationEntry = {
  hash: string
  folderMillis: number
  statements: string[]
}

export type { MigrationEntry }
