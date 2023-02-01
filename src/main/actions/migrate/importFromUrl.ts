/**
 * importFromUrl
 * @author: oldj
 * @homepage: https://oldj.net
 */

import importV3Data from '@main/actions/migrate/importV3Data'
import { swhdb } from '@main/data'
import { GET } from '@main/libs/request'

export default async (url: string): Promise<boolean | null | string> => {
  console.log(`import from url: ${url}`)
  let res
  try {
    res = await GET(url)
  } catch (e: any) {
    console.error(e)
    return e.message
  }

  // console.log(res)
  if (res.status !== 200) {
    return `error_${res.status}`
  }

  let data: any
  if (typeof res.data === 'string') {
    try {
      data = JSON.parse(res.data)
    } catch (e) {
      console.error(e)
      return 'parse_error'
    }
  } else {
    data = res.data
  }

  if (typeof data !== 'object' || !data.version || !Array.isArray(data.version)) {
    return 'invalid_data'
  }

  let { version } = data
  if (version[0] === 3) {
    // import v3 data
    try {
      await importV3Data(data)
    } catch (e) {
      console.error(e)
      return 'invalid_v3_data'
    }

    return true
  }

  if (version[0] > 4) {
    return 'new_version'
  }

  if (!data.data || typeof data.data !== 'object') {
    return 'invalid_data_key'
  }

  await swhdb.loadJSON(data.data)

  return true
}
