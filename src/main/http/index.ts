/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { http_api_port } from '@root/common/constants'
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

export const start = (): boolean => {
  try {
    server = app.listen(http_api_port, '127.0.0.1', function () {
      console.log(
        `SwitchHosts HTTP server is listening on port ${http_api_port}!`,
      )
      console.log(`-> http://127.0.0.1:${http_api_port}`)
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
