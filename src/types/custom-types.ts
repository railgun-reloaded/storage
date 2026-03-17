import { DecodeError, ExtensionCodec, decode, encode } from '@msgpack/msgpack'
import { customType } from 'drizzle-orm/sqlite-core'

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
 * The builtin blob types work with Buffer object, instead we
 * define a custom uint8Array that handles the buffer to uint8Array conversion
 */
const uint8Array = customType<{ data: Uint8Array; driverData: Buffer }>({
  /**
   * Define the underling database column as text
   * @returns - SQLite text type in string format
   */
  dataType () {
    return 'blob'
  },
  /**
   * Convert Uint8Array to a Buffer.
   * @param value - Input Uint8Array to convert.
   * @returns Buffer representation of the value.
   */
  toDriver (value: Uint8Array): Buffer {
    return Buffer.from(value)
  },
  /**
   * Convert Buffer back to a JavaScript Uint8Array.
   * @param value - Buffer retrieved from the SQLite table.
   * @returns Deserialized Uint8Array.
   */
  fromDriver (value: Buffer): Uint8Array {
    return Uint8Array.from(value)
  },
})

const msgpackBlob = customType<{ data: any; driverData: Buffer }>({
/**
 * Defines the underlying database column type as a BLOB.
 * @returns - SQLite blob type in string format.
 */
  dataType () {
    return 'blob'
  },

  /**
   * Converts javascript value to a MessagePack-encoded Buffer.
   * @param value - Input application side value to serialize.
   * @returns - The serialized MessagePack binary data.
   */
  toDriver (value: any) {
    return Buffer.from(encode(value, { extensionCodec }))
  },
  /**
   * Converts the database BLOB back into its original JavaScript value.
   * @param value - The Buffer retrieved from the SQLite BLOB column.
   * @returns - The deserialized JavaScript object or value.
   */
  fromDriver (value: Buffer) {
    return decode(value, { extensionCodec })
  }
})

export { bigint, uint8Array, msgpackBlob }
