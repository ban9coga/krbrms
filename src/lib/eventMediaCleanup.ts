import { adminClient } from './auth'
import { REGISTRATION_UPLOAD_BUCKET } from './registrationUploadConfig'

const EVENT_MEDIA_BUCKET = 'event-logos'
const STORAGE_PAGE_SIZE = 1000

type CleanupResult = {
  bucket: string
  removed: number
  error: string | null
}

type StorageListItem = {
  id?: string | null
  name: string
  metadata?: Record<string, unknown> | null
}

const isFileItem = (item: StorageListItem) => {
  if (item.id) return true
  const metadata = item.metadata
  return Boolean(metadata && Object.keys(metadata).length > 0)
}

const normalizePrefix = (prefix: string) => prefix.replace(/^\/+|\/+$/g, '')

const listStorageFilesRecursive = async (bucket: string, prefix: string): Promise<string[]> => {
  const cleanPrefix = normalizePrefix(prefix)
  const files: string[] = []
  let offset = 0

  while (true) {
    const { data, error } = await adminClient.storage.from(bucket).list(cleanPrefix, {
      limit: STORAGE_PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })

    if (error) {
      const message = String(error.message ?? '')
      if (/not found|does not exist|bucket/i.test(message)) return files
      throw new Error(message)
    }

    const items = ((data ?? []) as StorageListItem[]).filter((item) => item.name && item.name !== '.emptyFolderPlaceholder')
    if (items.length === 0) break

    for (const item of items) {
      const itemPath = `${cleanPrefix}/${item.name}`
      if (isFileItem(item)) {
        files.push(itemPath)
      } else {
        files.push(...(await listStorageFilesRecursive(bucket, itemPath)))
      }
    }

    if (items.length < STORAGE_PAGE_SIZE) break
    offset += STORAGE_PAGE_SIZE
  }

  return files
}

const chunk = <T,>(items: T[], size: number) => {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

const removeStoragePrefix = async (bucket: string, prefix: string): Promise<CleanupResult> => {
  try {
    const files = await listStorageFilesRecursive(bucket, prefix)
    if (files.length === 0) return { bucket, removed: 0, error: null }

    let removed = 0
    for (const paths of chunk(files, 100)) {
      const { data, error } = await adminClient.storage.from(bucket).remove(paths)
      if (error) throw new Error(error.message)
      removed += data?.length ?? paths.length
    }

    return { bucket, removed, error: null }
  } catch (error) {
    return {
      bucket,
      removed: 0,
      error: error instanceof Error ? error.message : 'Unknown storage cleanup error',
    }
  }
}

export const cleanupEventMedia = async (eventId: string) => {
  const prefix = `events/${eventId}`
  const results = await Promise.all([
    removeStoragePrefix(EVENT_MEDIA_BUCKET, prefix),
    removeStoragePrefix(REGISTRATION_UPLOAD_BUCKET, prefix),
  ])

  const errors = results.filter((result) => result.error)
  if (errors.length > 0) {
    console.warn(
      '[event-delete] media cleanup warning',
      errors.map((result) => `${result.bucket}: ${result.error}`).join(' | ')
    )
  }

  return {
    removed: results.reduce((sum, result) => sum + result.removed, 0),
    results,
    warning: errors.length > 0 ? errors.map((result) => `${result.bucket}: ${result.error}`).join(' | ') : null,
  }
}
