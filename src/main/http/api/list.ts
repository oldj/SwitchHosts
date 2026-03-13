/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { getList } from '@main/actions'
import { IHostsListObject } from '@common/data'
import { flatten } from '@common/hostsFn'
import type { Context } from 'hono'

const list = async (c: Context) => {
  let list: IHostsListObject[]
  try {
    list = await getList()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return c.json({
      success: false,
      message,
    })
  }

  list = flatten(list)

  return c.json({
    success: true,
    data: list,
  })
}

export default list
