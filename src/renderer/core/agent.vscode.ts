import { ThemeType } from '@common/default_configs'
import { IPopupMenuOption } from '@common/types'

import {
  detectPlatform,
  IAgent,
  makeActions,
  resolveCommandName,
  unwrap,
  type AgentHandler,
} from './agent.shared'

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void
}

interface VsCodeApi {
  postMessage(message: unknown): void
}

function getVsCodeApi(): VsCodeApi {
  const w = window as Window & { __vscodeApi?: VsCodeApi }
  if (!w.__vscodeApi) {
    w.__vscodeApi = acquireVsCodeApi()
  }
  return w.__vscodeApi
}

let invokeSeq = 0
const pendingInvokes = new Map<
  number,
  { resolve: (v: unknown) => void; reject: (e: Error) => void }
>()

function setupMessageBridge() {
  const w = window as Window & { __vscodeBridgeReady?: boolean }
  if (w.__vscodeBridgeReady) return
  w.__vscodeBridgeReady = true

  window.addEventListener('message', (event) => {
    const msg = event.data
    if (!msg || typeof msg !== 'object') return

    if (msg.type === 'invokeResult' && typeof msg.id === 'number') {
      const pending = pendingInvokes.get(msg.id)
      if (!pending) return
      pendingInvokes.delete(msg.id)
      if (msg.error) {
        pending.reject(new Error(String(msg.error)))
      } else {
        pending.resolve(msg.result)
      }
      return
    }

    if (msg.type === 'menuClick' && typeof msg.evt === 'string') {
      dispatchLocal(msg.evt, [])
      return
    }

    if (msg.type === 'menuClose' && typeof msg.menu_id === 'string') {
      dispatchLocal(`popup_menu_close:${msg.menu_id}`, [])
    }
  })
}

const listeners = new Map<string, Set<AgentHandler>>()

function dispatchLocal(channel: string, args: unknown[]) {
  const payload = { _args: args }
  const handlers = listeners.get(channel)
  if (!handlers) return
  const snapshot = [...handlers]
  for (const handler of snapshot) {
    handler(...unwrap(payload))
  }
}

function makeVsCodeAgent(): IAgent {
  setupMessageBridge()
  const api = getVsCodeApi()

  const on: IAgent['on'] = (channel, handler) => {
    let set = listeners.get(channel)
    if (!set) {
      set = new Set()
      listeners.set(channel, set)
    }
    set.add(handler)
    return () => set!.delete(handler)
  }

  const off: IAgent['off'] = (channel, handler) => {
    listeners.get(channel)?.delete(handler)
  }

  return {
    call: async (action, ...params) => {
      const cmd = resolveCommandName(action)
      if (cmd === 'find_show') {
        window.location.hash = '#/find'
        return null
      }
      const id = ++invokeSeq
      return await new Promise((resolve, reject) => {
        pendingInvokes.set(id, { resolve, reject })
        api.postMessage({ type: 'invoke', id, cmd, args: params })
      })
    },

    broadcast: async (channel, ...args) => {
      dispatchLocal(channel, args)
    },

    on,
    off,

    once: (channel, handler) => {
      const wrapper: AgentHandler = (...args) => {
        off(channel, wrapper)
        handler(...args)
      }
      return on(channel, wrapper)
    },

    popupMenu: async (options) => {
      api.postMessage({
        type: 'popupMenu',
        menu_id: options.menu_id,
        items: options.items,
      })
    },

    darkModeToggle: async (_theme: ThemeType) => {
      // VS Code theme is applied via CSS variables on body.
    },

    platform: detectPlatform(),
  }
}

export const agent: IAgent = makeVsCodeAgent()
export const actions = makeActions(agent)
