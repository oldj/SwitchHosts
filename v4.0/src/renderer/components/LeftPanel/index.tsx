/**
 * LeftPanel
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { PlusOutlined } from '@ant-design/icons'
import List from '@renderer/components/LeftPanel/List'
import { agent } from '@renderer/core/agent'
import { PopupMenu } from '@renderer/core/PopupMenu'
import React from 'react'
import styles from './index.less'

interface Props {
  width: number;
}

const Index = (props: Props) => {
  const { lang } = useModel('useI18n')

  const menu = new PopupMenu([
    {
      label: lang.hosts_add,
      click() {
        agent.broadcast('add_new')
      },
    },
  ])

  return (
    <div className={styles.root}>
      <div className={styles.topbar}>
        <div className={styles.left}>
          {/*<span>SwitchHosts!</span>*/}
        </div>
        <div className={styles.right}>
          <span><PlusOutlined onClick={() => agent.broadcast('add_new')}/></span>
        </div>
      </div>

      <div
        className={styles.list}
        onContextMenu={() => menu.show()}
      >
        <List/>
      </div>
    </div>
  )
}

export default Index
