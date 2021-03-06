/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import getSystemHostsPath from '@main/actions/getSystemHostsPath'
import { broadcast } from '@main/core/agent'
import { IHostsWriteOptions } from '@main/types'
import * as fs from 'fs'

interface IWriteResult {
  success: boolean;
  code?: string;
  message?: string;
}

let sudo_pswd: string = ''

const checkAccess = async (fn: string): Promise<boolean> => {
  try {
    await fs.promises.access(fn, fs.constants.W_OK)
    return true
  } catch (e) {
    console.error(e)
  }
  return false
}

const write = async (content: string, options?: IHostsWriteOptions): Promise<IWriteResult> => {
  const fn = await getSystemHostsPath()

  if (!(await checkAccess(fn))) {
    console.log(options)
    if (options && options.sudo_pswd) {
      sudo_pswd = options.sudo_pswd
    }

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

export default write
