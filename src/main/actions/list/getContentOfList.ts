/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { configGet, getHostsContent } from '@main/actions'
import { IHostsListObject } from '@common/data'
import { flatten } from '@common/hostsFn'
import normalize, { INormalizeOptions } from '@common/normalize'

const getContentOfList = async (list: IHostsListObject[]): Promise<string> => {
  const content_list: string[] = []
  const flat = flatten(list).filter((item) => item.on)

  for (let hosts of flat) {
    let c = await getHostsContent(hosts.id)
    content_list.push(c)
  }

  let content = content_list.join('\n\n')
  // console.log(content)
  let options: INormalizeOptions = {}

  if (await configGet('remove_duplicate_records')) {
    options.remove_duplicate_records = true
  }

  content = normalize(content, options)

  return content
}

export default getContentOfList
