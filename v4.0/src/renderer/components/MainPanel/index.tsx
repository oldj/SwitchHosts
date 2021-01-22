/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { agent } from '@renderer/agent'
import ItemIcon from '@renderer/components/ItemIcon'
import React from 'react'
import styles from './index.less'
import { BiDockLeft, BiSliderAlt } from 'react-icons/bi'
import clsx from 'clsx'

interface Props {
  has_left_panel: boolean;
}

const MainPanel = (props: Props) => {
  const { has_left_panel } = props
  const { i18n } = useModel('useI18n')
  const { current_hosts, setCurrentHosts } = useModel('useCurrentHosts')

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

        <div className={styles.right}>
          <BiSliderAlt/>
        </div>
      </div>

      <div className={styles.main}>
        <textarea value={current_hosts?.content}/>
      </div>

      <div className={styles.status_bar}>
        status
      </div>
    </div>
  )
}

export default MainPanel
