/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { agent } from '@renderer/agent'
import ItemIcon from '@renderer/components/ItemIcon'
import SwitchButton from '@renderer/components/LeftPanel/SwitchButton'
import { updateOneItem } from '@renderer/libs/hostsFn'
import clsx from 'clsx'
import lodash from 'lodash'
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
  const { hosts_data, setList } = useModel('useHostsData')
  const [content, setContent] = useState(current_hosts?.content || '')

  const toSave = lodash.debounce((id: string, content: string) => {
    setList(updateOneItem(hosts_data.list, { id, content }))
      .catch(e => console.error(e))
  }, 1000)

  const onChange = (content: string) => {
    if (!current_hosts) return
    setContent(content)
    toSave(current_hosts.id, content)
  }

  useEffect(() => {
    setContent(current_hosts?.content || '')
  }, [current_hosts])

  return (
    <div className={styles.root}>
      <div className={clsx(styles.topbar, !has_left_panel && styles.without_left_panel)}>
        <div className={clsx(styles.toggle_left_panel, styles.icon)}>
          <BiDockLeft onClick={() => agent.broadcast('toggle_left_pannel')}/>
        </div>

        <div className={styles.hosts_title}>
          {current_hosts ? (
            <>
              <span className={styles.sp}/>
              <span className={clsx(styles.hosts_icon, styles.icon)}>
                <ItemIcon data={current_hosts} ignore_folder_open={true}/>
              </span>
              <span className={styles.hosts_title}>{current_hosts.title || i18n.lang.untitled}</span>
            </>
          ) : null}
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
        <textarea value={content} onChange={e => onChange(e.target.value)}/>
      </div>

      <div className={styles.status_bar}>
        status
      </div>
    </div>
  )
}

export default MainPanel
