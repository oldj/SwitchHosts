/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import events from '@common/events'
import { ScrollArea } from '@mantine/core'
import Trashcan from '@renderer/components/LeftPanel/Trashcan'
import List from '@renderer/components/List'
import { agent } from '@renderer/core/agent'
import { PopupMenu } from '@renderer/core/PopupMenu'
import useI18n from '@renderer/models/useI18n'
import { leftPanelViewAtom } from '@renderer/stores/ui'
import { useAtomValue } from 'jotai'
import styles from './index.module.scss'

interface Props {
  width: number
}

const Index = (_props: Props) => {
  const { lang } = useI18n()
  const view = useAtomValue(leftPanelViewAtom)

  const menu = new PopupMenu([
    {
      label: lang.hosts_add,
      click() {
        agent.broadcast(events.add_new)
      },
    },
  ])

  return (
    <div
      className={styles.root}
      onContextMenu={() => {
        if (view === 'list') menu.show()
      }}
    >
      <ScrollArea className={styles.content} scrollbars="y" type="hover">
        {view === 'list' ? <List /> : <Trashcan />}
      </ScrollArea>
      <div className={styles.status_bar} />
    </div>
  )
}

export default Index
