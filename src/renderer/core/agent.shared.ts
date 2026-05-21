import { ThemeType } from '@common/default_configs'
import { Actions, IPopupMenuOption } from '@common/types'

export type AgentHandler = (...args: any[]) => void
export type AgentOff = () => void

export interface IAgent {
  call: (action: string, ...params: any[]) => Promise<any>
  broadcast: (channel: string, ...args: any[]) => Promise<void> | void
  on: (channel: string, handler: AgentHandler) => AgentOff
  once: (channel: string, handler: AgentHandler) => AgentOff
  off: (channel: string, handler: AgentHandler) => void
  popupMenu: (options: IPopupMenuOption) => Promise<void> | void
  darkModeToggle: (theme: ThemeType) => Promise<void>
  platform: string
}

export const LEGACY_TO_NEW: Record<string, string> = {
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
  findReplaceOne: 'find_replace_one',
  findReplaceAll: 'find_replace_all',
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

const REMOVED = new Set<string>([
  'getDefaultDataDir',
  'cmdChangeDataDir',
  'cmdToggleDevTools',
  'migrateData',
])

function snakeCase(s: string): string {
  return s.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')
}

export function resolveCommandName(action: string): string {
  if (REMOVED.has(action)) {
    throw new Error(`[v5] action "${action}" was removed in the Tauri migration`)
  }
  return LEGACY_TO_NEW[action] ?? snakeCase(action)
}

export function detectPlatform(): string {
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

export interface BroadcastEnvelope {
  _args: unknown[]
}

export function unwrap(payload: unknown): unknown[] {
  if (payload && typeof payload === 'object' && '_args' in (payload as object)) {
    const xs = (payload as BroadcastEnvelope)._args
    return Array.isArray(xs) ? xs : []
  }
  return [payload]
}

export function makeActions(agent: IAgent): Actions {
  return new Proxy(
    {},
    {
      get(_obj, key: keyof Actions) {
        return (...params: any[]) => agent.call(String(key), ...params)
      },
    },
  ) as Actions
}
