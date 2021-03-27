/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const {test} = require('ava');
const getUrl = require('../app/server/actions/getUrl')

test('getUrl', async t => {
  let v = await getUrl(null, 'http://127.0.0.1:50761/remote-test')
  //console.log(v)
  t.is(typeof v, 'string')
  t.is(v.substr(0, 1), '#')
})
