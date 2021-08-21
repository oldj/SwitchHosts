/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { cfgdb } from '@main/data'

export default async (): Promise<string[]> => {
  return (await cfgdb.list.replace_history.all()) as string[]
}
