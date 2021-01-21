/**
 * configGet
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ConfigsType, get } from '@main/libs/config'

export default async <K extends keyof ConfigsType>(key: K) => get(key)
