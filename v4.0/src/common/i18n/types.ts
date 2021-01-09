/**
 * types
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { default as lang } from './languages/en'

export type LanguageDict = typeof lang
export type LanguageKey = keyof LanguageDict
