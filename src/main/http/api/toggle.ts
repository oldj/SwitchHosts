/**
 * toggle
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { getList } from '@main/actions'
import { broadcast } from '@main/core/agent'
import events from '@common/events'
import { findItemById } from '@common/hostsFn'
import { Request, Response } from 'express'

const toggle = async (req: Request, res: Response) => {
  let { id } = req.query
  console.log(`http_api toggle: ${id}`)
  if (!id) {
    res.end('bad id.')
    return
  }

  let list = await getList()
  let item = findItemById(list, id.toString())
  if (!item) {
    res.end('not found.')
    return
  }

  broadcast(events.toggle_item, id, !item.on)
  res.end('ok')
}

export default toggle
