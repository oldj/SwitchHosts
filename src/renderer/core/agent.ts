/**
 * @author: oldj
 * @homepage: https://oldj.net
 *
 * Tauri 2 agent — routes all renderer↔backend communication through
 * Tauri invoke/event APIs.
 */

import { invoke } from '@tauri-apps/api/core'
import { emit, listen, once as tauriOnce, type UnlistenFn } from '@tauri-apps/api/event'
import { Actions } from '@common/types'

type AgentHandler = (...args: any[]) => void
type AgentOff = () => void

export interface IAgent {
  call: (action: string, ...params: any[]) => Promise<any>
  broadcast: (channel: string, ...args: any[]) => Promise<void> | void
  on: (channel: string, handler: AgentHandler) => AgentOff
  once: (channel: string, handler: AgentHandler) => AgentOff
  off: (channel: string, handler: AgentHandler) => void
  popupMenu: (options: any) => Promise<void> | void
  darkModeToggle: (theme: any) => Promise<void>
  platform: string
}

// ---- legacy name mapping ---------------------------------------------------

// Electron action names that v5 renames to a different Rust command.
// Unmapped names are converted to snake_case verbatim.
const LEGACY_TO_NEW: Record<string, string> = {
  getBasicData: 'get_basic_data',
  getList: 'get_list',
  getItemFromList: 'get_item_from_list',
  getContentOfList: 'get_content_of_list',
  getTrashcanList: 'get_trashcan_list',
  setList: 'set_list',
  moveToTrashcan: 'move_to_trashcan',
  moveManyToTrashcan: 'move_many_to_trashcan',
  clearTrashcan: 'clear_trashcan',
  deleteItemFromTrashcan: 'delete_item_from_trashcan',
  restoreItemFromTrashcan: 'restore_item_from_trashcan',

  getHostsContent: 'get_hosts_content',
  setHostsContent: 'set_hosts_content',
  getSystemHosts: 'get_system_hosts',
  getPathOfSystemHosts: 'get_path_of_system_hosts',
  // Semantic rename: Electron "setSystemHosts" took raw content; v5 takes
  // selection ids and aggregates inside hosts_apply.
  setSystemHosts: 'apply_hosts_selection',
  refreshHosts: 'refresh_remote_hosts',
  getHistoryList: 'get_apply_history',
  deleteHistory: 'delete_apply_history_item',

  cmdGetHistoryList: 'cmd_get_history_list',
  cmdDeleteHistory: 'cmd_delete_history_item',
  cmdClearHistory: 'cmd_clear_history',
  cmdFocusMainWindow: 'focus_main_window',

  findShow: 'find_show',
  findBy: 'find_by',
  findAddHistory: 'find_add_history',
  findGetHistory: 'find_get_history',
  findSetHistory: 'find_set_history',
  findAddReplaceHistory: 'find_add_replace_history',
  findGetReplaceHistory: 'find_get_replace_history',
  findSetReplaceHistory: 'find_set_replace_history',

  exportData: 'export_data',
  importData: 'import_data',
  importDataFromUrl: 'import_data_from_url',
  migrateCheck: 'migration_status',

  checkUpdate: 'check_update',
  downloadUpdate: 'download_update',
  installUpdate: 'install_update',

  openUrl: 'open_url',
  showItemInFolder: 'show_item_in_folder',
  updateTrayTitle: 'update_tray_title',
  closeMainWindow: 'hide_main_window',
  quit: 'quit_app',

  configGet: 'config_get',
  configSet: 'config_set',
  configAll: 'config_all',
  configUpdate: 'config_update',

  getDataDir: 'get_data_dir',
  ping: 'ping',
}

// Actions removed in v5. Calling them fails loudly so stray call sites don't
// silently no-op during migration.
const REMOVED = new Set<string>([
  'getDefaultDataDir',
  'cmdChangeDataDir',
  'cmdToggleDevTools',
  // migrateData is triggered internally by the Rust startup flow in v5 and is
  // no longer a renderer-invocable action.
  'migrateData',
])

function snakeCase(s: string): string {
  return s.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')
}

function resolveCommandName(action: string): string {
  if (REMOVED.has(action)) {
    throw new Error(
      `[v5] action "${action}" was removed in the Tauri migration`,
    )
  }
  return LEGACY_TO_NEW[action] ?? snakeCase(action)
}

// ---- tauri agent factory ---------------------------------------------------

function detectPlatform(): string {
  // Dev override: VITE_PLATFORM=darwin|win32|linux at startup forces the
  // renderer to render the platform-specific layout regardless of the real OS.
  // Useful for previewing Windows / Linux UI while developing on macOS.
  const override = import.meta.env.VITE_PLATFORM
  if (override === 'darwin' || override === 'win32' || override === 'linux') {
    return override
  }
  if (typeof navigator === 'undefined') return 'linux'
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('mac')) return 'darwin'
  if (ua.includes('win')) return 'win32'
  return 'linux'
}

// Broadcast/listen wire format. Every emission is wrapped in an envelope so
// there is no ambiguity between "one argument that happens to be an array"
// and "multiple positional arguments". Both .broadcast() and .on()/.once()
// on the Tauri side agree on this shape; the Electron path keeps its own
// IPC conventions untouched.
interface BroadcastEnvelope {
  _args: unknown[]
}

function unwrap(payload: unknown): unknown[] {
  if (payload && typeof payload === 'object' && '_args' in (payload as object)) {
    const xs = (payload as BroadcastEnvelope)._args
    return Array.isArray(xs) ? xs : []
  }
  // Defensive fallback for payloads emitted outside this adapter
  // (e.g. a Rust-side emit that doesn't wrap). Treat the raw payload as
  // a single positional argument.
  return [payload]
}

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

// ---- export ----------------------------------------------------------------

export const agent: IAgent = makeTauriAgent()

export const actions: Actions = new Proxy(
  {},
  {
    get(_obj, key: keyof Actions) {
      return (...params: any[]) => agent.call(String(key), ...params)
    },
  },
) as Actions
