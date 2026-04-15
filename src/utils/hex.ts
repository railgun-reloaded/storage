/**
 * Converts a hex string to a Uint8Array.
 * Accepts hex strings with or without a leading `0x` prefix.
 * @param hex - Hex string to convert, optionally prefixed with `0x`.
 * @returns Uint8Array of bytes decoded from the hex string.
 */
function hexToBytes (hex: string): Uint8Array {
  const stripped = hex.startsWith('0x') ? hex.slice(2) : hex

  if (stripped.length === 0) {
    return new Uint8Array(0)
  }

  if (stripped.length % 2 !== 0) {
    throw new Error('Invalid hex string')
  }

  const bytes = new Uint8Array(stripped.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(stripped.substr(i * 2, 2), 16)
  }
  return bytes
}

export { hexToBytes }
