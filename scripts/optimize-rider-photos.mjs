import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..')
const DEFAULT_BUCKET = 'rider-photos'
const DEFAULT_MAX_SIZE = 500
const DEFAULT_QUALITY = 82
const DEFAULT_MODE = 'replace'
const DEFAULT_LOG_ROOT = 'backups'
const SUPPORTED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.tif', '.tiff', '.avif', '.heic', '.heif'])

const printUsage = () => {
  console.log(`
Optimize rider photos in Supabase storage.

Usage:
  node scripts/optimize-rider-photos.mjs [options]

Options:
  --bucket <name>         Storage bucket name. Default: ${DEFAULT_BUCKET}
  --max-size <px>         Max width/height after resize. Default: ${DEFAULT_MAX_SIZE}
  --quality <0-100>       WebP quality. Default: ${DEFAULT_QUALITY}
  --mode <replace|prefix> Upload mode. Default: ${DEFAULT_MODE}
  --dest-prefix <path>    Required when mode=prefix. Example: optimized-500
  --log-dir <path>        Custom folder for run logs. Default: auto-create under ${DEFAULT_LOG_ROOT}/
  --retry-errors-from <file>
                          Retry only files listed in a previous errors log (.json, .txt, or console log).
  --rewrite-db            Rewrite riders.photo_url / photo_thumbnail_url when path changes.
  --no-rewrite-db         Do not rewrite rider URLs in DB.
  --delete-original       Delete source file after successful upload.
  --keep-original         Keep source file after upload.
  --dry-run               Simulate only; no upload/delete/update DB.
  --help                  Show this help.

Examples:
  node scripts/optimize-rider-photos.mjs --dry-run
  node scripts/optimize-rider-photos.mjs --mode replace --rewrite-db --delete-original
  node scripts/optimize-rider-photos.mjs --mode prefix --dest-prefix optimized-500 --rewrite-db
  node scripts/optimize-rider-photos.mjs --retry-errors-from .\\backups\\photo-optimize-20260530-154200\\errors.json
`)
}

const parseArgs = (argv) => {
  const options = {
    bucket: DEFAULT_BUCKET,
    maxSize: DEFAULT_MAX_SIZE,
    quality: DEFAULT_QUALITY,
    mode: DEFAULT_MODE,
    destPrefix: '',
    logDir: '',
    retryErrorsFrom: '',
    rewriteDb: true,
    deleteOriginal: true,
    dryRun: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    }
    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }
    if (arg === '--rewrite-db') {
      options.rewriteDb = true
      continue
    }
    if (arg === '--no-rewrite-db') {
      options.rewriteDb = false
      continue
    }
    if (arg === '--delete-original') {
      options.deleteOriginal = true
      continue
    }
    if (arg === '--keep-original') {
      options.deleteOriginal = false
      continue
    }

    const nextValue = argv[index + 1]
    if (!nextValue) {
      throw new Error(`Missing value for ${arg}`)
    }

    if (arg === '--bucket') {
      options.bucket = nextValue
      index += 1
      continue
    }
    if (arg === '--max-size') {
      options.maxSize = Number(nextValue)
      index += 1
      continue
    }
    if (arg === '--quality') {
      options.quality = Number(nextValue)
      index += 1
      continue
    }
    if (arg === '--mode') {
      options.mode = nextValue
      index += 1
      continue
    }
    if (arg === '--dest-prefix') {
      options.destPrefix = nextValue
      index += 1
      continue
    }
    if (arg === '--log-dir') {
      options.logDir = nextValue
      index += 1
      continue
    }
    if (arg === '--retry-errors-from') {
      options.retryErrorsFrom = nextValue
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!Number.isFinite(options.maxSize) || options.maxSize <= 0) {
    throw new Error('--max-size must be a positive number')
  }
  if (!Number.isFinite(options.quality) || options.quality <= 0 || options.quality > 100) {
    throw new Error('--quality must be between 1 and 100')
  }
  if (!['replace', 'prefix'].includes(options.mode)) {
    throw new Error('--mode must be either replace or prefix')
  }
  if (options.mode === 'prefix' && !options.destPrefix.trim()) {
    throw new Error('--dest-prefix is required when mode=prefix')
  }
  if (options.mode === 'prefix' && options.deleteOriginal && options.rewriteDb === false) {
    throw new Error('Refusing to delete originals in prefix mode without DB rewrite. Use --keep-original or enable --rewrite-db.')
  }

  return options
}

