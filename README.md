# 🗂️ file-organizer

CLI-інструмент на Node.js для аналізу стану директорій, пошуку дублікатів, організації файлів за категоріями та очищення застарілих даних. Побудований на основі подієвої архітектури (`EventEmitter`), потокової обробки (`Streams`) та асинхронного API файлової системи (`fs/promises`).

---

## 📋 Вимоги

- **Node.js** версії `20.1.0` або новішої (проєкт використовує ES Modules `"type": "module"` та `fs.readdir` з `{ recursive: true }`).

---

## 🚀 Встановлення та підготовка

1. Клонуйте репозиторій та перейдіть у директорію проєкту:
   ```bash
   git clone https://github.com/StepanxXx/file-organizer.git
   cd file-organizer
   ```

2. Згенеруйте тестову директорію `exemple/` з набором файлів різного розміру, типу та віку:
   ```bash
   npm run seed
   ```
   Або напряму:
   ```bash
   node scripts/generate-example.js
   ```

---

## 💻 Використання та команди

Запускати команди можна напряму через `node` або за допомогою `npm scripts` (передаючи аргументи після `--`):

```bash
node file-organizer.js <command> [options]
# або
npm run <command> -- [options]
```

---

### 1. Команда `scan` — аналіз директорії

Рекурсивно обходить вказану директорію та всі її піддиректорії, збираючи детальну статистику про файли:
- Загальна кількість файлів та сумарний розмір
- Групування за типом (розширенням) з кількістю та розміром для кожного типу
- Розподіл файлів за віком останньої модифікації (`Last 7 days`, `Last 30 days`, `Older than 90`)
- Топ-3 найбільших файли
- Найстаріший файл у директорії

