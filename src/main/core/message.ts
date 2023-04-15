/**
 * message
 * @author: oldj
 * @homepage: https://oldj.net
 */

import * as actions from '@main/actions'
import { ActionData } from '@main/types'
import { ipcMain } from 'electron'
import { EventEmitter } from 'events'
import { IActionFunc } from '@common/types'

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
  ee.emit(d.event, ...d.args)

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

function sendBack(sender: any, event_name: string, data: [any] | [any, any]) {
  try {
    sender.send(event_name, ...data)
  } catch (e) {
    console.error(e)
  }
}

ipcMain.on('x_action', async (e, action_data: ActionData) => {
  let sender = e.sender
  let { action, data, callback } = action_data

  let fn = actions[action]
  if (typeof fn === 'function') {
    let params = data || []
    if (!Array.isArray(params)) {
      params = [params]
    }

    try {
      let obj: IActionFunc = { sender }
      // @ts-ignore
      let v = await fn.call(obj, ...params)
      sendBack(sender, callback, [null, v])
    } catch (e) {
      console.error(e)
      sendBack(sender, callback, [e])
    }
  } else {
    let e = `unknow action [${action}].`
    console.error(e)
    sendBack(sender, callback, [e])
  }
})

export const on = (event: string, handler: (...args: any[]) => void) => {
  ee.on(event, (d, ...args) => {
    handler(d, ...args)
  })
}
