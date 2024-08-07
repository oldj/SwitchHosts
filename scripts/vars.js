const path = require('path')

const root_dir = path.normalize(path.join(__dirname, '..'))
const dist_dir = path.normalize(path.join(__dirname, '..', 'dist'))

const APP_NAME = 'SwitchHosts'

const electronLanguages = ['en', 'fr', 'zh_CN', 'de', 'ja', 'tr', 'ko']

module.exports = {
  APP_NAME,
  root_dir,
  dist_dir,
  electronLanguages,
}
