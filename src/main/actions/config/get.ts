/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { cfgdb } from '@main/data'
import default_configs, { ConfigsType } from '@common/default_configs'

export default async <K extends keyof ConfigsType>(key: K) => {
  return (await cfgdb.dict.cfg.get(key, default_configs[key])) as ConfigsType[K]
}
