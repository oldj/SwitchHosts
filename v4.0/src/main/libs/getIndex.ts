import path from 'path'
import * as url from 'url'

/**
 * getIndex
 * @author: oldj
 * @homepage: https://oldj.net
 */

export default (): string => {
  let index: string
  if (process.env.NODE_ENV !== 'production') {
    index = 'http://127.0.0.1:8220'
  } else {
    index = url.format({
      pathname: path.join(__dirname, 'renderer', 'index.html'),
      protocol: 'file:',
      slashes: true,
    })
  }

  return index
}