const formatTimestamp = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

const loadEnvFile = async (filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const separatorIndex = line.indexOf('=')
      if (separatorIndex <= 0) continue
      const key = line.slice(0, separatorIndex).trim()
      if (!key || process.env[key]) continue
      let value = line.slice(separatorIndex + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      process.env[key] = value
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return
    throw error
  }
}

const normalizeStoragePath = (value) => value.replace(/^\/+/, '').replace(/\\/g, '/')

const unique = (items) => Array.from(new Set(items))

const replaceExtensionWithWebp = (storagePath) => {
  const normalized = normalizeStoragePath(storagePath)
  const ext = path.posix.extname(normalized)
  const withoutExt = ext ? normalized.slice(0, -ext.length) : normalized
  return `${withoutExt}.webp`
}

const extractStoragePathFromUrl = (value, bucket) => {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return null
  if (!/^https?:\/\//i.test(trimmed)) return normalizeStoragePath(trimmed.split('?')[0] ?? trimmed)

  try {
    const url = new URL(trimmed)
    const prefixes = [
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/sign/${bucket}/`,
      `/storage/v1/object/authenticated/${bucket}/`,
    ]

    for (const prefix of prefixes) {
      const index = url.pathname.indexOf(prefix)
      if (index < 0) continue
      const relativePath = url.pathname.slice(index + prefix.length)
      return normalizeStoragePath(decodeURIComponent(relativePath))
    }
  } catch {
    return null
  }

  return null
}

const listAllFilesRecursive = async (storage, currentPath = '') => {
  const files = []
  const limit = 1000
  let offset = 0

  while (true) {
    const { data, error } = await storage.list(currentPath, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })

    if (error) {
      throw new Error(`Failed listing "${currentPath || '/'}": ${error.message}`)
    }

    const entries = data ?? []
    for (const entry of entries) {
      const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name
      if (entry.id) {
        files.push(normalizeStoragePath(entryPath))
      } else {
        const nestedFiles = await listAllFilesRecursive(storage, entryPath)
        files.push(...nestedFiles)
      }
    }

    if (entries.length < limit) break
    offset += entries.length
  }

  return files
}

const buildTargetPath = (sourcePath, mode, destPrefix) => {
  const webpPath = replaceExtensionWithWebp(sourcePath)
  if (mode === 'replace') return webpPath
  const cleanPrefix = normalizeStoragePath(destPrefix).replace(/\/+$/, '')
  return normalizeStoragePath(`${cleanPrefix}/${webpPath}`)
}

const resolveRunLogDir = async (customLogDir) => {
  const outputDir = customLogDir
    ? path.resolve(REPO_ROOT, customLogDir)
    : path.join(REPO_ROOT, DEFAULT_LOG_ROOT, `photo-optimize-${formatTimestamp()}`)
  await fs.mkdir(outputDir, { recursive: true })
  return outputDir
}

const readRetryPathsFromLog = async (filePath) => {
  const absolutePath = path.resolve(REPO_ROOT, filePath)
  const content = await fs.readFile(absolutePath, 'utf8')
  const extension = path.extname(absolutePath).toLowerCase()

  if (extension === '.json') {
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed)) {
      return unique(
        parsed
          .map((entry) => {
            if (typeof entry === 'string') return normalizeStoragePath(entry)
            if (entry && typeof entry === 'object' && typeof entry.sourcePath === 'string') {
              return normalizeStoragePath(entry.sourcePath)
            }
            return null
          })
          .filter(Boolean)
      )
    }
  }

  const paths = []
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    const errorMatch = line.match(/ERROR\s+(.+?):\s+/)
    if (errorMatch?.[1]) {
      paths.push(normalizeStoragePath(errorMatch[1]))
      continue
    }

    const tabParts = line.split('\t')
    if (tabParts.length >= 1 && tabParts[0]) {
      const firstValue = tabParts[0].trim()
      if (firstValue && !firstValue.startsWith('{') && !firstValue.startsWith('[')) {
        paths.push(normalizeStoragePath(firstValue))
      }
    }
  }

  return unique(paths)
}

const collectRiderPhotoRefs = async (adminClient, bucket) => {
  const { data, error } = await adminClient
    .from('riders')
    .select('id, photo_url, photo_thumbnail_url')

  if (error) {
    throw new Error(`Failed loading rider photo URLs: ${error.message}`)
  }

  const refsByPath = new Map()
  for (const rider of data ?? []) {
    const fullPath = extractStoragePathFromUrl(rider.photo_url, bucket)
    const thumbPath = extractStoragePathFromUrl(rider.photo_thumbnail_url, bucket)

    if (fullPath) {
      const list = refsByPath.get(fullPath) ?? []
      list.push({ riderId: rider.id, column: 'photo_url' })
      refsByPath.set(fullPath, list)
    }
    if (thumbPath) {
      const list = refsByPath.get(thumbPath) ?? []
      list.push({ riderId: rider.id, column: 'photo_thumbnail_url' })
      refsByPath.set(thumbPath, list)
    }
  }

  return refsByPath
}

const updateRiderUrlsForPath = async ({ adminClient, refsByPath, bucket, sourcePath, targetPath, dryRun }) => {
  const refs = refsByPath.get(sourcePath) ?? []
  if (refs.length === 0) return 0

  const publicUrl = adminClient.storage.from(bucket).getPublicUrl(targetPath).data.publicUrl
  const versionedUrl = `${publicUrl}?v=${Date.now()}`
  const updatesByRider = new Map()

  for (const ref of refs) {
    const current = updatesByRider.get(ref.riderId) ?? {}
    current[ref.column] = versionedUrl
    updatesByRider.set(ref.riderId, current)
  }

  if (dryRun) {
    return updatesByRider.size
  }

  for (const [riderId, update] of updatesByRider.entries()) {
    const { error } = await adminClient
      .from('riders')
      .update(update)
      .eq('id', riderId)

    if (error) {
      throw new Error(`Failed updating rider ${riderId} URLs: ${error.message}`)
    }
  }

  const existingTargetRefs = refsByPath.get(targetPath) ?? []
  refsByPath.delete(sourcePath)
  refsByPath.set(targetPath, [...existingTargetRefs, ...refs.map((ref) => ({ ...ref }))])
  return updatesByRider.size
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))

  await loadEnvFile(path.join(REPO_ROOT, '.env.local'))
  await loadEnvFile(path.join(REPO_ROOT, '.env'))

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Make sure .env.local is present.')
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const storage = adminClient.storage.from(options.bucket)
  const logDir = await resolveRunLogDir(options.logDir)
  const runMeta = {
    bucket: options.bucket,
    mode: options.mode,
    maxSize: options.maxSize,
    quality: options.quality,
    rewriteDb: options.rewriteDb,
    deleteOriginal: options.deleteOriginal,
    dryRun: options.dryRun,
    retryErrorsFrom: options.retryErrorsFrom || null,
    startedAt: new Date().toISOString(),
  }

  console.log(`Bucket           : ${options.bucket}`)
  console.log(`Mode             : ${options.mode}`)
  console.log(`Max size         : ${options.maxSize}px`)
  console.log(`Quality          : ${options.quality}`)
  console.log(`Rewrite DB       : ${options.rewriteDb ? 'yes' : 'no'}`)
  console.log(`Delete original  : ${options.deleteOriginal ? 'yes' : 'no'}`)
  console.log(`Dry run          : ${options.dryRun ? 'yes' : 'no'}`)
  if (options.mode === 'prefix') {
    console.log(`Dest prefix      : ${options.destPrefix}`)
  }
  if (options.retryErrorsFrom) {
    console.log(`Retry source     : ${options.retryErrorsFrom}`)
  }
  console.log(`Log dir          : ${path.relative(REPO_ROOT, logDir) || logDir}`)
  console.log('')

  console.log('Scanning bucket recursively...')
  const allFiles = await listAllFilesRecursive(storage)
  const processableFiles = []
  const skippedEntries = []
  const successEntries = []
  const errorEntries = []
  const retrySourcePaths = options.retryErrorsFrom ? new Set(await readRetryPathsFromLog(options.retryErrorsFrom)) : null

  let skippedWebp = 0
  let skippedUnsupported = 0
  for (const filePath of allFiles) {
    if (retrySourcePaths && !retrySourcePaths.has(normalizeStoragePath(filePath))) {
      continue
    }
    const ext = path.posix.extname(filePath).toLowerCase()
    if (ext === '.webp') {
      skippedWebp += 1
      skippedEntries.push({ sourcePath: filePath, reason: 'already_webp' })
      continue
    }
    if (!SUPPORTED_IMAGE_EXTENSIONS.has(ext)) {
      skippedUnsupported += 1
      skippedEntries.push({ sourcePath: filePath, reason: `unsupported_extension:${ext || 'none'}` })
      continue
    }
    processableFiles.push(filePath)
  }

  console.log(`Found ${allFiles.length} objects`)
  console.log(`- ${processableFiles.length} image(s) to process`)
  console.log(`- ${skippedWebp} skipped (.webp already)`)
  console.log(`- ${skippedUnsupported} skipped (unsupported extension)`)
  console.log('')

  const refsByPath = options.rewriteDb ? await collectRiderPhotoRefs(adminClient, options.bucket) : new Map()
  const totals = {
    processed: 0,
    uploaded: 0,
    deleted: 0,
    dbUpdated: 0,
    skipped: skippedWebp + skippedUnsupported,
    errors: 0,
  }

  for (const [index, sourcePath] of processableFiles.entries()) {
    const itemLabel = `[${index + 1}/${processableFiles.length}]`
    const targetPath = buildTargetPath(sourcePath, options.mode, options.destPrefix)
    try {
      console.log(`${itemLabel} Downloading ${sourcePath}`)
      const { data: sourceFile, error: downloadError } = await storage.download(sourcePath)
      if (downloadError || !sourceFile) {
        throw new Error(`Download failed: ${downloadError?.message ?? 'unknown error'}`)
      }

      const inputBuffer = Buffer.from(await sourceFile.arrayBuffer())
      const outputBuffer = await sharp(inputBuffer)
        .rotate()
        .resize({
          width: options.maxSize,
          height: options.maxSize,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: options.quality })
        .toBuffer()

      if (!options.dryRun) {
        const { error: uploadError } = await storage.upload(targetPath, outputBuffer, {
          contentType: 'image/webp',
          upsert: true,
        })
        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`)
        }
      }
      totals.uploaded += 1

      if (options.rewriteDb) {
        const updatedCount = await updateRiderUrlsForPath({
          adminClient,
          refsByPath,
          bucket: options.bucket,
          sourcePath,
          targetPath,
          dryRun: options.dryRun,
        })
        totals.dbUpdated += updatedCount
      }

      if (options.deleteOriginal && sourcePath !== targetPath) {
        if (!options.dryRun) {
          const { error: deleteError } = await storage.remove([sourcePath])
          if (deleteError) {
            throw new Error(`Delete failed: ${deleteError.message}`)
          }
        }
        totals.deleted += 1
      }

      totals.processed += 1
      successEntries.push({
        sourcePath,
        targetPath,
        dbRewrite: options.rewriteDb,
        dryRun: options.dryRun,
      })
      console.log(`${itemLabel} OK ${sourcePath} -> ${targetPath}`)
    } catch (error) {
      totals.errors += 1
      const message = error instanceof Error ? error.message : String(error)
      errorEntries.push({ sourcePath, targetPath, message })
      console.error(`${itemLabel} ERROR ${sourcePath}: ${message}`)
    }
  }

  const finishedAt = new Date().toISOString()
  await fs.writeFile(
    path.join(logDir, 'run-meta.json'),
    JSON.stringify(
      {
        ...runMeta,
        finishedAt,
        totals,
      },
      null,
      2
    )
  )
  await fs.writeFile(path.join(logDir, 'success.json'), JSON.stringify(successEntries, null, 2))
  await fs.writeFile(path.join(logDir, 'skipped.json'), JSON.stringify(skippedEntries, null, 2))
  await fs.writeFile(path.join(logDir, 'errors.json'), JSON.stringify(errorEntries, null, 2))
  await fs.writeFile(
    path.join(logDir, 'errors.txt'),
    errorEntries.map((entry) => `${entry.sourcePath}\t${entry.message}`).join('\n')
  )

  console.log('\nDone.')
  console.log(`Processed       : ${totals.processed}/${processableFiles.length}`)
  console.log(`Uploaded        : ${totals.uploaded}`)
  console.log(`Deleted         : ${totals.deleted}`)
  console.log(`DB updates      : ${totals.dbUpdated}`)
  console.log(`Skipped         : ${totals.skipped}`)
  console.log(`Errors          : ${totals.errors}`)
  console.log(`Logs saved to   : ${path.relative(REPO_ROOT, logDir) || logDir}`)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Fatal: ${message}`)
  process.exit(1)
})
