/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

const getUserHosts = require('../../actions/getUserHosts')
const saveHosts = require('../../actions/saveHosts')
const getPref = require('../../actions/getPref')
const notify = require('../../actions/notify')
const getLang = require('../../actions/getLang')
const svr = require('../../svr')

module.exports = (req, res) => {
  let id = req.param('id')
  let is_single
  let lang

  getPref()
    .then(pref => {
      is_single = pref.choice_mode === 'single'
      let user_language = pref.user_language
      return getLang(svr, user_language)
    })
    .then(v => lang = v)
    .then(() => getUserHosts())
    .then(list => {
      let item = list.find(i => i.id === id)
      if (!item) {
        res.end('not-found:' + id)
        return
      }

      item.on = !item.on

      if (item.on && is_single) {
        // 单选模式
        list.map(i => {
          if (i.id !== id) {
            i.on = false
          }
        })
      }

      saveHosts(svr, list)
        .then(() => {
          notify(svr, 'SwitchHosts!', lang.hosts_switched)
          svr.broadcast('reload')
          res.end('toggle:' + id)
        })
    })
    .catch(e => {
      res.end(e.toString())
    })
}
