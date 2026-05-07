/**
 * types
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { HostsType } from '@common/data'
import { default as lang } from './i18n/languages/en'

export type LanguageDict = typeof lang
export type LanguageKey = keyof LanguageDict

export type Actions = Record<string, (...args: any[]) => Promise<any>>

export interface IMenuItemOption {
  label?: string
  type?: 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio'
  enabled?: boolean
  checked?: boolean
  click?: (...args: any[]) => void
  _click_evt?: string
}

export interface IPopupMenuOption {
  menu_id: string
  items: IMenuItemOption[]
}

export interface IFindPosition {
  start: number
  end: number
  line: number
  line_pos: number
  end_line: number
  end_line_pos: number
  before: string
  match: string
  after: string
}

export interface IFindSplitter {
  before: string
  match: string
  after: string
  replace?: string
}

export interface IFindItem {
  item_id: string
  item_title: string
  item_type: HostsType
  positions: IFindPosition[]
  splitters: IFindSplitter[]
}

export type IFindShowSourceParam = IFindPosition & {
  item_id: string
  [key: string]: any
}
