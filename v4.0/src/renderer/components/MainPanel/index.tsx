/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import HostsEditor from '@renderer/components/Editor/HostsEditor'
import HostsViewer from '@renderer/components/HostsViewer'
import { actions } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import React, { useEffect, useState } from 'react'
import styles from './index.less'

interface Props {
}

const MainPanel = (props: Props) => {
  const { current_hosts } = useModel('useHostsData')
  const [ system_hosts, setSystemHosts ] = useState('')

  useEffect(() => {
    if (!current_hosts) {
      actions.getSystemHosts().then(value => setSystemHosts(value))
    }
  }, [ current_hosts ])

  useOnBroadcast('system_hosts_updated', () => {
    if (!current_hosts) {
      actions.getSystemHosts().then(value => setSystemHosts(value))
    }
  }, [ current_hosts ])

  return (
    <div className={styles.root}>
      {current_hosts ? (
        <HostsEditor hosts={current_hosts}/>
      ) : (
        <HostsViewer content={system_hosts}/>
      )}
    </div>
  )
}

export default MainPanel
