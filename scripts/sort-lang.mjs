import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const LANG_DIR = path.join(__dirname, '..', 'src', 'common', 'i18n', 'languages')

function getIndent(line) {
  const match = line.match(/^(\s*)/)
  return match ? match[1].length : 0
}

function extractKey(line) {
  const match = line.match(/^\s*(['"]?)([a-zA-Z_]\w*)\1\s*:/)
  return match ? match[2] : null
}

function naturalCompare(a, b) {
  const regex = /(\d+)|(\D+)/g
  const aParts = a.match(regex) || []
  const bParts = b.match(regex) || []
  const maxLen = Math.max(aParts.length, bParts.length)

  for (let i = 0; i < maxLen; i += 1) {
    const aPart = aParts[i] || ''
    const bPart = bParts[i] || ''
    const aIsNumber = /^\d+$/.test(aPart)
    const bIsNumber = /^\d+$/.test(bPart)

    if (aIsNumber && bIsNumber) {
      const diff = Number.parseInt(aPart, 10) - Number.parseInt(bPart, 10)
      if (diff !== 0) {
        return diff
      }
      continue
    }

    const diff = aPart.localeCompare(bPart)
    if (diff !== 0) {
      return diff
    }
  }

  return 0
}

function hasOpenBrace(line) {
  return line.includes('{')
}

function sortObjectContent(lines) {
  if (lines.length === 0) {
    return lines
  }

  const groups = []
  let currentGroup = []

  for (const line of lines) {
    if (/^\s*$/.test(line)) {
      if (currentGroup.length > 0) {
        groups.push({ type: 'content', lines: currentGroup })
        currentGroup = []
      }
      groups.push({ type: 'blank', lines: [line] })
      continue
    }

    currentGroup.push(line)
  }

  if (currentGroup.length > 0) {
    groups.push({ type: 'content', lines: currentGroup })
  }

  for (const group of groups) {
    if (group.type === 'content') {
      group.lines = sortContentGroup(group.lines)
    }
  }

  return groups.flatMap((group) => group.lines)
}

function sortContentGroup(lines) {
  const entries = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const indent = getIndent(line)
    const key = extractKey(line)

    if (key === null) {
      entries.push({
        key: null,
        lines: [line],
      })
      index += 1
      continue
    }

    const entry = {
      key,
      lines: [line],
    }

    index += 1

    if (hasOpenBrace(line)) {
      let braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length
      const nestedLines = []

      while (index < lines.length && braceCount > 0) {
        const currentLine = lines[index]
        braceCount += (currentLine.match(/{/g) || []).length
        braceCount -= (currentLine.match(/}/g) || []).length

        if (braceCount > 0) {
          nestedLines.push(currentLine)
        } else {
          entry.lines.push(currentLine)
        }

        index += 1
      }

      if (nestedLines.length > 0) {
        entry.lines.splice(1, 0, ...sortObjectContent(nestedLines))
      }
    } else {
      while (index < lines.length) {
        const nextLine = lines[index]
        const nextIndent = getIndent(nextLine)
        const nextKey = extractKey(nextLine)

        if (nextKey !== null || nextIndent <= indent) {
          break
        }

        entry.lines.push(nextLine)
        index += 1
      }
    }

    entries.push(entry)
  }

  const withoutKey = entries.filter((entry) => entry.key === null)
  const withKey = entries.filter((entry) => entry.key !== null)

  withKey.sort((a, b) => naturalCompare(a.key, b.key))

  return [...withoutKey, ...withKey].flatMap((entry) => entry.lines)
}

function findObjectRange(lines) {
  let objectStart = -1

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const isLangDeclaration = /const lang\s*[:=]/.test(line) && line.includes('{')
    const isDefaultExportObject = /^\s*export default\s*{/.test(line)

    if (isLangDeclaration || isDefaultExportObject) {
      objectStart = index
      break
    }
  }

  if (objectStart === -1) {
    return null
  }

  let braceCount = 0
  let objectEnd = -1

  for (let index = objectStart; index < lines.length; index += 1) {
    const line = lines[index]
    braceCount += (line.match(/{/g) || []).length
    braceCount -= (line.match(/}/g) || []).length

    if (braceCount === 0) {
      objectEnd = index
      break
    }
  }

  if (objectEnd === -1) {
    return null
  }

  return { objectStart, objectEnd }
}

function sortLanguageFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')
  const range = findObjectRange(lines)

  if (!range) {
    console.log(`skip ${path.basename(filePath)}: object definition not found`)
    return
  }

  const beforeObject = lines.slice(0, range.objectStart + 1)
  const objectContent = lines.slice(range.objectStart + 1, range.objectEnd)
  const afterObject = lines.slice(range.objectEnd)
  const sortedLines = [...beforeObject, ...sortObjectContent(objectContent), ...afterObject]

  fs.writeFileSync(filePath, sortedLines.join('\n'), 'utf-8')
  console.log(`sorted ${path.basename(filePath)}`)
}

function main() {
  const files = fs
    .readdirSync(LANG_DIR)
    .filter((fileName) => fileName.endsWith('.ts'))
    .sort()
    .map((fileName) => path.join(LANG_DIR, fileName))

  for (const filePath of files) {
    sortLanguageFile(filePath)
  }
}

main()
