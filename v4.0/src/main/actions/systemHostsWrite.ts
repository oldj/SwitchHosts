/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import getSystemHostsPath from '@main/actions/getSystemHostsPath'
import { broadcast } from '@main/agent'
import * as fs from 'fs'

interface IHostsWriteOptions {
  sudo_pswd?: string;
}

interface IWriteResult {
  success: boolean;
  code?: string;
  message?: string;
}

export default async (content: string, options?: IHostsWriteOptions): Promise<IWriteResult> => {
  const fn = await getSystemHostsPath()

  let has_access = false
  try {
    await fs.promises.access(fn, fs.constants.W_OK)
    has_access = true
  } catch (e) {
    console.error(e)
  }

  if (!has_access) {
    return {
      success: false,
      code: 'no_access',
    }
  }

  try {
    await fs.promises.writeFile(fn, content, 'utf-8')
  } catch (e) {
    return {
      success: false,
      code: 'fail',
      message: e.message,
    }
  }

  broadcast('system_hosts_updated')

  return { success: true }
}
