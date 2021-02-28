/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { MenuOutlined, SettingOutlined } from '@ant-design/icons'
import HostsEditor from '@renderer/components/HostsEditor'
import HostsViewer from '@renderer/components/HostsViewer'
import ItemIcon from '@renderer/components/ItemIcon'
import SwitchButton from '@renderer/components/SwitchButton'
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { Divider } from 'antd'
import clsx from 'clsx'
import React, { useEffect, useState } from 'react'
import styles from './index.less'

interface Props {
  has_left_panel: boolean;
}

const MainPanel = (props: Props) => {
  const { has_left_panel } = props
  const { i18n } = useModel('useI18n')
  const { current_hosts } = useModel('useCurrentHosts')
  const [system_hosts, setSystemHosts] = useState('')
  const [is_on, setIsOn] = useState(!!current_hosts?.on)

  useEffect(() => {
    if (!current_hosts) {
      actions.systemHostsRead().then(value => setSystemHosts(value))
    }
    setIsOn(!!current_hosts?.on)
  }, [current_hosts])

  useOnBroadcast('toggle_item', (id: string, on: boolean) => {
    if (current_hosts && current_hosts.id === id) {
      setIsOn(on)
    }
  }, [current_hosts])

  useOnBroadcast('system_hosts_updated', () => {
    if (!current_hosts) {
      actions.systemHostsRead().then(value => setSystemHosts(value))
    }
  }, [current_hosts])

  useOnBroadcast('set_hosts_on_status', (id: string, on: boolean) => {
    if (current_hosts && current_hosts.id === id) {
      setIsOn(on)
    }
  }, [current_hosts])

  return (
    <div className={styles.root}>
      <div className={clsx(styles.topbar, !has_left_panel && styles.without_left_panel)}>
        <div className={clsx(styles.toggle_left_panel)}>
          <MenuOutlined
            onClick={() => agent.broadcast('toggle_left_pannel')}
          />
        </div>

        <div className={styles.hosts_title}>
          <Divider type="vertical"/>
          {current_hosts ? (
            <>
              <span className={clsx(styles.hosts_icon)}>
                <ItemIcon where={current_hosts.where}/>
              </span>
              <span className={styles.hosts_title}>{current_hosts.title || i18n.lang.untitled}</span>
            </>
          ) : (
            <>
              <span className={clsx(styles.hosts_icon)}>
                <ItemIcon where="system"/>
              </span>
              <span className={styles.hosts_title}>{i18n.lang.system_hosts}</span>
            </>
          )}
        </div>

        <div>
          {current_hosts ? (
            <SwitchButton on={is_on} onChange={on => {
              agent.broadcast('toggle_item', current_hosts.id, on)
            }}/>
          ) : null}
        </div>
        <div>
          <SettingOutlined/>
        </div>
      </div>

      <div className={styles.main}>
        {current_hosts ? (
          <HostsEditor hosts={current_hosts}/>
        ) : (
          <HostsViewer content={system_hosts}/>
        )}
      </div>
    </div>
  )
}

export default MainPanel
