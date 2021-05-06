/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import getContentOfHosts from '@main/actions/hosts/getContent'
import { flatten } from '@root/common/hostsFn'
import { IFindResultItem } from '@root/common/types'
import { getList } from '../index'

interface IFindOptions {
  is_regexp: boolean;
  is_ignore_case: boolean;
}

const findInContent = (content: string, exp: string | RegExp, options: IFindOptions): Omit<IFindResultItem, 'item_id' | 'item_type'>[] => {
  let result_items: IFindResultItem[] = []

  let result = {
    line: -1,
    start: -1,
    end: -1,
  }

  // todo ...

  return result_items
}

export default async (keyword: string, options: IFindOptions): Promise<IFindResultItem[]> => {
  console.log(keyword)
  let result_items: IFindResultItem[] = []

  let tree = await getList()
  let items = flatten(tree)

  let exp: string | RegExp = keyword
  if (options.is_regexp) {
    exp = new RegExp(exp, options.is_ignore_case ? 'ig' : 'g')
  }

  for (let item of items) {
    const item_type = item.type || 'local'
    if (item_type === 'group' || item_type === 'folder') {
      continue
    }
    let content = await getContentOfHosts(item.id)
    let found = findInContent(content, exp, options)
    result_items = [...result_items, ...found.map(i => ({
      ...i,
      item_id: item.id,
      item_type,
    }))]
  }

  return result_items
}
