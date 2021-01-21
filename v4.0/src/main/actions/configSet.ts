/**
 * configGet
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { set, ConfigsType } from '@main/libs/config'

export default async <K extends keyof ConfigsType>(key: K, value: ConfigsType[K]) => set(key, value)
