/**
 * config
 * @author: oldj
 * @homepage: https://oldj.net
 */

import default_configs from '@main/default_configs'
import { cfgdb } from '@main/data'

export type ConfigsType = typeof default_configs

export const get = async <K extends keyof ConfigsType>(key: K) => {
  return await cfgdb.dict.cfg.get(key, default_configs[key]) as ConfigsType[K]
}

export const set = async <K extends keyof ConfigsType>(key: K, value: ConfigsType[K]) => {
  console.log(`config:store.set [${key}]: ${value}`)
  await cfgdb.dict.cfg.set(key, value)
}

export const del = async (key: keyof ConfigsType) => {
  await cfgdb.dict.cfg.delete(key)
}

export const all = async (): Promise<ConfigsType> => {
  let cfgs: Partial<ConfigsType> = await cfgdb.dict.cfg.all()

  return Object.assign({}, default_configs, cfgs)
}
