/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const {PORT} = require('../../configs')
const express = require('express')
const app = express()

app.use(function (req, res, next) {
  console.log(`> "${(new Date()).toString()}"`, req.method, req.originalUrl, `"${req.headers['user-agent']}"`)
  next()
})

app.get('/', function (req, res) {
  res.send('Hello SwitchHost!')
})

app.get('/remote-test', function (req, res) {
  res.send(`# remote-test\n# ${(new Date()).toString()}`)
})

app.use('/api', require('./api/index'))

app.listen(PORT, function () {
  console.log(`SwitchHosts! HTTP server listening on port ${PORT}!`)
})

module.exports = app
