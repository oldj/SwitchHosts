/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { http_api_port } from '@common/constants'
import express from 'express'
import { Server } from 'http'
import api_router from './api/index'

const app = express()

app.use((req, res, next) => {
  console.log(
    `> "${new Date().toString()}"`,
    req.method,
    req.originalUrl,
    `"${req.headers['user-agent']}"`,
  )
  next()
})

app.get('/', (req, res) => {
  res.send('Hello SwitchHosts!')
})

app.get('/remote-test', (req, res) => {
  res.send(`# remote-test\n# ${new Date().toString()}`)
})

app.use('/api', api_router)

let server: Server

export const start = (http_api_only_local: boolean): boolean => {
  try {
    let listenIp = http_api_only_local ? '127.0.0.1' : '0.0.0.0'
    server = app.listen(http_api_port, listenIp, function () {
      console.log(`SwitchHosts HTTP server is listening on port ${http_api_port}!`)
      console.log(`-> http://${listenIp}:${http_api_port}`)
    })
  } catch (e) {
    console.error(e)
    return false
  }

  return true
}

export const stop = () => {
  if (!server) return

  try {
    server.close()
  } catch (e) {
    console.error(e)
  }
}
