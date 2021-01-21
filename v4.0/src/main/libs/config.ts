/**
 * config
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { LocaleName } from '@root/common/i18n'
import Store from 'electron-store'

const store = new Store()

const default_configs = {
  left_panel_width: 270,
  locale: 'zh' as LocaleName,
  theme: 'light' as 'light' | 'dark' | 'auto',
}

export type ConfigsType = typeof default_configs

export const get = <K extends keyof ConfigsType>(key: K) => {
  return store.get(key, default_configs[key]) as ConfigsType[K]
}

export const set = <K extends keyof ConfigsType>(key: K, value: ConfigsType[K]) => {
  store.set(key, value)
}

export const del = (key: keyof ConfigsType) => {
  store.delete(key)
}
