/**
 * getIndex
 * @author: oldj
 * @homepage: https://oldj.net
 */

import isDev from '@main/libs/isDev'
import path from 'path'
import * as url from 'url'

export default (): string => {
  let index: string
  if (isDev()) {
    index = 'http://127.0.0.1:8220'
  } else {
    index = url.format({
      pathname: path.join(__dirname, 'index.html'),
      protocol: 'file:',
      slashes: true,
    })
  }

  return index
}
