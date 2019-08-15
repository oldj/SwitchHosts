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
  res.send('Hello SwitchHosts!')
})

app.get('/remote-test', function (req, res) {
  res.send(`# remote-test\n# ${(new Date()).toString()}`)
})

app.use('/api', require('./api/index'))

app.listen(PORT, '127.0.0.1', function () {
  console.log(`SwitchHosts! HTTP server is listening on port ${PORT}!`)
  console.log(`-> http://127.0.0.1:${PORT}`)
})

module.exports = app
