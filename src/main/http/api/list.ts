/**
 * list
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { getList } from '@main/actions'
import { IHostsListObject } from '@common/data'
import { flatten } from '@common/hostsFn'
import { Request, Response } from 'express'

const list = async (req: Request, res: Response) => {
  let list: IHostsListObject[]
  try {
    list = await getList()
  } catch (e: any) {
    res.end(
      JSON.stringify({
        success: false,
        message: e.message,
      }),
    )

    return
  }

  list = flatten(list)

  res.end(
    JSON.stringify({
      success: true,
      data: list,
    }),
  )
}

export default list
