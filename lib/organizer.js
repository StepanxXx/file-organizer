import { EventEmitter } from 'events'
import fs from 'fs'
import { access, copyFile, mkdir, readdir, stat } from 'fs/promises'
import path from 'path'
import { pipeline } from 'stream/promises'
import { drawProgressBar, formatSize, handleFsError } from './utils.js'

export const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024 // 10 MB

export const categories = {
  Documents: ['.pdf', '.docx', '.doc', '.txt', '.md', '.xlsx', '.pptx'],
  Images: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'],
  Archives: ['.zip', '.rar', '.tar', '.gz', '.7z'],
  Code: ['.js', '.py', '.java', '.cpp', '.html', '.css', '.json'],
  Videos: ['.mp4', '.avi', '.mkv', '.mov', '.webm'],
  Other: [],
}

export function getCategoryForFile(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (!ext) {
    return 'Other'
  }

  for (const [category, extensions] of Object.entries(categories)) {
    if (extensions.includes(ext)) {
      return category
    }
  }

  return 'Other'
}

async function fileExists(targetPath) {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
  }
}

export async function resolveUniqueTargetPath(categoryDir, fileName) {
  const ext = path.extname(fileName)
  const baseName = path.basename(fileName, ext)
  let candidatePath = path.join(categoryDir, fileName)
  let counter = 1

  while (await fileExists(candidatePath)) {
    const newName = `${baseName}(${counter})${ext}`
    candidatePath = path.join(categoryDir, newName)
    counter += 1
  }

  return candidatePath
}

export class Organizer extends EventEmitter {
  constructor(sourceDir = null, targetDir = null) {
    super()
    this.sourceDir = sourceDir ? path.resolve(sourceDir) : null
    this.targetDir = targetDir ? path.resolve(targetDir) : null
    this.isRunning = false

    if (this.sourceDir && this.targetDir) {
      // Гарантуємо асинхронність події 'initialized'
      process.nextTick(() => {
        this.emit('initialized', {
          sourceDir: this.sourceDir,
          targetDir: this.targetDir,
        })
      })
    }
  }

  async organize(sourceDir = this.sourceDir, targetDir = this.targetDir) {
    if (this.isRunning) {
      return
    }

    this.sourceDir = path.resolve(sourceDir)
    this.targetDir = path.resolve(targetDir)
    this.isRunning = true

    try {
      const sourceStats = await stat(this.sourceDir)
      if (!sourceStats.isDirectory()) {
        const notDirError = new Error(`Path is not a directory: ${this.sourceDir}`)
        notDirError.code = 'ENOTDIR'
        throw notDirError
      }

      this.emit('started', {
        sourceDir: this.sourceDir,
        targetDir: this.targetDir,
      })

      // Створюємо цільові директорії для кожної категорії
      const categoryNames = Object.keys(categories)
      const summary = new Map()

      for (const category of categoryNames) {
        const categoryPath = path.join(this.targetDir, category)
        await mkdir(categoryPath, { recursive: true })
        summary.set(category, { count: 0, totalSize: 0 })
        this.emit('folder-created', category)
      }

      // Збираємо всі файли з вихідної директорії
      const entries = await readdir(this.sourceDir, {
        recursive: true,
        withFileTypes: true,
      })

      const fileEntries = entries.filter((entry) => {
        if (!entry.isFile()) return false
        const parentDir = entry.parentPath || entry.path || this.sourceDir
        const fullPath = path.join(parentDir, entry.name)
        // Захист на випадок, якщо цільова директорія знаходиться всередині вихідної
        return !fullPath.startsWith(this.targetDir + path.sep)
      })

      const totalFilesCount = fileEntries.length
      let totalCopied = 0
      let totalSize = 0

      for (let i = 0; i < fileEntries.length; i += 1) {
        const entry = fileEntries[i]
        const parentDir = entry.parentPath || entry.path || this.sourceDir
        const sourcePath = path.join(parentDir, entry.name)

        try {
          const stats = await stat(sourcePath)
          const category = getCategoryForFile(entry.name)
          const categoryDir = path.join(this.targetDir, category)
          const targetPath = await resolveUniqueTargetPath(categoryDir, entry.name)
          const useStream = stats.size >= LARGE_FILE_THRESHOLD

          this.emit('copy-start', {
            sourcePath,
            targetPath,
            category,
            size: stats.size,
            useStream,
            index: i + 1,
            total: totalFilesCount,
          })

          if (useStream) {
            await pipeline(
              fs.createReadStream(sourcePath),
              fs.createWriteStream(targetPath)
            )
          } else {
            await copyFile(sourcePath, targetPath)
          }

          totalCopied += 1
          totalSize += stats.size

          const catStats = summary.get(category)
          catStats.count += 1
          catStats.totalSize += stats.size

          this.emit('copy-complete', {
            sourcePath,
            targetPath,
            category,
            size: stats.size,
            useStream,
            processed: totalCopied,
            total: totalFilesCount,
          })
        } catch (copyErr) {
          this.emit('copy-error', { path: sourcePath, error: copyErr })
        }
      }

      const result = {
        sourceDir: this.sourceDir,
        targetDir: this.targetDir,
        summary,
        totalCopied,
        totalSize,
        totalFiles: totalFilesCount,
      }

      this.emit('organize-complete', result)
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
    return this.organize(this.sourceDir, this.targetDir)
  }
}

function parseOrganizeArgs(args) {
  let sourceDir = null
  let targetDir = null

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--output' || arg === '-o') {
      targetDir = args[i + 1]
      i += 1
    } else if (arg.startsWith('--output=')) {
      targetDir = arg.slice('--output='.length)
    } else if (!arg.startsWith('-') && !sourceDir) {
      sourceDir = arg
    }
  }

  return { sourceDir, targetDir }
}

