/**
 * configGet
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ConfigsType, get } from '@main/core/config'

export default async <K extends keyof ConfigsType>(key: K) => get(key)
