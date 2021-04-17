/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import Tracer from '@main/libs/tracer'
import SwhDb from 'potdb'
import { BrowserWindow } from 'electron'
import * as actions from './actions'

export type Actions = typeof actions

export interface ActionData {
  action: keyof Actions;
  data?: any;
  callback: string;
}

export interface IHostsWriteOptions {
  sudo_pswd?: string;
}

declare global {
  namespace NodeJS {
    interface Global {
      db_dir?: string;
      swhdb: SwhDb;
      cfgdb: SwhDb;
      ua: string; // user agent
      session_id: string; // A random value, refreshed every time the app starts, used to identify different startup sessions.
      main_win: BrowserWindow;
      last_path?: string; // the last path opened by SwitchHosts
      tracer: Tracer;
    }
  }
}
