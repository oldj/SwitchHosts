/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { cfgdb } from '@main/data'
import { ConfigsType } from '@root/common/default_configs'

export default async (data: Partial<ConfigsType>) => {
  await cfgdb.dict.cfg.update(data)
}
