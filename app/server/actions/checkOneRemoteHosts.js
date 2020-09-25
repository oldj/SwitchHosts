/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const makeId = require('../../libs/make-id')
const getUrl = require('./getUrl')
const isExpired = require('../checkIsExpired')
const lineBreakTransform = require('../../libs/lineBreakTransform')
const moment = require('moment')

function now() {
  return moment().format('YYYY-MM-DD HH:mm:ss')
}

function makeCloudData(host, data) {
  data = JSON.parse(data)
  if (!data instanceof Array) {
    return host
  }
  host.children = []
  data.forEach(item => {
    const id = makeId()
    const child = {
      id,
      "title": item.title,
      "content": lineBreakTransform(makeContent(item.description, item.rules)),
      "on": false,
      "where": "local-cloud",
      "folder_mode": 0,
      "last_refresh": null,
      "refresh_interval": 0,
      "include": [],
      "children": []
    }
    host.last_refresh = now()
    host.children.push(child)
  })
  return host
}

function makeContent(description, rules) {
  let content = "# " + description + "\n"
  rules.forEach(item => {
    content = content + item.ip + "\xa0\xa0\xa0" + item.host + "\n"
  })
  return content
}

module.exports = (svr, hosts, force = false) => {
  return new Promise((resolve, reject) => {
    if ((hosts.where !== 'remote' && hosts.where !== 'cloud') || !hosts.url) {
      resolve(hosts)
      return
    }

    if (force || isExpired(svr, hosts)) {
      let hosts2 = Object.assign({}, hosts)

      console.log('checkRemote', `'${hosts2.title}'`, force, isExpired(svr, hosts2))
      getUrl(svr, hosts2.url)
        .then(content => {
          if (hosts.where === 'cloud') {
            hosts2 = makeCloudData(hosts2, content)
          } else {
            hosts2.content = lineBreakTransform(content)
            hosts2.last_refresh = now()
          }
        })
        .then(() => resolve(hosts2))
        .catch(e => {
          console.log(e)
          reject(e)
        })
    } else {
      resolve(hosts)
    }
  })
}
