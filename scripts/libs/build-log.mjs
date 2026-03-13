import chalk from 'chalk'
import dayjs from 'dayjs'

export const PLATFORM_LABELS = {
  mac: 'macOS',
  win: 'Windows',
  linux: 'Linux',
}

const PLATFORM_COLORS = {
  mac: chalk.magenta,
  win: chalk.cyan,
  linux: chalk.green,
}

export function formatTimestamp(date = new Date()) {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
}

function formatLogLine(message) {
  return `${formatTimestamp()} ${message}`
}

export function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }

  return `${seconds}s`
}

export function logBanner(message) {
  console.log(chalk.bold.blue(`\n${formatLogLine(`=== ${message} ===`)}`))
}

export function logStep(message) {
  console.log(chalk.blue(formatLogLine(`-> ${message}`)))
}

export function logSuccess(message) {
  console.log(chalk.green(formatLogLine(`✓ ${message}`)))
}

export function logWarning(message) {
  console.log(chalk.yellow(formatLogLine(`! ${message}`)))
}

export function logPlatform(platform, message) {
  const color = PLATFORM_COLORS[platform] || chalk.white
  const label = PLATFORM_LABELS[platform] || platform
  console.log(color(formatLogLine(`[${label}] ${message}`)))
}
