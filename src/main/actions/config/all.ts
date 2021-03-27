/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { cfgdb } from '@main/data'
import default_configs, { ConfigsType } from '@root/common/default_configs'

export default async (): Promise<ConfigsType> => {
  let cfgs: Partial<ConfigsType> = await cfgdb.dict.cfg.all()
  return Object.assign({}, default_configs, cfgs)
}
