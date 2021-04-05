/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import express from 'express'
import { http_api_port } from '@root/common/constants'
import api_router from './api/index'

export const server = express()

server.use((req, res, next) => {
  console.log(`> "${(new Date()).toString()}"`, req.method, req.originalUrl, `"${req.headers['user-agent']}"`)
  next()
})

server.get('/', (req, res) => {
  res.send('Hello SwitchHosts!')
})

server.get('/remote-test', (req, res) => {
  res.send(`# remote-test\n# ${(new Date()).toString()}`)
})

server.use('/api', api_router)

try {
  server.listen(http_api_port, '127.0.0.1', function () {
    console.log(`SwitchHosts HTTP server is listening on port ${http_api_port}!`)
    console.log(`-> http://127.0.0.1:${http_api_port}`)
  })
} catch (e) {
  console.error(e)
}
