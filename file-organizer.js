import { runCleanup } from './lib/cleanup.js'
import { runDuplicates } from './lib/duplicates.js'
import { runOrganize } from './lib/organizer.js'
import { runScan } from './lib/scanner.js'

const [, , command, ...args] = process.argv

switch (command) {
  case 'scan':
    runScan(args[0])
    break
  case 'duplicates':
    runDuplicates(args[0])
    break
  case 'organize':
    runOrganize(args)
    break
  case 'cleanup':
    runCleanup(args)
    break
  default:
    console.log('Usage: node file-organizer.js <command> [options]')
    console.log('\nAvailable commands:')
    console.log('  scan <directory>                              Recursively scan a directory and show file statistics')
    console.log('  duplicates <directory>                        Find duplicate files using SHA-256 streams')
    console.log('  organize <source> --output <target>           Copy and sort files into category folders')
    console.log('  cleanup <directory> --older-than <days>       Find and delete old files (use --confirm to delete)')
    process.exit(command ? 1 : 0)
}
