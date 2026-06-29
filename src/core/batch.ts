/**
 * Determine whether a batch has no work to do.
 * @param batch - Array of records to mutate.
 * @returns `true` when the batch is empty.
 */
function isEmptyBatch (batch: readonly unknown[]): boolean {
  return batch.length === 0
}

/**
 * Normalize a driver-reported affected-row count into a plain non-negative
 * integer, independent of whether the driver returned a `number` or `bigint`.
 * @param value - Raw affected-row count from the underlying driver.
 * @returns A non-negative integer row count.
 */
function normalizeMutationCount (value: number | bigint | null | undefined): number {
  if (value === null || value === undefined) {
    return 0
  }
  const count = typeof value === 'bigint' ? Number(value) : value
  return count > 0 ? Math.trunc(count) : 0
}

export { isEmptyBatch, normalizeMutationCount }
