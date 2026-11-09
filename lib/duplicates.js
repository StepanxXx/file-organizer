import crypto from 'crypto'
import { EventEmitter } from 'events'
import fs from 'fs'
import { readdir, stat } from 'fs/promises'
import path from 'path'
import { drawProgressBar, formatSize, handleFsError } from './utils.js'

export function calculateHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)

    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

export class DuplicateFinder extends EventEmitter {
  constructor(dirPath = null) {
    super()
    this.dirPath = dirPath ? path.resolve(dirPath) : null
    this.isRunning = false

    if (this.dirPath) {
      // Гарантуємо асинхронність події 'initialized'
      process.nextTick(() => {
        this.emit('initialized', this.dirPath)
      })
    }
  }

  async find(directory = this.dirPath) {
    if (this.isRunning) {
      return
    }

    this.dirPath = path.resolve(directory)
    this.isRunning = true

    try {
      const dirStats = await stat(this.dirPath)
      if (!dirStats.isDirectory()) {
        const notDirError = new Error(`Path is not a directory: ${this.dirPath}`)
        notDirError.code = 'ENOTDIR'
        throw notDirError
      }

      this.emit('started', this.dirPath)

      const entries = await readdir(this.dirPath, {
        recursive: true,
        withFileTypes: true,
      })

      const fileEntries = entries.filter((entry) => entry.isFile())
      const totalFilesCount = fileEntries.length

      // Map<hash, Array<filePath>> для групування файлів за хешем
      const hashGroups = new Map()
      const hashSizes = new Map()
      let processedFiles = 0

      for (const entry of fileEntries) {
        const parentDir = entry.parentPath || entry.path || this.dirPath
        const fullPath = path.join(parentDir, entry.name)

        try {
          const stats = await stat(fullPath)
          const hash = await calculateHash(fullPath)

          processedFiles += 1

          const filePaths = hashGroups.get(hash) || []
          filePaths.push(fullPath)
          hashGroups.set(hash, filePaths)

          if (!hashSizes.has(hash)) {
            hashSizes.set(hash, stats.size)
          }

          this.emit('file-processed', {
            path: fullPath,
            hash,
            size: stats.size,
            processed: processedFiles,
            total: totalFilesCount,
          })
        } catch (fileErr) {
          this.emit('file-error', { path: fullPath, error: fileErr })
        }
      }

      const duplicateGroups = []
      let totalWastedSpace = 0

      for (const [hash, filePaths] of hashGroups.entries()) {
        if (filePaths.length > 1) {
          const fileSize = hashSizes.get(hash) || 0
          const wastedSpace = fileSize * (filePaths.length - 1)
          totalWastedSpace += wastedSpace

          duplicateGroups.push({
            hash,
            size: fileSize,
            copies: filePaths.length,
            files: filePaths,
            wastedSpace,
          })
        }
      }

      // Сортуємо групи за обсягом витраченого місця (від найбільшого до найменшого)
      duplicateGroups.sort((a, b) => b.wastedSpace - a.wastedSpace)

      const result = {
        dirPath: this.dirPath,
        totalFiles: processedFiles,
        groups: duplicateGroups,
        totalWastedSpace,
      }

      this.emit('duplicates-found', result)
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
    return this.find(this.dirPath)
  }
}

export async function runDuplicates(targetDir) {
  if (!targetDir) {
    console.error('❌ Error: Please provide a directory path to search for duplicates.')
    console.log('Usage: node file-organizer.js duplicates /path/to/directory')
    process.exit(1)
  }

  const finder = new DuplicateFinder(targetDir)

  finder.on('started', (dirPath) => {
    console.log(`🔍 Searching for duplicates in: ${dirPath}`)
  })

  finder.on('file-processed', (fileData) => {
    const bar = drawProgressBar(fileData.processed, fileData.total)
    process.stdout.write(`\rCalculating hashes... ${bar} files`)
  })

  finder.on('file-error', ({ path: filePath, error }) => {
    console.error(`\n⚠️ Warning: Cannot read file ${filePath}: ${error.message}`)
  })

  finder.on('duplicates-found', (result) => {
    if (result.totalFiles === 0) {
      process.stdout.write(`\rCalculating hashes... ${drawProgressBar(0, 0)} files\n`)
    } else {
      process.stdout.write('\n')
    }

    if (result.groups.length === 0) {
      console.log('\n✅ No duplicate files found.')
      return
    }

    const baseDirName = path.basename(result.dirPath)

    console.log(
      `\nFound ${result.groups.length} duplicate groups (${formatSize(result.totalWastedSpace)} wasted):\n`
    )

    result.groups.forEach((group, index) => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log(
        `Group ${index + 1} (${group.copies} copies, ${formatSize(group.size)} each):`
      )
      console.log(`  SHA-256: ${group.hash.slice(0, 12)}...\n`)

      for (const filePath of group.files) {
        const relativeFile = path.join(baseDirName, path.relative(result.dirPath, filePath))
        console.log(`  📄 ${relativeFile}`)
      }

      console.log(`\n  Wasted space: ${formatSize(group.wastedSpace)}\n`)
    })

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`💾 Total wasted space: ${formatSize(result.totalWastedSpace)}`)
  })

  finder.on('error', (err) => {
    handleFsError(err, targetDir)
  })

  finder.on('initialized', () => {
    finder.start()
  })
}

