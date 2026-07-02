/**
 * Determine whether a batch has no work to do.
 * @param batch - Array of records to mutate.
 * @returns `true` when the batch is empty.
 */
function isEmptyBatch (batch: readonly unknown[]): boolean {
  return batch.length === 0
}

/**
 * Normalize a driver-reported mutation result into a plain non-negative
 * integer row count. Accepts a bare `number` or `bigint`, or a driver result
 * object carrying the count under `changes` or `rowsAffected`.
 * @param value - Raw mutation result from the underlying driver.
 * @returns A non-negative integer row count.
 */
function normalizeMutationCount (value: unknown): number {
  if (value !== null && typeof value === 'object') {
    const result = value as Record<string, unknown>
    return normalizeMutationCount(result['changes'] ?? result['rowsAffected'])
  }
  if (typeof value === 'bigint') {
    return value > 0n ? Number(value) : 0
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 ? Math.trunc(value) : 0
  }
  return 0
}

export { isEmptyBatch, normalizeMutationCount }
