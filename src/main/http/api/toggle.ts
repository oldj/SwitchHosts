/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { getList } from '@main/actions'
import { broadcast } from '@main/core/agent'
import events from '@common/events'
import { findItemById } from '@common/hostsFn'
import type { Context } from 'hono'

const toggle = async (c: Context) => {
  const id = c.req.query('id')
  console.log(`http_api toggle: ${id}`)
  if (!id) {
    return c.text('bad id.')
  }

  let list = await getList()
  let item = findItemById(list, id)
  if (!item) {
    return c.text('not found.')
  }

  broadcast(events.toggle_item, id, !item.on)
  return c.text('ok')
}

export default toggle
