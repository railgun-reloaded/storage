import { DecodeError, ExtensionCodec, decode, encode } from '@msgpack/msgpack'
import { customType } from 'drizzle-orm/sqlite-core/columns/custom'

const BIGINT_EXT_TYPE = 0
const extensionCodec = new ExtensionCodec()
extensionCodec.register({
  type: BIGINT_EXT_TYPE,
  /**
   * Encode input bigint value to Uint8Array
   * @param input - Input value to encode
   * @returns - Encoded string representation of bigint
   */
  encode (input: unknown) : Uint8Array | null {
    if (typeof input === 'bigint') {
      return encode(input.toString())
    } else {
      return null
    }
  },
  /**
   * Decode input Uint8Array to bigint
   * @param value - Input Uint8Array to decode
   * @returns -  Decoded bigint value
   */
  decode (value: Uint8Array) : bigint {
    const val = decode(value)
    if (typeof val !== 'string') {
      throw new DecodeError('Unexpected BigInt source')
    }
    return BigInt(val)
  }
})

/**
 * The default bigint support in SQLite does not handle range filtering
 * correctly. For example, querying for values between `1000n` and `2000n`
 * may perform lexicographical comparisons and miss some rows. To mitigate
 * this, we store big integers as hexadecimal-encoded text strings.
 * However sum operation are limited to only (64 bit integer) in sqlite.
 */
const bigint = customType<{ data: bigint; driverData: string }>({
  /**
   * Define the underling database column as text
   * @returns - SQLite text type in string format
   */
  dataType () {
    return 'text'
  },
  /**
   * Convert a JavaScript bigint to a hex‑encoded string.
   * @param value - Input bigint value to convert.
   * @returns Serialized hex string representation of the value.
   */
  toDriver (value: bigint): string {
    return value.toString(16).padStart(64, '0')
  },
  /**
   * Convert a hex string back to a JavaScript bigint.
   * @param value - The hex string retrieved from the SQLite table.
   * @returns Deserialized bigint value.
   */
  fromDriver (value: string): bigint {
    return BigInt(`0x${value}`)
  },
})
/**
 * Stores binary values as SQLite BLOBs using plain Uint8Array on both sides.
 * The underlying driver returns binary reads as a Uint8Array, which we
 * normalize so consumers always receive a plain Uint8Array.
 */
const uint8Array = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  /**
   * Define the underling database column as text
   * @returns - SQLite text type in string format
   */
  dataType () {
    return 'blob'
  },
  /**
   * Pass the Uint8Array through to the driver unchanged.
   * @param value - Input Uint8Array to store.
   * @returns The value to bind to the BLOB column.
   */
  toDriver (value: Uint8Array): Uint8Array {
    return value
  },
  /**
   * Normalize a binary read back to a plain Uint8Array.
   * @param value - Binary value retrieved from the SQLite table.
   * @returns Deserialized Uint8Array.
   */
  fromDriver (value: Uint8Array): Uint8Array {
    return Uint8Array.from(value)
  },
})

/**
 * MessagePack decodes nested binary values as a driver-native binary type.
 * Convert those back to plain Uint8Array so msgpackBlob columns match
 * uint8Array columns.
 * @param value - Decoded MessagePack value.
 * @returns The decoded value with binary leaves normalized.
 */
function normalizeMsgpackBinary (value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return Uint8Array.from(value)
  }
  if (Array.isArray(value)) {
    return value.map(normalizeMsgpackBinary)
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        normalizeMsgpackBinary(entry)
      ])
    )
  }
  return value
}

const msgpackBlob = customType<{ data: any; driverData: Uint8Array }>({
/**
 * Defines the underlying database column type as a BLOB.
 * @returns - SQLite blob type in string format.
 */
  dataType () {
    return 'blob'
  },

  /**
   * Converts a JavaScript value to MessagePack-encoded binary data.
   * @param value - Input application side value to serialize.
   * @returns - The serialized MessagePack binary data.
   */
  toDriver (value: any): Uint8Array {
    return encode(value, { extensionCodec })
  },
  /**
   * Converts the database BLOB back into its original JavaScript value.
   * @param value - The binary value retrieved from the SQLite BLOB column.
   * @returns - The deserialized JavaScript object or value.
   */
  fromDriver (value: Uint8Array) {
    return normalizeMsgpackBinary(decode(value, { extensionCodec }))
  }
})

export { bigint, uint8Array, msgpackBlob }
