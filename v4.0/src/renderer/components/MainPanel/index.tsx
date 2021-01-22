/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { actions, agent } from '@renderer/agent'
import HostsEditor from '@renderer/components/HostsEditor'
import HostsViewer from '@renderer/components/HostsViewer'
import ItemIcon from '@renderer/components/ItemIcon'
import SwitchButton from '@renderer/components/SwitchButton'
import clsx from 'clsx'
import React, { useEffect, useState } from 'react'
import { BiDockLeft, BiSliderAlt } from 'react-icons/bi'
import styles from './index.less'

interface Props {
  has_left_panel: boolean;
}

const MainPanel = (props: Props) => {
  const { has_left_panel } = props
  const { i18n } = useModel('useI18n')
  const { current_hosts } = useModel('useCurrentHosts')
  const [system_hosts, setSystemHosts] = useState('')

  useEffect(() => {
    if (!current_hosts) {
      actions.systemHostsRead().then(value => setSystemHosts(value))
    }
  }, [current_hosts])

  let is_read_only = !current_hosts || current_hosts.where !== 'local'

  return (
    <div className={styles.root}>
      <div className={clsx(styles.topbar, !has_left_panel && styles.without_left_panel)}>
        <div className={clsx(styles.toggle_left_panel, styles.icon)}>
          <BiDockLeft onClick={() => agent.broadcast('toggle_left_pannel')}/>
        </div>

        <div className={styles.hosts_title}>
          <span className={styles.sp}/>
          {current_hosts ? (
            <>
              <span className={clsx(styles.hosts_icon, styles.icon)}>
                <ItemIcon where={current_hosts.where}/>
              </span>
              <span className={styles.hosts_title}>{current_hosts.title || i18n.lang.untitled}</span>
            </>
          ) : (
            <>
              <span className={clsx(styles.hosts_icon, styles.icon)}>
                <ItemIcon where="system"/>
              </span>
              <span className={styles.hosts_title}>{i18n.lang.system_hosts}</span>
            </>
          )}
        </div>

        <div>
          {current_hosts ? (
            <SwitchButton on={current_hosts.on}/>
          ) : null}
        </div>
        <div>
          <BiSliderAlt/>
        </div>
      </div>

      <div className={styles.main}>
        {current_hosts ? (
          <HostsEditor hosts={current_hosts}/>
        ) : (
          <HostsViewer content={system_hosts}/>
        )}
      </div>

      <div className={styles.status_bar}>
        <span>{is_read_only ? i18n.lang.read_only : ''}</span>
      </div>
    </div>
  )
}

export default MainPanel
