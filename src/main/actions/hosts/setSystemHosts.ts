/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { configGet, deleteHistory, getHistoryList, updateTrayTitle } from '@main/actions'
import tryToRun from '@main/actions/cmd/tryToRun'
import { broadcast } from '@main/core/agent'
import { swhdb } from '@main/data'
import safePSWD from '@main/libs/safePSWD'
import { IHostsWriteOptions } from '@main/types'
import { IHostsHistoryObject } from '@common/data'
import events from '@common/events'
import { exec } from 'child_process'
import * as fs from 'fs'
import md5 from 'md5'
import md5File from 'md5-file'
import * as os from 'os'
import * as path from 'path'
import { v4 as uuid4 } from 'uuid'
import getPathOfSystemHosts from './getPathOfSystemHostsPath'

interface IWriteResult {
  success: boolean
  code?: string
  message?: string
  old_content?: string
  new_content?: string
}

const CONTENT_START = '# --- SWITCHHOSTS_CONTENT_START ---'

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
    add_time_ms: new Date().getTime(),
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

const writeWithSudo = (sys_hosts_path: string, content: string): Promise<IWriteResult> =>
  new Promise((resolve) => {
    let tmp_fn = path.join(os.tmpdir(), `swh_${new Date().getTime()}_${Math.random()}.txt`)
    fs.writeFileSync(tmp_fn, content, 'utf-8')

    let cmd = [
      `echo '${sudo_pswd}' | sudo -S chmod 777 ${sys_hosts_path}`,
      `cat "${tmp_fn}" > ${sys_hosts_path}`,
      `echo '${sudo_pswd}' | sudo -S chmod 644 ${sys_hosts_path}`,
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

  let old_content: string = ''
  try {
    old_content = await fs.promises.readFile(sys_hosts_path, 'utf-8')
  } catch (e) {
    console.error(e)
  }

  let has_access = await checkAccess(sys_hosts_path)
  if (!has_access) {
    if (options && options.sudo_pswd) {
      sudo_pswd = safePSWD(options.sudo_pswd)
    }

    let platform = process.platform
    if ((platform === 'darwin' || platform === 'linux') && sudo_pswd) {
      let result = await writeWithSudo(sys_hosts_path, content)
      if (result.success) {
        result.old_content = old_content
        result.new_content = content
      }

      return result
    }

    return {
      success: false,
      code: 'no_access',
    }
  }

  try {
    await fs.promises.writeFile(sys_hosts_path, content, 'utf-8')
  } catch (e: any) {
    console.error(e)
    let code = 'fail'
    if (e.code === 'EPERM' || e.message.include('operation not permitted')) {
      code = 'no_access'
    }

    return {
      success: false,
      code,
      message: e.message,
    }
  }

  return { success: true, old_content, new_content: content }
}

const makeAppendContent = async (content: string): Promise<string> => {
  const sys_hosts_path = await getPathOfSystemHosts()
  const old_content = await fs.promises.readFile(sys_hosts_path, 'utf-8')

  let index = old_content.indexOf(CONTENT_START)
  let new_content = index > -1 ? old_content.substring(0, index).trimEnd() : old_content

  if (!content) {
    return new_content + '\n'
  }

  return `${new_content}\n\n${CONTENT_START}\n\n${content}`
}

const setSystemHosts = async (
  content: string,
  options?: IHostsWriteOptions,
): Promise<IWriteResult> => {
  let write_mode = await configGet('write_mode')
  console.log(`write_mode: ${write_mode}`)
  if (write_mode === 'append') {
    content = await makeAppendContent(content)
  }

  let result = await write(content, options)
  let { success, old_content } = result

  if (success) {
    if (typeof old_content === 'string') {
      let histories = await getHistoryList()
      if (histories.length === 0 || histories[histories.length - 1].content !== old_content) {
        await addHistory(old_content)
      }
    }

    await addHistory(content)
    await updateTrayTitle()
    broadcast(events.system_hosts_updated)

    await tryToRun()
  }

  global.tracer.add(`w:${success ? 1 : 0}`)

  return result
}

export default setSystemHosts
