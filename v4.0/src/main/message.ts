/**
 * message
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ipcMain } from 'electron'
import { EventEmitter } from 'events'

const ee = new EventEmitter()
const registered_clients: { [key: string]: any } = {}

let i_reg_idx = 0
ipcMain.on('x_reg', (e, d) => {
  i_reg_idx++
  let name = d?.name || i_reg_idx.toString()
  registered_clients[name] = e.sender
})

ipcMain.on('x_unreg', (e, d) => {
  let name: string | undefined = d?.name

  if (name === '*') {
    for (let k in registered_clients) {
      if (registered_clients.hasOwnProperty(k)) {
        delete registered_clients[k]
      }
    }

  } else if (name) {
    delete registered_clients[name]

  } else {
    for (let k in registered_clients) {
      if (registered_clients.hasOwnProperty(k) && registered_clients[k] === e.sender) {
        delete registered_clients[k]
        break
      }
    }
  }
})

ipcMain.on('x_broadcast', (e, d) => {
  // 广播给内部
  ee.emit(d.event, d.data)

  // 广播给 renderer
  for (let k in registered_clients) {
    if (registered_clients.hasOwnProperty(k)) {
      try {
        registered_clients[k].send('y_broadcast', d)
      } catch (e) {
        console.error(e)
      }
    }
  }
})

export const on = (event: string, handler: (...args: any[]) => void) => {
  ee.on(event, (d, ...args) => {
    handler(d, ...args)
  })
}
