import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.normalize(path.join(__dirname, '..'))
const distDir = path.normalize(path.join(__dirname, '..', 'dist'))

const APP_NAME = 'SwitchHosts'

const electronLanguages = ['en', 'fr', 'zh_CN', 'de', 'ja', 'tr', 'ko']

export { APP_NAME, distDir, electronLanguages, rootDir }
