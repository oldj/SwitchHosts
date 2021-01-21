/**
 * agent
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ActionData } from '@main/types'
import { ipcMain } from 'electron'
import * as actions from '@main/actions'

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
      // @ts-ignore
      let v = await fn(...params)
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
