/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { updateTrayTitle } from '@main/actions'
import { cfgdb } from '@main/data'
import { makeMainMenu } from '@main/libs/menu'
import { ConfigsType } from '@root/common/default_configs'

export default async (data: Partial<ConfigsType>) => {
  const old_configs = (await cfgdb.dict.cfg.all()) as ConfigsType

  await cfgdb.dict.cfg.update(data)

  await updateTrayTitle(!!data.show_title_on_tray)
  if (old_configs.locale !== data.locale) {
    makeMainMenu(data.locale)
  }
}
