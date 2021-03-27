/**
 * webpack_up_version.js
 */

'use strict'

const updateVersion = require('./updateVersion')
const STEP = 0.1

class UpVersionWebpackPlugin {
  constructor (options) {
    this.options = options
    this._score = -1
  }

  apply (compiler) {
    compiler.plugin('compile', () => {
      if (this._score >= 0 && this._score < 1) {
        // 防止更新太频繁
        this._score += STEP
        return
      }

      console.log('~~~~~~~~~~~~~~~~~~~~~~ update version ~~~~~~~~~~~~~~~~~~~~~~')
      let {fn, packages} = this.options
      updateVersion(fn, packages)
      this._score = 0
    })
  }
}

module.exports = UpVersionWebpackPlugin
