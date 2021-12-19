/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import Tracer from '@main/libs/tracer'
import { LocaleName } from '@root/common/i18n'
import SwhDb from 'potdb'
import { BrowserWindow } from 'electron'
import * as actions from './actions'

export type Actions = typeof actions

export interface ActionData {
  action: keyof Actions
  data?: any
  callback: string
}

export interface IHostsWriteOptions {
  sudo_pswd?: string
}

declare global {
  var data_dir: string | undefined
  var swhdb: SwhDb
  var cfgdb: SwhDb
  var localdb: SwhDb
  var ua: string // user agent
  var session_id: string // A random value, refreshed every time the app starts, used to identify different startup sessions.
  var main_win: BrowserWindow
  var find_win: BrowserWindow | null
  var last_path: string // the last path opened by SwitchHosts
  var tracer: Tracer
  var is_will_quit: boolean
  var system_locale: LocaleName
}
