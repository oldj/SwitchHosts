/**
 * toggleTrayTitle
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { getList } from '@main/actions/index'
import { cfgdb } from '@main/data'
import { tray } from '@main/ui/tray'
import { flatten } from '@common/hostsFn'

export default async (show?: boolean, title?: string) => {
  if (!tray) return

  if (typeof show !== 'boolean') {
    show = await cfgdb.dict.cfg.get('show_title_on_tray')
  }

  if (!show) {
    tray.setTitle('')
    return
  }

  if (!title) {
    let list = await getList()
    let on_items = flatten(list).filter((i) => i.on)
    title = on_items.map((i) => i.title).join(',')
    if (title.length > 20) {
      title = title.substring(0, 17) + '...'
    }
  }
  tray.setTitle(title)
}
