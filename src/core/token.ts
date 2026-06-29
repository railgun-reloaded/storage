/**
 * Canonical form for token addresses stored in or queried against the wallet
 * database.
 * @param token - Token address in any case.
 * @returns Lowercase token address.
 */
function normalizeToken (token: string): string {
  return token.toLowerCase()
}

export { normalizeToken }
