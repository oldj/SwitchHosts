/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const getUrl = require('./getUrl')
const isExpired = require('../checkIsExpired')
const lineBreakTransform = require('../../libs/lineBreakTransform')
const moment = require('moment')

function now() {
  return moment().format('YYYY-MM-DD HH:mm:ss')
}

const checkChildren = async (svr, children, force_id) => {
  let new_children = []

  for (let i of children) {
    if (typeof i === 'object') {
      new_children.push(await checkOne(svr, i, force_id))
    }
  }

  return new_children
}

const checkOne = async (svr, hosts, force_id = null) => {
  let force = hosts.id === force_id

  if (Array.isArray(hosts.children) && hosts.children.length > 0) {
    hosts.children = await checkChildren(svr, hosts.children, force_id)
  }

  if (hosts.where !== 'remote' || !hosts.url) {
    return hosts
  }

  if (force || isExpired(svr, hosts)) {
    let hosts2 = Object.assign({}, hosts)
    console.log('checkRemote', `'${hosts2.title}'`, force, isExpired(svr, hosts2))

    try {
      let content = await getUrl(svr, hosts2.url)
      hosts2.content = lineBreakTransform(content)
      hosts2.last_refresh = now()
    } catch (e) {
      console.error(e)
    }

    return hosts2
  }

  return hosts
}

module.exports = checkOne
