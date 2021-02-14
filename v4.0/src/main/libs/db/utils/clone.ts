/**
 * clone
 * @author: oldj
 * @homepage: https://oldj.net
 */

import lodash from 'lodash'

export const clone = (target: any, propertyName: string, descriptor: PropertyDescriptor) => {
  const method = descriptor.value
  descriptor.value = async function (...args: any[]) {
    let result = await method.apply(this, args.map(i => {
      return (i && typeof i === 'object') ? lodash.cloneDeep(i) : i
    }))
    if (result && typeof result === 'object') {
      result = lodash.cloneDeep(result)
    }

    return result
  }
  return descriptor
}
