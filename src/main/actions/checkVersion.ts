/**
 * checkVersion
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { broadcast } from '@main/core/agent'
import { GET } from '@main/libs/request'
import { server_url } from '@root/common/constants'
import version from '@root/version.json'
import compareVersions from 'compare-versions'

export default async () => {
  // Check the latest version, also used for anonymous statistics of DAU,
  // no personal information will be sent.

  let r = await GET(`${server_url}/api/check/`)
  if (r.status !== 200 || !r.data?.success) {
    return
  }

  let server_version = r.data.data.version
  let local_version = version.slice(0, 3).join('.')

  if (compareVersions(server_version, local_version) === 1) {
    // new version found
    console.log(`new version: ${server_version}`)
    broadcast('new_version', server_version)
  }
}
