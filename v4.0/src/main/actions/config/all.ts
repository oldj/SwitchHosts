/**
 * configGet
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { all, ConfigsType } from '@main/core/config'

export default async (): Promise<ConfigsType> => await all()
