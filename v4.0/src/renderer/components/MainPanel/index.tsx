/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { agent } from '@renderer/agent'
import React from 'react'
import styles from './index.less'
import { BiDockLeft } from 'react-icons/bi'
import clsx from 'clsx'

interface Props {
  has_left_panel: boolean;
}

const MainPanel = (props: Props) => {
  const { has_left_panel } = props

  return (
    <div className={styles.root}>
      <div className={styles.topbar}>
        <div className={clsx(styles.left, !has_left_panel && styles.without_left_panel)}>
          <span className={styles.toggle_left_panel}><BiDockLeft onClick={() => agent.broadcast('toggle_left_pannel')}/></span>
          <span>Left buttons</span>
        </div>
        <div className={styles.right}>
          <span>Right buttons</span>
        </div>
      </div>

      <div className={styles.main}>
        main
      </div>
    </div>
  )
}

export default MainPanel
