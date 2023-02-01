/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import splitContent from '@main/actions/find/splitContent'
import getContentOfHosts from '@main/actions/hosts/getContent'
import { flatten } from '@common/hostsFn'
import { IFindItem } from '@common/types'
import findInContent from 'src/main/actions/find/findPositionsInContent'
import { getList } from '../index'

export interface IFindOptions {
  is_regexp: boolean
  is_ignore_case: boolean
}

export default async (keyword: string, options: IFindOptions): Promise<IFindItem[]> => {
  console.log(keyword)
  let result_items: IFindItem[] = []

  let tree = await getList()
  let items = flatten(tree)

  let exp: RegExp
  if (options.is_regexp) {
    exp = new RegExp(keyword, options.is_ignore_case ? 'ig' : 'g')
  } else {
    let kw = keyword.replace(/([.^$([?*+])/gi, '\\$1')
    exp = new RegExp(kw, options.is_ignore_case ? 'ig' : 'g')
  }

  for (let item of items) {
    const item_type = item.type || 'local'
    if (item_type === 'group' || item_type === 'folder') {
      continue
    }
    let content = await getContentOfHosts(item.id)
    let positions = findInContent(content, exp)
    if (positions.length === 0) {
      continue
    }

    result_items.push({
      item_title: item.title || '',
      item_id: item.id,
      item_type,
      positions,
      splitters: splitContent(content, positions),
    })
  }

  return result_items
}
