/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { getHostsContent } from '@main/actions'
import { IHostsListObject } from '@root/common/data'
import { flatten } from '@root/common/hostsFn'
import normalize from '@root/common/normalize'

const getContentOfList = async (list: IHostsListObject[]): Promise<string> => {
  const content_list: string[] = []
  const flat = flatten(list).filter(item => item.on)

  for (let hosts of flat) {
    let c = await getHostsContent(hosts.id)
    content_list.push(c)
  }

  let content = content_list.join('\n\n')
  // console.log(content)
  content = normalize(content)

  return content
}

export default getContentOfList
