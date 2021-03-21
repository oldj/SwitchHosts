/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { updateTrayTitle } from '@main/actions'
import { cfgdb } from '@main/data'
import { ConfigsType } from '@root/common/default_configs'

export default async (data: Partial<ConfigsType>) => {
  await cfgdb.dict.cfg.update(data)

  await updateTrayTitle(!!data.show_title_on_tray)
}
