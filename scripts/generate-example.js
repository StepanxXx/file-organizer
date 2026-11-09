import { mkdir, rm, utimes, writeFile } from 'fs/promises'
import path from 'path'

const EXAMPLE_DIR = path.resolve('./exemple')
const MS_PER_DAY = 1000 * 60 * 60 * 24

function createBuffer(sizeInBytes, fillChar = 'A') {
  return Buffer.alloc(sizeInBytes, fillChar)
}

async function createTestFile(relativePath, contentBuffer, daysAgo = 0) {
  const fullPath = path.join(EXAMPLE_DIR, relativePath)
  await mkdir(path.dirname(fullPath), { recursive: true })
  await writeFile(fullPath, contentBuffer)

  const targetTime = new Date(Date.now() - daysAgo * MS_PER_DAY)
  await utimes(fullPath, targetTime, targetTime)
}

async function generateExampleData() {
  console.log(`🛠  Preparing test directory: ${EXAMPLE_DIR}`)

  // Очищуємо попередню директорію exemple, якщо вона існує
  await rm(EXAMPLE_DIR, { recursive: true, force: true })
  await mkdir(EXAMPLE_DIR, { recursive: true })

  // Спільні буфери для створення дублікатів
  const duplicatePdfContent = createBuffer(250 * 1024, 'P') // 250 KB
  const duplicateImageContent = createBuffer(180 * 1024, 'I') // 180 KB

  const testFiles = [
    // Відео та великі файли (включно з файлом ≥10 MB для перевірки streams)
    {
      path: 'video_lecture.mp4',
      buffer: createBuffer(11 * 1024 * 1024, 'V'), // 11 MB
      daysAgo: 2,
    },
    {
      path: 'backups/archive_backup.zip',
      buffer: createBuffer(3 * 1024 * 1024, 'Z'), // 3 MB
      daysAgo: 18,
    },
    {
      path: 'docs/presentation.pptx',
      buffer: createBuffer(1536 * 1024, 'X'), // 1.5 MB
      daysAgo: 5,
    },

    // Документи (.pdf, .docx, .txt) + дублікати + старі файли
    {
      path: 'report.pdf',
      buffer: duplicatePdfContent,
      daysAgo: 1,
    },
    {
      path: 'docs/report_copy.pdf', // Дублікат report.pdf
      buffer: duplicatePdfContent,
      daysAgo: 12,
    },
    {
      path: 'backups/report.pdf', // Ще один дублікат + однакова назва для тесту конфліктів organize
      buffer: duplicatePdfContent,
      daysAgo: 45,
    },
    {
      path: 'docs/old_report.pdf', // Найстаріший файл (365 днів тому)
      buffer: createBuffer(420 * 1024, 'O'),
      daysAgo: 365,
    },
    {
      path: 'docs/contract.docx',
      buffer: createBuffer(310 * 1024, 'D'),
      daysAgo: 25,
    },
    {
      path: 'notes.txt',
      buffer: Buffer.from('Meeting notes and action items for file-organizer CLI.\n'.repeat(100)),
      daysAgo: 3,
    },

    // Зображення (.png, .jpg) + дублікати
    {
      path: 'media/screenshot.png',
      buffer: duplicateImageContent,
      daysAgo: 4,
    },
    {
      path: 'media/screenshots/screenshot_dup.png', // Дублікат screenshot.png
      buffer: duplicateImageContent,
      daysAgo: 20,
    },
    {
      path: 'media/avatar.jpg',
      buffer: createBuffer(95 * 1024, 'J'),
      daysAgo: 120,
    },

    // Код (.js, .json)
    {
      path: 'scripts/helper.js',
      buffer: Buffer.from('export const sum = (a, b) => a + b;\n'.repeat(200)),
      daysAgo: 6,
    },
    {
      path: 'scripts/legacy_script.js',
      buffer: Buffer.from('console.log("Legacy script");\n'.repeat(150)),
      daysAgo: 180,
    },

    // Архів старий
    {
      path: 'backups/old_project_2025.zip',
      buffer: createBuffer(800 * 1024, 'A'),
      daysAgo: 240,
    },

    // Файл без розширення (потрапить у категорію (other))
    {
      path: 'LICENSE_NOTE',
      buffer: createBuffer(32 * 1024, 'L'),
      daysAgo: 95,
    },
  ]

  for (const file of testFiles) {
    await createTestFile(file.path, file.buffer, file.daysAgo)
  }

  console.log(`✅ Created ${testFiles.length} test files in ${EXAMPLE_DIR}`)
}

generateExampleData().catch((err) => {
  console.error('❌ Failed to generate test data:', err.message)
  process.exit(1)
})

