/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import SwhDb from '@main/libs/db'
import * as actions from './actions'

export type Actions = typeof actions

export interface ActionData {
  action: keyof Actions;
  data?: any;
  callback: string;
}

declare global {
  namespace NodeJS {
    interface Global {
      swhdb: SwhDb;
    }
  }
}
