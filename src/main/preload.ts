/**
 * preload
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { Actions } from '@common/types'
import { IPopupMenuOption } from '@common/types'
import { contextBridge, ipcRenderer } from 'electron'
import { EventEmitter } from 'events'

declare global {
  interface Window {
    _agent: typeof _agent
  }
}

export type EventHandler = (...args: any[]) => void

const ee = new EventEmitter()

let x_get_idx = 0

const callAction = (action: keyof Actions, ...params: any[]) => {
  const callback = ['_cb', new Date().getTime(), x_get_idx++].join('_')

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

const broadcast = <T>(event: string, ...args: any) => {
  // 广播消息给所有 render 窗口
  ipcRenderer.send('x_broadcast', { event, args })
}

const on = (event: string, handler: EventHandler) => {
  // console.log(`on [${event}]`)
  ee.on(event, handler)
  return () => off(event, handler)
}

const once = (event: string, handler: EventHandler) => {
  // console.log(`once [${event}]`)
  ee.once(event, handler)
  return () => off(event, handler)
}

const off = (event: string, handler: EventHandler) => {
  // console.log(`off [${event}]`)
  ee.off(event, handler)
}

const popupMenu = (options: IPopupMenuOption) => {
  ipcRenderer.send('x_popup_menu', options)
}

ipcRenderer.on('y_broadcast', (e, d) => {
  // 接收其他（包括当前） render 窗口广播的消息
  ee.emit(d.event, ...d.args)
})

ipcRenderer.send('x_reg')

// 窗口销毁时 unreg
window.addEventListener('beforeunload', () => {
  ipcRenderer.send('x_unreg')
})

const _agent = {
  call: callAction,
  broadcast,
  on,
  once,
  off,
  popupMenu,
  platform: process.platform,
  darkModeToggle: (theme?: 'dark' | 'light' | 'system') =>
    ipcRenderer.invoke(`dark-mode:${theme ?? 'toggle'}`),
}

contextBridge.exposeInMainWorld('_agent', _agent)
