/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const {PORT} = require('../../configs')
const express = require('express')
const app = express()

app.get('/', function (req, res) {
  res.send('Hello SwitchHost!')
})

app.get('/remote-test', function (req, res) {
  res.send(`# remote-test\n# ${(new Date()).toString()}`)
})

app.listen(PORT, function () {
  console.log(`SwitchHosts! HTTP server listening on port ${PORT}!`)
})

module.exports = app
