import { EventEmitter } from 'events'
import { readdir, stat, unlink } from 'fs/promises'
import path from 'path'
import { drawProgressBar, formatSize, handleFsError } from './utils.js'

const MS_PER_DAY = 1000 * 60 * 60 * 24
const MAX_PREVIEW_FILES = 10

export class Cleanup extends EventEmitter {
  constructor(dirPath = null, { olderThan = 90, confirm = false } = {}) {
    super()
    this.dirPath = dirPath ? path.resolve(dirPath) : null
    this.olderThan = Number(olderThan)
    this.confirm = Boolean(confirm)
    this.isRunning = false

    if (this.dirPath) {
      // Гарантуємо асинхронність події 'initialized'
      process.nextTick(() => {
        this.emit('initialized', {
          dirPath: this.dirPath,
          olderThan: this.olderThan,
          confirm: this.confirm,
        })
      })
    }
  }

  async clean(
    directory = this.dirPath,
    { olderThan = this.olderThan, confirm = this.confirm } = {}
  ) {
    if (this.isRunning) {
      return
    }

    this.dirPath = path.resolve(directory)
    this.olderThan = Number(olderThan)
    this.confirm = Boolean(confirm)
    this.isRunning = true

    try {
      const dirStats = await stat(this.dirPath)
      if (!dirStats.isDirectory()) {
        const notDirError = new Error(`Path is not a directory: ${this.dirPath}`)
        notDirError.code = 'ENOTDIR'
        throw notDirError
      }

      this.emit('started', {
        dirPath: this.dirPath,
        olderThan: this.olderThan,
        confirm: this.confirm,
      })

      const entries = await readdir(this.dirPath, {
        recursive: true,
        withFileTypes: true,
      })

      const fileEntries = entries.filter((entry) => entry.isFile())
      const filesToDelete = []
      let totalSize = 0
      const now = Date.now()

      for (const entry of fileEntries) {
        const parentDir = entry.parentPath || entry.path || this.dirPath
        const fullPath = path.join(parentDir, entry.name)

        try {
          const stats = await stat(fullPath)
          const fileAge = now - stats.mtime.getTime()
          const daysOld = fileAge / MS_PER_DAY

          if (daysOld > this.olderThan) {
            const fileData = {
              name: entry.name,
              path: fullPath,
              size: stats.size,
              mtime: stats.mtime,
              daysOld: Math.floor(daysOld),
            }

            filesToDelete.push(fileData)
            totalSize += stats.size

            this.emit('file-found', fileData)
          }
        } catch (fileErr) {
          this.emit('file-error', { path: fullPath, error: fileErr })
        }
      }

      this.emit('files-collected', {
        files: filesToDelete,
        totalSize,
      })

      let deletedCount = 0
      let freedSize = 0

      if (this.confirm && filesToDelete.length > 0) {
        for (const fileData of filesToDelete) {
          try {
            await unlink(fileData.path)
            deletedCount += 1
            freedSize += fileData.size

            this.emit('file-deleted', {
              file: fileData,
              processed: deletedCount,
              total: filesToDelete.length,
            })
          } catch (deleteErr) {
            this.emit('file-error', { path: fileData.path, error: deleteErr })
          }
        }
      }

      const result = {
        dirPath: this.dirPath,
        olderThan: this.olderThan,
        confirm: this.confirm,
        files: filesToDelete,
        totalSize,
        deletedCount,
        freedSize,
      }

      this.emit('cleanup-complete', result)
      return result
    } catch (err) {
      if (this.listenerCount('error') > 0) {
        this.emit('error', err)
      } else {
        throw err
      }
    } finally {
      this.isRunning = false
    }
  }

  async start() {
    return this.clean(this.dirPath, {
      olderThan: this.olderThan,
      confirm: this.confirm,
    })
  }
}

function parseCleanupArgs(args) {
  let targetDir = null
  let olderThan = null
  let confirm = false

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--older-than') {
      olderThan = Number(args[i + 1])
      i += 1
    } else if (arg.startsWith('--older-than=')) {
      olderThan = Number(arg.slice('--older-than='.length))
    } else if (arg === '--confirm') {
      confirm = true
    } else if (!arg.startsWith('-') && !targetDir) {
      targetDir = arg
    }
  }

  return { targetDir, olderThan, confirm }
}

function formatDate(date) {
  return date.toISOString().split('T')[0]
}

export async function runCleanup(args) {
  const { targetDir, olderThan, confirm } = parseCleanupArgs(args)

  if (!targetDir || olderThan === null || Number.isNaN(olderThan) || olderThan < 0) {
    console.error('❌ Error: Please provide a directory path and a valid --older-than <days> value.')
    console.log('Usage: node file-organizer.js cleanup /path/to/directory --older-than 90 [--confirm]')
    process.exit(1)
  }

  const cleanup = new Cleanup(targetDir, { olderThan, confirm })

  cleanup.on('started', ({ dirPath, olderThan: days }) => {
    console.log(`🧹 Cleanup: ${dirPath}`)
    console.log(`Looking for files older than ${days} days...\n`)
  })

  cleanup.on('files-collected', ({ files, totalSize }) => {
    if (files.length === 0) {
      return
    }

    console.log(`Found ${files.length} files to delete:\n`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    const previewFiles = files.slice(0, MAX_PREVIEW_FILES)
    previewFiles.forEach((file, index) => {
      console.log(`${file.name}`)
      console.log(`  Size: ${formatSize(file.size)}`)
      console.log(`  Modified: ${file.daysOld} days ago (${formatDate(file.mtime)})`)
      if (index < previewFiles.length - 1 || files.length > MAX_PREVIEW_FILES) {
        console.log('')
      }
    })

    if (files.length > MAX_PREVIEW_FILES) {
      console.log(`... (${files.length - MAX_PREVIEW_FILES} more files)`)
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    console.log(`Total: ${files.length} files (${formatSize(totalSize)})\n`)

    if (confirm) {
      console.log(
        `⚠️  DELETING ${files.length} files (${formatSize(totalSize)}). This action cannot be undone!\n`
      )
    }
  })

  cleanup.on('file-deleted', ({ processed, total }) => {
    const bar = drawProgressBar(processed, total)
    process.stdout.write(`\rDeleting... ${bar}`)
  })

  cleanup.on('file-error', ({ path: filePath, error }) => {
    console.error(`\n⚠️ Warning: Cannot process file ${filePath}: ${error.message}`)
  })

  cleanup.on('cleanup-complete', (result) => {
    if (result.files.length === 0) {
      console.log(`✅ No files older than ${result.olderThan} days found.`)
      return
    }

    if (!result.confirm) {
      console.log('⚠️  DRY RUN MODE: No files were deleted.')
      console.log('To actually delete these files, run with --confirm flag.')
    } else {
      process.stdout.write('\n\n')
      console.log('✅ Cleanup complete!')
      console.log(`Deleted: ${result.deletedCount} files (${formatSize(result.freedSize)} freed)`)
    }
  })

  cleanup.on('error', (err) => {
    handleFsError(err, targetDir)
  })

  cleanup.on('initialized', () => {
    cleanup.start()
  })
}

