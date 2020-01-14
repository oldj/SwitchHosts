/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

const request = require('request')
const cheerio = require('cheerio')
const {shell, dialog} = require('electron')
const current_version = require('../version')
const m_lang = require('../server/lang')
const lang = m_lang.getLang(global.user_language)
const svr = require('./svr')
const formatVersion = require('../libs/formatVersion')

function convertStrVersion (v) {
  let a = v.match(/\d+/g)
  return a.map(i => parseInt(i))
}

function compareVersion (a, b) {
  if (typeof a === 'string') {
    a = convertStrVersion(a)
  }
  if (typeof b === 'string') {
    b = convertStrVersion(b)
  }

  let len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    let ai = a[i]
    let bi = b[i]

    if (typeof ai === 'number' && typeof bi === 'number') {
      if (ai === bi) {
        continue
      }

      return ai - bi
    }

    if (typeof ai === 'number' && typeof bi !== 'number') {
      return 1
    }
    if (typeof ai !== 'number' && typeof bi === 'number') {
      return -1
    }
    return 0
  }
}

exports.check = (is_silent = false) => {
  let release_url = require('../configs').url_download
  console.log('start check updates..')

  request(release_url, async (err, res, body) => {
    let buttons = [lang.ok]
    if (err) {
      console.log(err)

      if (!is_silent) {
        await dialog.showMessageBox({
          type: 'error',
          message: lang.check_update_err,
          buttons
        })
      }
      return
    }

    //let body = res.text

    let $ = cheerio.load(body)
    let a = $('.release-entry .css-truncate-target')
    if (a.length <= 0) {
      console.log('did not find any versions!')
      return
    }
    let last_v = $(a[0]).text()
    // Array.from(a).map(i => {
    //     console.log($(i).text());
    // });

    let cmp = compareVersion(current_version, last_v)
    console.log('cmp', cmp)
    let message
    if (cmp >= 0) {
      // 没有发现新版本
      message = m_lang.fill(lang.check_update_nofound, formatVersion(current_version))

    } else {
      // 发现新版本
      message = m_lang.fill(lang.check_update_found, last_v)
      buttons.unshift(lang.cancel)
      svr.broadcast('update_found', last_v)
    }

    if (!is_silent) {
      let {response} = await dialog.showMessageBox({
        type: 'info',
        message,
        buttons
      })
      if (cmp < 0 && response === 1) {
        await shell.openExternal(release_url)
      }
    }
  })
}
