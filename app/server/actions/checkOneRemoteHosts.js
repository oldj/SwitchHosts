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
const crypto = require('crypto')

function now () {
  return moment().format('YYYY-MM-DD HH:mm:ss')
}

function makeCloudData (host, data) {
  data = JSON.parse(data)
  let obj = {};
  data = data.reduce((prevArr, currentItem) => {
    obj[currentItem.title] ? '' : obj[currentItem.title] = true && prevArr.push(currentItem);
    return prevArr;
  }, [])

  if (!data instanceof Array) {
    return host
  }

  const childMap = new Map()
  host.children.forEach(item => {
    childMap.set(makeMd5(item.title, item.content), item)
  })

  host.children = []
  data.forEach(item => {
    let child
    const content = makeContent(item.description, item.rules)
    const md5 = makeMd5(item.title, content)
    if (childMap.get(md5) !== undefined) {
      child = childMap.get(md5)
    } else {
      const id = makeId()
      child = {
        id,
        "title": item.title,
        "content": lineBreakTransform(content),
        "on": false,
        "where": "cloud-local",
        "folder_mode": 0,
        "last_refresh": null,
        "refresh_interval": 0,
        "include": [],
        "children": []
      }
    }
    host.children.push(child)
  })
  host.last_refresh = now()
  return host
}

function makeContent (description, rules) {
  let content = "# " + description + "\n"
  rules.forEach(item => {
    content = content + item.ip + "    " + item.host + "\n"
  })
  return content
}

function makeMd5 (title, content) {
  const md5key = title + content
  return crypto.createHash('md5').update(md5key).digest('hex')
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
