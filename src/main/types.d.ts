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
  namespace NodeJS {
    interface Global {
      db_dir?: string
      swhdb: SwhDb
      cfgdb: SwhDb
      localdb: SwhDb
      ua: string // user agent
      session_id: string // A random value, refreshed every time the app starts, used to identify different startup sessions.
      main_win: BrowserWindow
      find_win?: BrowserWindow | null
      last_path?: string // the last path opened by SwitchHosts
      tracer: Tracer
      is_will_quit?: boolean
      system_locale?: LocaleName
    }
  }
}
