export function formatSize(bytes) {
  if (bytes === 0) {
    return '0.0 KB'
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  } else if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  } else {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }
}

export function drawProgressBar(current, total, width = 20) {
  const percentage = total > 0 ? Math.min(1, current / total) : 1
  const filled = Math.round(percentage * width)
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled)
  return `${bar} ${current}/${total}`
}

export function formatFsError(error, targetPath) {
  const location = error?.path || targetPath

  if (error?.code === 'ENOENT') {
    return `File or directory not found: ${location}`
  }
  if (error?.code === 'EACCES' || error?.code === 'EPERM') {
    return `Permission denied: ${location}`
  }
  if (error?.code === 'ENOTDIR') {
    return `Not a directory: ${location}`
  }

  return `Cannot process ${location}: ${error?.message || 'Unknown file system error'}`
}

export function handleFsError(error, targetPath) {
  const location = error?.path || targetPath
  if (error.code === 'ENOENT') {
    console.error(`\n❌ Error: Directory not found: ${location}`)
  } else if (error.code === 'EACCES' || error.code === 'EPERM') {
    console.error(`\n❌ Error: Permission denied: ${location}`)
  } else if (error.code === 'ENOTDIR') {
    console.error(`\n❌ Error: Not a directory: ${location}`)
  } else {
    console.error(`\n❌ Unexpected error: ${error.message}`)
  }
  process.exit(1)
}

