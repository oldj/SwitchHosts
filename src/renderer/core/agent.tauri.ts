import { invoke } from '@tauri-apps/api/core'
import { emit, listen, once as tauriOnce, type UnlistenFn } from '@tauri-apps/api/event'
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

function makeTauriAgent(): IAgent {
  const listenerRegistry = new Map<string, Map<AgentHandler, Promise<UnlistenFn>>>()

  const on: IAgent['on'] = (channel, handler) => {
    const unlistenPromise = listen(channel, (event) => {
      handler(...unwrap(event.payload))
    })
    let channelMap = listenerRegistry.get(channel)
    if (!channelMap) {
      channelMap = new Map()
      listenerRegistry.set(channel, channelMap)
    }
    channelMap.set(handler, unlistenPromise)
    return () => {
      unlistenPromise.then((un) => un()).catch(() => {})
      channelMap!.delete(handler)
    }
  }

  const off: IAgent['off'] = (channel, handler) => {
    const channelMap = listenerRegistry.get(channel)
    const unlistenPromise = channelMap?.get(handler)
    if (unlistenPromise) {
      unlistenPromise.then((un) => un()).catch(() => {})
      channelMap!.delete(handler)
    }
  }

  return {
    call: async (action, ...params) => {
      const cmd = resolveCommandName(action)
      return await invoke(cmd, { args: params })
    },

    broadcast: async (channel, ...args) => {
      const envelope: BroadcastEnvelope = { _args: args }
      await emit(channel, envelope)
    },

    on,
    off,

    once: (channel, handler) => {
      const unlistenPromise = tauriOnce(channel, (event) => {
        handler(...unwrap(event.payload))
      })
      return () => {
        unlistenPromise.then((un) => un()).catch(() => {})
      }
    },

    popupMenu: async (options) => {
      // The renderer's PopupMenu helper pre-registers `agent.once(_click_evt, ...)`
      // listeners for each item before calling us, and expects a matching
      // `popup_menu_close:<menu_id>` event once the menu dismisses. The Rust
      // `popup_menu` command builds a native context menu from the same spec,
      // shows it at the cursor, emits the click events via the global
      // on_menu_event handler in lib.rs, then emits the close signal after
      // dismissal.
      await invoke('popup_menu', { args: [options] })
    },

    darkModeToggle: async (theme) => {
      await invoke('dark_mode_toggle', { args: [theme] })
    },

    platform: detectPlatform(),
  }
}

export const agent: IAgent = makeTauriAgent()

export const actions = makeActions(agent)
