/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { swhdb } from '@main/data'
import { IHostsContentObject } from '@common/data'
import { normalizeLineEndings } from '@common/newlines'

export default async (id: string, content: string) => {
  const normalizedContent = normalizeLineEndings(content)
  let d = await swhdb.collection.hosts.find<IHostsContentObject>((i) => i.id === id)
  if (!d || !d._id) {
    await swhdb.collection.hosts.insert({ id, content: normalizedContent })
  } else {
    await swhdb.collection.hosts.update((i) => i._id === d?._id, { content: normalizedContent })
  }
}
