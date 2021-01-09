/**
 * preload
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { contextBridge, ipcRenderer } from 'electron'
import { Actions } from '@main/types'

let x_get_idx = 0

const reg = (name: string) => {
  ipcRenderer.send('reg', { name })
}

const callAction = (action: keyof Actions, ...params: any[]) => {
  const callback = ['_cb', (new Date()).getTime(), x_get_idx++].join('_')

  return new Promise((resolve, reject) => {
    ipcRenderer.send('x_action', {
      action,
      data: params,
      callback,
    })

    ipcRenderer.once(callback, (sender, err, d) => {
      if (err) {
        reject(err)
      } else {
        resolve(d)
      }
    })
  })
}

const _agent = {
  reg,
  call: callAction,
}

contextBridge.exposeInMainWorld('_agent', _agent)

declare global {
  interface Window {
    _agent: typeof _agent;
  }
}
