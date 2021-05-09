/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { moveToTrashcan } from '@main/actions'

export default async function (ids: string[]) {
  for (let id of ids) {
    await moveToTrashcan(id)
  }
}
