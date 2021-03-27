/**
 * LeftPanel
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import Trashcan from '@renderer/components/LeftPanel/Trashcan'
import List from '@renderer/components/List'
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
    <div
      className={styles.list}
      onContextMenu={() => menu.show()}
    >
      <List/>
      <Trashcan/>
    </div>
  )
}

export default Index
