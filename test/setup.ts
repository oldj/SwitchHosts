import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const tmpDir = path.join(testDir, 'tmp')
const testHomeDir = path.join(tmpDir, 'home')

fs.rmSync(tmpDir, { force: true, recursive: true })
fs.mkdirSync(testHomeDir, { recursive: true })

process.env.HOME = testHomeDir
process.env.USERPROFILE = testHomeDir
