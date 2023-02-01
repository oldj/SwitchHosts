/**
 * run
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { cfgdb } from '@main/data'
import { ICommandRunResult } from '@common/data'
import { exec } from 'child_process'
import { broadcast } from '@main/core/agent'
import events from '@common/events'

const run = (cmd: string): Promise<ICommandRunResult> =>
  new Promise((resolve) => {
    exec(cmd, (error, stdout, stderr) => {
      // command output is in stdout
      let success: boolean = !error

      resolve({
        success,
        stdout,
        stderr,
        add_time_ms: new Date().getTime(),
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
  broadcast(events.cmd_run_result, result)

  // auto delete old records
  const max_records = 200
  let all = await cfgdb.collection.cmd_history.all<ICommandRunResult>()
  if (all.length > max_records) {
    let n = all.length - max_records
    for (let i = 0; i < n; i++) {
      await cfgdb.collection.cmd_history.delete((item) => item._id === all[i]._id)
    }
  }

  global.tracer.add(`cmd:${result.success ? 1 : 0}`)
}
