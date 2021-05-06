/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { updateTrayTitle } from '@main/actions'
import { cfgdb } from '@main/data'
import { makeMainMenu } from '@main/ui/menu'
import { ConfigsType } from '@root/common/default_configs'
import * as http_api from '@main/http'

export default async (data: Partial<ConfigsType>) => {
  const old_configs = (await cfgdb.dict.cfg.all()) as ConfigsType

  await cfgdb.dict.cfg.update(data)

  await updateTrayTitle(!!data.show_title_on_tray)
  if (old_configs.locale !== data.locale) {
    makeMainMenu(data.locale)
  }

  if (old_configs.http_api_on !== data.http_api_on) {
    if (data.http_api_on) {
      http_api.start()
    } else {
      http_api.stop()
    }
  }
}
