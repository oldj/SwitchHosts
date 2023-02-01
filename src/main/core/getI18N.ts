/**
 * getLang
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { configGet } from '@main/actions'
import { LocaleName } from '@common/i18n'
import { I18N } from '@common/i18n'

export default async (locale?: LocaleName): Promise<I18N> => {
  if (!locale) {
    locale = await configGet('locale')
  }

  return new I18N(locale)
}
