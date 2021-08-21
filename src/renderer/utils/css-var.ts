/**
 * css-var
 * @author: oldj
 * @homepage: https://oldj.net
 */

export const getCssVar = (name: string): string => {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
}
