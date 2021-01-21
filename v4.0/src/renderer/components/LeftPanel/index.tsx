/**
 * LeftPanel
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { agent } from '@renderer/agent'
import React from 'react'
import { BiDockLeft } from 'react-icons/bi'
import styles from './index.less'

interface Props {
  width: number;
}

const Index = (props: Props) => {
  const { width } = props
  const { i18n } = useModel('useI18n')

  return (
    <div className={styles.root}>
      <div className={styles.topbar}>
        <div className={styles.left}>
          <span>SwitchHosts!</span>
        </div>
        <div className={styles.right}>
          <span><BiDockLeft onClick={() => agent.broadcast('toggle_left_pannel')}/></span>
        </div>
      </div>

      <div className={styles.list}>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
        <div>list</div>
      </div>

      <div className={styles.status_bar} style={{ width: width - 1 }}>
        <div>
          <span>left</span>
        </div>
        <div className={styles.right}>
          <span>right</span>
        </div>
      </div>
    </div>
  )
}

export default Index