export async function runOrganize(args) {
  const { sourceDir, targetDir } = parseOrganizeArgs(args)

  if (!sourceDir || !targetDir) {
    console.error('❌ Error: Please provide both source directory and --output target directory.')
    console.log('Usage: node file-organizer.js organize /source/directory --output /target/directory')
    process.exit(1)
  }

  const organizer = new Organizer(sourceDir, targetDir)
  let foldersPrintedHeader = false

  organizer.on('started', ({ sourceDir: resolvedSource, targetDir: resolvedTarget }) => {
    console.log(`📦 Organizing: ${resolvedSource}`)
    console.log(`Target: ${resolvedTarget}\n`)
  })

  organizer.on('folder-created', (category) => {
    if (!foldersPrintedHeader) {
      console.log('Creating folders...')
      foldersPrintedHeader = true
    }
    console.log(`  ✓ ${category}/`)
  })

  organizer.on('copy-start', ({ index }) => {
    if (index === 1) {
      console.log('')
    }
  })

  organizer.on('copy-complete', (fileData) => {
    const bar = drawProgressBar(fileData.processed, fileData.total)
    process.stdout.write(`\rCopying files... ${bar}`)
  })

  organizer.on('copy-error', ({ path: filePath, error }) => {
    console.error(`\n⚠️ Warning: Cannot copy file ${filePath}: ${error.message}`)
  })

  organizer.on('organize-complete', (result) => {
    if (result.totalFiles === 0) {
      console.log(`\nCopying files... ${drawProgressBar(0, 0)}`)
    } else {
      process.stdout.write('\n')
    }

    const targetBaseName = path.basename(result.targetDir)

    console.log('\n✅ Organization complete!\n')
    console.log('Summary:')

    for (const [category, data] of result.summary.entries()) {
      const catLabel = `${category}:`.padEnd(11, ' ')
      const countLabel = `${data.count} files`.padStart(9, ' ')
      console.log(`  ${catLabel}${countLabel} → ${targetBaseName}/${category}/`)
    }

    console.log(`\nTotal copied: ${result.totalCopied} files (${formatSize(result.totalSize)})`)
  })

  organizer.on('error', (err) => {
    handleFsError(err, sourceDir)
  })

  organizer.on('initialized', () => {
    organizer.start()
  })
}

