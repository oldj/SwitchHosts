/**
 * LeftPanel
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { agent } from '@renderer/core/agent'
import List from '@renderer/components/LeftPanel/List'
import React from 'react'
import { BiPlus } from 'react-icons/bi'
import styles from './index.less'

interface Props {
  width: number;
}

const Index = (props: Props) => {
  return (
    <div className={styles.root}>
      <div className={styles.topbar}>
        <div className={styles.left}>
          {/*<span>SwitchHosts!</span>*/}
        </div>
        <div className={styles.right}>
          <span><BiPlus onClick={() => agent.broadcast('add_new')}/></span>
        </div>
      </div>

      <div className={styles.list}>
        <List/>
      </div>
    </div>
  )
}

export default Index
