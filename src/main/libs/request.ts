/**
 * request
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { configGet } from '@main/actions'
import axios, { AxiosRequestConfig } from 'axios'
import querystring from 'querystring'
import version from '@/version.json'

interface IParams {
  [key: string]: string | string[] | number
}

interface IRequestOptions {
  timeout?: number
  headers?: { [key: string]: string | string[] }
}

export const GET = async (
  url: string,
  params: IParams | null = null,
  options: IRequestOptions = {},
) => {
  let s = ''
  if (params) {
    s = querystring.stringify(params)
  }
  if (s) {
    url += (url.includes('?') ? '&' : '?') + s
  }

  const default_headers = {
    'user-agent': `${global.ua} SwitchHosts/${version.join('.')}`,
  }

  let configs: AxiosRequestConfig = {
    timeout: options.timeout || 30000,
    headers: {
      ...default_headers,
      ...options.headers,
    },
  }

  if (await configGet('use_proxy')) {
    let protocol = await configGet('proxy_protocol')
    let host = await configGet('proxy_host')
    let port = await configGet('proxy_port')

    if (host && port) {
      configs.proxy = { protocol, host, port }
    }
  }

  const instance = axios.create(configs)

  return await instance.get(url)
}
