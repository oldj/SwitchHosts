/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import SwhDb from '@main/utils/db'
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
      swhdb: SwhDb;
    }
  }
}
