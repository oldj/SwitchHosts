/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import HostsEditor from '@renderer/components/Editor/HostsEditor'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import events from '@common/events'
import React from 'react'
import styles from './index.module.scss'
import { showNotification } from '@mantine/notifications'

const MainPanel = () => {
  useOnBroadcast(events.cmd_run_result, (result) => {
    // console.log(result)
    if (!result.success) {
      showNotification({
        // status: 'error',
        color: 'red',
        message: result.stderr || 'cmd run error',
      })
    }
  })

  return (
    <div className={styles.root}>
      <HostsEditor />
    </div>
  )
}

export default MainPanel
