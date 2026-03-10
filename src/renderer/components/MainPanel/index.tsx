/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import events from '@common/events'
import HostsEditor from '@renderer/components/Editor/HostsEditor'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import styles from './index.module.scss'

const MainPanel = () => {
  useOnBroadcast(events.cmd_run_result, (result) => {
    // console.log(result)
    if (!result.success) {
      console.error(result.stderr || 'cmd run error')
    }
  })

  return (
    <div className={styles.root}>
      <HostsEditor />
    </div>
  )
}

export default MainPanel
