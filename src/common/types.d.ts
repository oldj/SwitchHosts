/**
 * types
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { HostsType } from '@root/common/data'
import { MenuItemConstructorOptions } from 'electron'
import { default as lang } from './i18n/languages/en'

export type LanguageDict = typeof lang
export type LanguageKey = keyof LanguageDict

export interface IMenuItemOption extends MenuItemConstructorOptions {
  // 参见：https://www.electronjs.org/docs/api/menu-item

  _click_evt?: string;
}

export interface IPopupMenuOption {
  menu_id: string;
  items: IMenuItemOption[];
}

export interface IFindResultItem {
  item_id: string;
  item_type: HostsType;
  line: number;
  start: number;
  end: number;
}
