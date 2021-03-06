/**
 * TrashcanItem
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import ItemIcon from '@renderer/components/ItemIcon'
import { actions, agent } from '@renderer/core/agent'
import { PopupMenu } from '@renderer/core/PopupMenu'
import { ITrashcanListObject } from '@root/common/data'
import clsx from 'clsx'
import React from 'react'
import list_item_styles from './ListItem.less'
import styles from './TrashcanItem.less'

interface Props {
  data: ITrashcanListObject;
}

const TrashcanItem = (props: Props) => {
  const { data } = props
  const { lang } = useModel('useI18n')
  const { loadHostsData } = useModel('useHostsData')

  const onSelect = (i: any) => {
    console.log(i)
  }

  const menu_for_all = new PopupMenu([
    {
      label: lang.trashcan_clear,
      click() {
        if (confirm(lang.trashcan_clear_confirm)) {
          agent.broadcast('trashcan_clear', data.id)
        }
      },
    },
  ])

  const menu_for_item = new PopupMenu([
    {
      label: lang.trashcan_restore,
      click() {
        // agent.broadcast('trashcan_restore', data.id)
        actions.localTrashcanItemRestore(data.id)
          .then(success => {
            console.log(success)
            if (success) {
              loadHostsData()
            }
          })
      },
    },
    {
      type: 'separator',
    },
    {
      label: lang.hosts_delete,
      click() {
        if (confirm(lang.trashcan_delete_confirm)) {
          agent.broadcast('delete_hosts', data.id)
        }
      },
    },
  ])

  return (
    <div
      className={clsx(styles.root, data.is_root && styles.trashcan_title)}
      onContextMenu={() => {
        if (data.is_root) {
          menu_for_all.show()
        } else {
          menu_for_item.show()
        }
      }}
    >
      <div className={styles.title} onClick={onSelect}>
        <span className={list_item_styles.icon}>
          <ItemIcon where={data.where} is_collapsed={data.is_collapsed}/>
        </span>
        {data.data.title || lang.untitled}

        {data.is_root ? (
          <span className={styles.count}>{data.children?.length || 0}</span>
        ) : null}
      </div>
    </div>
  )
}

export default TrashcanItem
