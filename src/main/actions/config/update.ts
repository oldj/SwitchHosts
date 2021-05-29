/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { updateTrayTitle } from '@main/actions'
import { cfgdb } from '@main/data'
import * as http_api from '@main/http'
import { makeMainMenu } from '@main/ui/menu'
import { ConfigsType } from '@root/common/default_configs'
import { app } from 'electron'

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

  if (old_configs.hide_dock_icon !== data.hide_dock_icon) {
    if (data.hide_dock_icon) {
      app.dock.hide()
    } else {
      app.dock.show()
        .catch(e => console.error(e))
    }
  }
}
