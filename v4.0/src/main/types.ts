/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import * as actions from './actions'

export type Actions = typeof actions

export interface ActionData {
  action: keyof Actions;
  data?: any;
  callback: string;
}

