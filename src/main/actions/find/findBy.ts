/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import getContentOfHosts from '@main/actions/hosts/getContent'
import { flatten } from '@root/common/hostsFn'
import { IFindResultItem } from '@root/common/types'
import { getList } from '../index'
import findInContent from './findInContent'

export interface IFindOptions {
  is_regexp: boolean;
  is_ignore_case: boolean;
}

export default async (keyword: string, options: IFindOptions): Promise<IFindResultItem[]> => {
  console.log(keyword)
  let result_items: IFindResultItem[] = []

  let tree = await getList()
  let items = flatten(tree)

  let exp: RegExp
  if (options.is_regexp) {
    exp = new RegExp(keyword, options.is_ignore_case ? 'ig' : 'g')
  } else {
    let kw = keyword.replace(/([.^$([?*+])/ig, '\\$1')
    exp = new RegExp(kw, options.is_ignore_case ? 'ig' : 'g')
  }

  for (let item of items) {
    const item_type = item.type || 'local'
    if (item_type === 'group' || item_type === 'folder') {
      continue
    }
    let content = await getContentOfHosts(item.id)
    let found = findInContent(content, exp)
    result_items = [...result_items, ...found.map(i => ({
      ...i,
      item_title: item.title || '',
      item_id: item.id,
      item_type,
    }))]
  }

  return result_items
}
