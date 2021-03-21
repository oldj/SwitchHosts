/**
 * run
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { cfgdb } from '@main/data'
import { exec } from 'child_process'

interface IExeResult {
  success: boolean;
  stdout: string;
  stderr: string;
}

const run = (cmd: string): Promise<IExeResult> => new Promise(resolve => {
  exec(cmd, (error, stdout, stderr) => {
    // command output is in stdout
    let success: boolean = !error

    resolve({
      success,
      stdout,
      stderr,
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

  await cfgdb.collection.cmd_history.insert({
    ...result,
    add_time_ms: (new Date()).getTime(),
  })
}
