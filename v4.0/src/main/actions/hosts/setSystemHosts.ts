/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { configGet, deleteHistory, updateTrayTitle } from '@main/actions'
import tryToRun from '@main/actions/cmd/tryToRun'
import { broadcast } from '@main/core/agent'
import { swhdb } from '@main/data'
import safePSWD from '@main/libs/safePSWD'
import { IHostsWriteOptions } from '@main/types'
import { IHostsHistoryObject } from '@root/common/data'
import { exec } from 'child_process'
import * as fs from 'fs'
import md5 from 'md5'
import md5File from 'md5-file'
import * as os from 'os'
import * as path from 'path'
import { v4 as uuid4 } from 'uuid'
import getPathOfSystemHosts from './getPathOfSystemHostsPath'

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
    // console.error(e)
  }
  return false
}

const addHistory = async (content: string) => {
  await swhdb.collection.history.insert({
    id: uuid4(),
    content,
    add_time_ms: (new Date()).getTime(),
  })

  let history_limit = await configGet('history_limit')
  if (typeof history_limit !== 'number' || history_limit <= 0) return

  let lists = await swhdb.collection.history.all<IHostsHistoryObject>()
  if (lists.length <= history_limit) {
    return
  }

  for (let i = 0; i < lists.length - history_limit; i++) {
    if (!lists[i] || !lists[i].id) break
    await deleteHistory(lists[i].id)
  }
}

const writeWithSudo = (sys_hosts_path: string, content: string): Promise<IWriteResult> => new Promise((resolve, reject) => {
  let tmp_fn = path.join(os.tmpdir(), `swh_${(new Date()).getTime()}_${Math.random()}.txt`)
  fs.writeFileSync(tmp_fn, content, 'utf-8')

  let cmd = [
    `echo '${sudo_pswd}' | sudo -S chmod 777 ${sys_hosts_path}`
    , `cat "${tmp_fn}" > ${sys_hosts_path}`
    , `echo '${sudo_pswd}' | sudo -S chmod 644 ${sys_hosts_path}`,
    // , 'rm -rf ' + tmp_fn
  ].join(' && ')

  exec(cmd, function (error, stdout, stderr) {
    // command output is in stdout
    console.log('stdout', stdout)
    console.log('stderr', stderr)

    if (fs.existsSync(tmp_fn)) {
      fs.unlinkSync(tmp_fn)
    }

    let result: IWriteResult

    if (!error) {
      console.log('success.')

      result = {
        success: true,
      }
    } else {
      console.log('fail!')
      sudo_pswd = ''

      result = {
        success: false,
        message: stderr,
      }
    }

    resolve(result)
  })
})

const write = async (content: string, options?: IHostsWriteOptions): Promise<IWriteResult> => {
  const sys_hosts_path = await getPathOfSystemHosts()
  const fn_md5 = await md5File(sys_hosts_path)
  const content_md5 = md5(content)

  if (fn_md5 === content_md5) {
    // file not change
    return { success: true }
  }

  if (!(await checkAccess(sys_hosts_path))) {
    if (options && options.sudo_pswd) {
      sudo_pswd = safePSWD(options.sudo_pswd)
    }

    let platform = process.platform
    if ((platform === 'darwin' || platform === 'linux') && sudo_pswd) {
      return await writeWithSudo(sys_hosts_path, content)
    }

    return {
      success: false,
      code: 'no_access',
    }
  }

  try {
    await fs.promises.writeFile(sys_hosts_path, content, 'utf-8')
  } catch (e) {
    return {
      success: false,
      code: 'fail',
      message: e.message,
    }
  }

  return { success: true }
}

const setSystemHosts = async (content: string, options?: IHostsWriteOptions): Promise<IWriteResult> => {
  let result = await write(content, options)

  if (result.success) {
    await addHistory(content)
    await updateTrayTitle()
    broadcast('system_hosts_updated')

    await tryToRun()
  }

  return result
}

export default setSystemHosts
