/**
 * asType
 * @author: oldj
 * @homepage: https://oldj.net
 */

export const asInt = (value: any, default_value?: number): number => {
  value = parseInt(value)
  return isNaN(value) ? default_value : value
}
