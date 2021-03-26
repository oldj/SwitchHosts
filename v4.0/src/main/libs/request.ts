/**
 * request
 * @author: oldj
 * @homepage: https://oldj.net
 */

import axios from 'axios'
import querystring from 'querystring'
import version from '@root/version.json'

const default_headers = {
  'user-agent': `Mozilla/5.0 (Macintosh; Intel Mac OS X 11_2_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36 SwitchHosts/${version.join('.')}`,
}

interface IParams {
  [key: string]: string | string[] | number;
}

interface IRequestOptions {
  timeout?: number;
  headers?: { [key: string]: string | string[] },
}

export const GET = async (url: string, params: IParams | null = null, options: IRequestOptions = {}) => {
  let s = ''
  if (params) {
    s = querystring.stringify(params)
  }
  if (s) {
    url += (url.includes('?') ? '&' : '?') + s
  }

  const instance = axios.create({
    timeout: options.timeout || 30000,
    headers: {
      ...default_headers,
      ...options.headers,
    },
  })

  return await instance.get(url)
}
