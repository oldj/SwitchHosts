/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { cfgdb } from '@main/data'
import { ConfigsType } from '@common/default_configs'

export default async <K extends keyof ConfigsType>(key: K, value: ConfigsType[K]) => {
  console.log(`config:store.set [${key}]: ${value}`)
  await cfgdb.dict.cfg.set(key, value)
}
