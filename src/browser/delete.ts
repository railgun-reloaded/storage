import { assertValidDatabaseName, lockNameForDatabase, opfsDirectoryForDatabase } from './database-name.js'
import { BrowserStorageError } from './errors.js'

/**
 * Delete one logical database's persistent data from the origin-private
 * file system. Deletion is explicit and only ever removes the requested
 * database. Fails with `DATABASE_DELETE_BLOCKED` while an active connection
 * holds the database.
 * @param name - Logical database name to delete.
 * @returns `true` when data was removed, `false` when nothing was stored
 *   under the name.
 */
async function deleteDatabase (name: string): Promise<boolean> {
  assertValidDatabaseName(name)
  if (typeof navigator === 'undefined' || typeof navigator.storage?.getDirectory !== 'function' || navigator.locks === undefined) {
    throw new BrowserStorageError(
      'UNSUPPORTED_ENVIRONMENT',
      'Deleting persistent databases requires the origin-private file system and the Web Locks API.'
    )
  }
  return new Promise<boolean>((resolve, reject) => {
    navigator.locks
      .request(lockNameForDatabase(name), { ifAvailable: true }, async (lock) => {
        if (lock === null) {
          reject(new BrowserStorageError(
            'DATABASE_DELETE_BLOCKED',
            `Cannot delete database ${JSON.stringify(name)}: an active connection holds it. Close the connection first.`
          ))
          return
        }
        try {
          const root = await navigator.storage.getDirectory()
          await root.removeEntry(opfsDirectoryForDatabase(name), { recursive: true })
          resolve(true)
        } catch (error) {
          if (error instanceof DOMException && error.name === 'NotFoundError') {
            resolve(false)
            return
          }
          if (error instanceof DOMException && error.name === 'NoModificationAllowedError') {
            reject(new BrowserStorageError(
              'DATABASE_DELETE_BLOCKED',
              `Cannot delete database ${JSON.stringify(name)}: its files are locked by another context. Close the other tab or worker first.`,
              { cause: error }
            ))
            return
          }
          reject(error)
        }
      })
      .catch(reject)
  })
}

export { deleteDatabase }
