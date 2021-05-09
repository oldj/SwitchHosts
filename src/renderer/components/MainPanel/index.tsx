/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import HostsEditor from '@renderer/components/Editor/HostsEditor'
import { actions } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import events from '@root/common/events'
import React, { useEffect, useState } from 'react'
import styles from './index.less'

interface Props {
}

const MainPanel = (props: Props) => {
  const { current_hosts } = useModel('useHostsData')
  const [system_hosts_content, setSystemHostsContent] = useState('')

  useEffect(() => {
    if (!current_hosts) {
      actions.getSystemHosts().then(value => setSystemHostsContent(value))
    }
  }, [current_hosts])

  useOnBroadcast(events.system_hosts_updated, () => {
    if (!current_hosts) {
      actions.getSystemHosts().then(value => setSystemHostsContent(value))
    }
  }, [current_hosts])

  return (
    <div className={styles.root}>
      <HostsEditor hosts={current_hosts || {
        id: '0',
        content: system_hosts_content,
      }}/>
    </div>
  )
}

export default MainPanel
