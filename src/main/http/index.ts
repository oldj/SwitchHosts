/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { http_api_port } from '@common/constants'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import api_router from './api/index'

export const app = new Hono()

export const requestLogger = async (c: Context, next: Next) => {
  const url = new URL(c.req.url)

  console.log(
    `> "${new Date().toString()}"`,
    c.req.method,
    `${url.pathname}${url.search}`,
    `"${c.req.header('user-agent')}"`,
  )
  await next()
}

export const homeHandler = (c: Context) => c.text('Hello SwitchHosts!')

export const remoteTestHandler = (c: Context) => c.text(`# remote-test\n# ${new Date().toString()}`)

app.use('*', requestLogger)

app.get('/', homeHandler)

app.get('/remote-test', remoteTestHandler)

app.route('/api', api_router)

let server: ReturnType<typeof serve> | undefined

export const start = (http_api_only_local: boolean): boolean => {
  try {
    let listenIp = http_api_only_local ? '127.0.0.1' : '0.0.0.0'
    server = serve(
      {
        fetch: app.fetch,
        port: http_api_port,
        hostname: listenIp,
      },
      () => {
        console.log(`SwitchHosts HTTP server is listening on port ${http_api_port}!`)
        console.log(`-> http://${listenIp}:${http_api_port}`)
      },
    )
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
    server = undefined
  } catch (e) {
    console.error(e)
  }
}
