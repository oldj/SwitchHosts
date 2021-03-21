/**
 * run
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { cfgdb } from '@main/data'
import { ICommandRunResult } from '@root/common/data'
import { exec } from 'child_process'

const run = (cmd: string): Promise<ICommandRunResult> => new Promise(resolve => {
  exec(cmd, (error, stdout, stderr) => {
    // command output is in stdout
    let success: boolean = !error

    resolve({
      success,
      stdout,
      stderr,
      add_time_ms: (new Date()).getTime(),
    })
  })
})

export default async () => {
  let cmd = await cfgdb.dict.cfg.get('cmd_after_hosts_apply')

  if (!cmd || typeof cmd !== 'string' || !cmd.trim()) {
    return
  }

  console.log(`to run cmd...`)
  let result = await run(cmd)
  console.log(result)
  await cfgdb.collection.cmd_history.insert(result)
}