#### Синтаксис та аргументи:
```bash
node file-organizer.js scan <directory>
# або
npm run scan -- <directory>
```
- `<directory>` *(обов'язковий)* — шлях до цільової директорії (відносний або абсолютний), яку потрібно просканувати.

#### Приклад запуску:
```bash
node file-organizer.js scan ./exemple
```

#### Приклад виведення:
```text
📂 Scanning: /Users/s/Documents/l-node/homework/file-organizer/exemple
Processing... ████████████████████ 16/16 files

📊 Scan Results:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total files: 16
Total size: 18.2 MB

By File Type:
  .mp4    1 files      11.0 MB
  .zip    2 files       3.8 MB
  .pptx   1 files       1.5 MB
  .pdf    4 files       1.1 MB
  .png    2 files     360.0 KB
  .docx   1 files     310.0 KB
  .jpg    1 files      95.0 KB
  .js     2 files      11.4 KB
  .txt    1 files       5.4 KB
  (other) 1 files      32.0 KB

File Age:
  Last 7 days:    6 files
  Last 30 days:   10 files
  Older than 90:  5 files

Largest files:
  1. video_lecture.mp4      11.0 MB
  2. archive_backup.zip     3.0 MB
  3. presentation.pptx      1.5 MB

Oldest file: old_report.pdf (modified 365 days ago)
```

---

### 2. Команда `duplicates` — пошук дублікатів

Знаходить файли з абсолютно ідентичним вмістом за допомогою обчислення криптографічного хешу `SHA-256` через потокове читання (`fs.createReadStream()`), не завантажуючи файли повністю в оперативну пам'ять.
- Групує знайдені дублікати у `Map<hash, Array<filePath>>`
- Виводить лише групи, де кількість копій `> 1`
- Розраховує марно витрачене місце на диску для кожної групи (`розмір * (кількість копій - 1)`) та загалом

#### Синтаксис та аргументи:
```bash
node file-organizer.js duplicates <directory>
# або
npm run duplicates -- <directory>
```
- `<directory>` *(обов'язковий)* — шлях до цільової директорії для пошуку дублікатів.

#### Приклад запуску:
```bash
node file-organizer.js duplicates ./exemple
```

#### Приклад виведення:
```text
🔍 Searching for duplicates in: /Users/s/Documents/l-node/homework/file-organizer/exemple
Calculating hashes... ████████████████████ 16/16 files

Found 2 duplicate groups (680.0 KB wasted):

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Group 1 (3 copies, 250.0 KB each):
  SHA-256: 1235ccdb3312...

  📄 exemple/report.pdf
  📄 exemple/docs/report_copy.pdf
  📄 exemple/backups/report.pdf

  Wasted space: 500.0 KB

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Group 2 (2 copies, 180.0 KB each):
  SHA-256: 81bbcdc32d09...

  📄 exemple/media/screenshot.png
  📄 exemple/media/screenshots/screenshot_dup.png

  Wasted space: 180.0 KB

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💾 Total wasted space: 680.0 KB
```

---

### 3. Команда `organize` — сортування файлів за категоріями

Копіює файли з вихідної директорії до цільової, сортуючи їх у піддиректорії за категоріями: `Documents`, `Images`, `Archives`, `Code`, `Videos`, `Other`.
- Оригінальні файли у вихідній директорії залишаються незмінними
- Малі файли (`< 10 MB`) копіюються через `fs.copyFile()`
- Великі файли (`≥ 10 MB`) копіюються потоково через `pipeline(fs.createReadStream(), fs.createWriteStream())`
- При збігу імен файлів у цільовій папці автоматично додається числовий суфікс (`report.pdf` → `report(1).pdf` → `report(2).pdf`)

#### Синтаксис та аргументи:
```bash
node file-organizer.js organize <source> --output <target>
# або
npm run organize -- <source> --output <target>
```
- `<source>` *(обов'язковий)* — вихідна директорія з файлами.
- `--output <target>` або `-o <target>` *(обов'язковий)* — цільова директорія, де будуть створені папки категорій.

#### Приклад запуску:
```bash
node file-organizer.js organize ./exemple --output ./organized
```

#### Приклад виведення:
```text
📦 Organizing: /Users/s/Documents/l-node/homework/file-organizer/exemple
Target: /Users/s/Documents/l-node/homework/file-organizer/organized

Creating folders...
  ✓ Documents/
  ✓ Images/
  ✓ Archives/
  ✓ Code/
  ✓ Videos/
  ✓ Other/

Copying files... ████████████████████ 16/16

✅ Organization complete!

Summary:
  Documents:   7 files → organized/Documents/
  Images:      3 files → organized/Images/
  Archives:    2 files → organized/Archives/
  Code:        2 files → organized/Code/
  Videos:      1 files → organized/Videos/
  Other:       1 files → organized/Other/

Total copied: 16 files (18.2 MB)
```

---

### 4. Команда `cleanup` — пошук та видалення застарілих файлів

Знаходить файли, дата останньої модифікації яких старіша за вказану кількість днів (`--older-than <days>`).
- За замовчуванням працює у безпечному режимі попереднього перегляду (**Dry Run Mode**) і лише показує список файлів без їх фактичного видалення.
- При передачі прапорця `--confirm` виконує фактичне видалення знайдених файлів через `fs.unlink()` із відображенням прогрес-бару.

#### Синтаксис та аргументи:
```bash
# Режим попереднього перегляду (dry run)
node file-organizer.js cleanup <directory> --older-than <days>
# або
npm run cleanup -- <directory> --older-than <days>

# Фактичне видалення з підтвердженням
node file-organizer.js cleanup <directory> --older-than <days> --confirm
# або
npm run cleanup -- <directory> --older-than <days> --confirm
```
- `<directory>` *(обов'язковий)* — цільова директорія для пошуку старих файлів.
- `--older-than <days>` *(обов'язковий)* — мінімальний вік файлів у днях від дати останньої модифікації.
- `--confirm` *(опціональний)* — підтвердження фактичного видалення файлів.

#### Приклад запуску (Dry Run):
```bash
node file-organizer.js cleanup ./exemple --older-than 90
```

#### Приклад виведення (Dry Run):
```text
🧹 Cleanup: /Users/s/Documents/l-node/homework/file-organizer/exemple
Looking for files older than 90 days...

Found 5 files to delete:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LICENSE_NOTE
  Size: 32.0 KB
  Modified: 95 days ago (2026-08-06)

legacy_script.js
  Size: 4.4 KB
  Modified: 180 days ago (2026-05-13)

avatar.jpg
  Size: 95.0 KB
  Modified: 120 days ago (2026-07-12)

old_report.pdf
  Size: 420.0 KB
  Modified: 365 days ago (2025-11-09)

old_project_2025.zip
  Size: 800.0 KB
  Modified: 240 days ago (2026-03-14)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total: 5 files (1.3 MB)

⚠️  DRY RUN MODE: No files were deleted.
To actually delete these files, run with --confirm flag.
```

---

## 🏗️ Структура проєкту

```text
file-organizer/
├── package.json
├── .gitignore
├── README.md
├── file-organizer.js            # Точка входу в програму (маршрутизатор команд)
├── lib/
│   ├── scanner.js               # Реалізація команди scan (клас Scanner)
│   ├── duplicates.js            # Реалізація команди duplicates (клас DuplicateFinder)
│   ├── organizer.js             # Реалізація команди organize (клас Organizer)
│   ├── cleanup.js               # Реалізація команди cleanup (клас Cleanup)
│   └── utils.js                 # Допоміжні функції (formatSize, drawProgressBar, handleFsError)
├── scripts/
│   └── generate-example.js      # Скрипт генерації тестових даних у папці exemple/
└── exemple/                     # Згенеровані тестові файли та піддиректорії
```

---

## ⚙️ Технічні особливості

- **Архітектура на основі `EventEmitter`**:
  - Клас `Scanner` (`lib/scanner.js`) емітить події: `initialized`, `scan-start`, `started`, `file-found`, `file-error`, `scan-complete`, `error`.
  - Клас `DuplicateFinder` (`lib/duplicates.js`) емітить події: `initialized`, `started`, `file-processed`, `file-error`, `duplicates-found`, `error`.
  - Клас `Organizer` (`lib/organizer.js`) емітить події: `initialized`, `started`, `folder-created`, `copy-start`, `copy-complete`, `copy-error`, `organize-complete`, `error`.
  - Клас `Cleanup` (`lib/cleanup.js`) емітить події: `initialized`, `started`, `file-found`, `files-collected`, `file-deleted`, `file-error`, `cleanup-complete`, `error`.
- **Потокова обробка (`Streams`)**:
  - Обчислення хешів `SHA-256` виконується через `fs.createReadStream()` та `crypto.createHash('sha256')` без використання `fs.readFile()`.
  - Копіювання великих файлів (`≥ 10 MB`) у команді `organize` виконується через `pipeline(fs.createReadStream(), fs.createWriteStream())` з `stream/promises`.
- **Обробка помилок**:
  Усі файлові операції обгорнуті в `try...catch` із зрозумілими повідомленнями для кодів `ENOENT` (`❌ Error: Directory not found`), `EACCES` / `EPERM` (`❌ Error: Permission denied`), `ENOTDIR` та викликом `process.exit(1)`.
