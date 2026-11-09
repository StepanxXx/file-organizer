import { EventEmitter } from 'events'
import { readdir, stat } from 'fs/promises'
import path from 'path'
import { drawProgressBar, formatFsError, formatSize, handleFsError } from './utils.js'

export class Scanner extends EventEmitter {
  constructor(dirPath = null) {
    super()
    this.dirPath = dirPath ? path.resolve(dirPath) : null
    this.isScanning = false

    if (this.dirPath) {
      // Гарантуємо асинхронність події 'initialized' (аналогічно FileMonitor)
      process.nextTick(() => {
        this.emit('initialized', this.dirPath)
      })
    }
  }

  async scan(directory = this.dirPath) {
    if (this.isScanning) {
      return
    }

    this.dirPath = path.resolve(directory)
    this.isScanning = true

    try {
      const dirStats = await stat(this.dirPath)
      if (!dirStats.isDirectory()) {
        const notDirError = new Error(`Path is not a directory: ${this.dirPath}`)
        notDirError.code = 'ENOTDIR'
        throw notDirError
      }

      this.emit('scan-start', { directory: this.dirPath })
      this.emit('started', this.dirPath)

      const entries = await readdir(this.dirPath, {
        recursive: true,
        withFileTypes: true,
      })

      const fileEntries = entries.filter((entry) => entry.isFile())
      const totalFilesCount = fileEntries.length

      let totalFiles = 0
      let totalSize = 0
      const byType = new Map()
      const fileAge = {
        last7Days: 0,
        last30Days: 0,
        olderThan90Days: 0,
      }
      const allFiles = []
      let oldestFile = null

      const now = Date.now()
      const MS_PER_DAY = 1000 * 60 * 60 * 24

      for (const entry of fileEntries) {
        const parentDir = entry.parentPath || entry.path || this.dirPath
        const fullPath = path.join(parentDir, entry.name)

        try {
          const stats = await stat(fullPath)
          const ext = path.extname(entry.name).toLowerCase() || '(other)'
          const ageInDays = Math.floor((now - stats.mtime.getTime()) / MS_PER_DAY)

          totalFiles += 1
          totalSize += stats.size

          // Групування за типом файлу у Map<extension, { count, totalSize }>
          const typeStats = byType.get(ext) || { count: 0, totalSize: 0 }
          typeStats.count += 1
          typeStats.totalSize += stats.size
          byType.set(ext, typeStats)

          // Розподіл за віком
          if (ageInDays <= 7) {
            fileAge.last7Days += 1
          }
          if (ageInDays <= 30) {
            fileAge.last30Days += 1
          }
          if (ageInDays > 90) {
            fileAge.olderThan90Days += 1
          }

          const fileData = {
            name: entry.name,
            path: fullPath,
            ext,
            size: stats.size,
            mtime: stats.mtime,
            ageInDays,
            processed: totalFiles,
            total: totalFilesCount,
          }

          allFiles.push(fileData)

          if (!oldestFile || stats.mtime < oldestFile.mtime) {
            oldestFile = fileData
          }

          this.emit('file-found', fileData)
        } catch (fileErr) {
          this.emit('file-error', { path: fullPath, error: fileErr })
        }
      }

      const largestFiles = [...allFiles]
        .sort((a, b) => b.size - a.size)
        .slice(0, 3)

      const statistics = {
        dirPath: this.dirPath,
        totalFiles,
        totalSize,
        byType,
        fileAge,
        largestFiles,
        oldestFile,
      }

      this.emit('scan-complete', statistics)
      return statistics
    } catch (err) {
      if (this.listenerCount('error') > 0) {
        this.emit('error', err)
      } else {
        throw err
      }
    } finally {
      this.isScanning = false
    }
  }

  async start() {
    return this.scan(this.dirPath)
  }
}

export async function runScan(targetDir) {
  if (!targetDir) {
    console.error('❌ Error: Please provide a directory path to scan.')
    console.log('Usage: node file-organizer.js scan /path/to/directory')
    process.exit(1)
  }

  const scanner = new Scanner(targetDir)

  scanner.on('scan-start', ({ directory }) => {
    console.log(`📂 Scanning: ${directory}`)
  })

  scanner.on('file-found', (fileData) => {
    const bar = drawProgressBar(fileData.processed, fileData.total)
    process.stdout.write(`\rProcessing... ${bar} files`)
  })

  scanner.on('file-error', ({ path: filePath, error }) => {
    console.error(`\n⚠️ Warning: ${formatFsError(error, filePath)}`)
  })

  scanner.on('scan-complete', (stats) => {
    if (stats.totalFiles === 0) {
      process.stdout.write(`\rProcessing... ${drawProgressBar(0, 0)} files\n`)
    } else {
      process.stdout.write('\n')
    }

    console.log('\n📊 Scan Results:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`Total files: ${stats.totalFiles}`)
    console.log(`Total size: ${formatSize(stats.totalSize)}`)

    console.log('\nBy File Type:')
    if (stats.byType.size === 0) {
      console.log('  (no files found)')
    } else {
      const sortedTypes = [...stats.byType.entries()].sort(([extA, dataA], [extB, dataB]) => {
        if (extA === '(other)') return 1
        if (extB === '(other)') return -1
        return dataB.totalSize - dataA.totalSize
      })

      for (const [ext, data] of sortedTypes) {
        const extCol = ext.padEnd(8, ' ')
        const countCol = `${data.count} files`.padEnd(11, ' ')
        const sizeCol = formatSize(data.totalSize).padStart(8, ' ')
        console.log(`  ${extCol}${countCol}${sizeCol}`)
      }
    }

    console.log('\nFile Age:')
    console.log(`  Last 7 days:    ${stats.fileAge.last7Days} files`)
    console.log(`  Last 30 days:   ${stats.fileAge.last30Days} files`)
    console.log(`  Older than 90:  ${stats.fileAge.olderThan90Days} files`)

    console.log('\nLargest files:')
    if (stats.largestFiles.length === 0) {
      console.log('  (none)')
    } else {
      stats.largestFiles.forEach((file, index) => {
        const nameCol = file.name.padEnd(22, ' ')
        console.log(`  ${index + 1}. ${nameCol} ${formatSize(file.size)}`)
      })
    }

    if (stats.oldestFile) {
      console.log(
        `\nOldest file: ${stats.oldestFile.name} (modified ${stats.oldestFile.ageInDays} days ago)`
      )
    }
  })

  scanner.on('error', (err) => {
    handleFsError(err, targetDir)
  })

  scanner.on('initialized', () => {
    scanner.start()
  })
}

