/**
 * config
 * @author: oldj
 * @homepage: https://oldj.net
 */

import default_configs from '@main/default_configs'
import Store from 'electron-store'

const store = new Store()

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
