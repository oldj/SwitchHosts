/**
 * TrashcanItem
 * @author: oldj
 * @homepage: https://oldj.net
 */

import ItemIcon from '@renderer/components/ItemIcon'
import list_item_styles from '@renderer/components/List/ListItem.module.scss'
import { actions } from '@renderer/core/agent'
import { PopupMenu } from '@renderer/core/PopupMenu'
import { ITrashcanListObject } from '@common/data'
import useI18n from '@renderer/models/useI18n'
import clsx from 'clsx'
import React from 'react'
import styles from './TrashcanItem.module.scss'
import useHostsData from '@renderer/models/useHostsData'

interface Props {
  data: ITrashcanListObject
}

const TrashcanItem = (props: Props) => {
  const { data } = props
  const { lang } = useI18n()
  const { hosts_data, loadHostsData } = useHostsData()

  const onSelect = (i: any) => {
    console.log(i)
  }

  const menu_for_all = new PopupMenu([
    {
      label: lang.trashcan_clear,
      enabled: hosts_data.trashcan.length > 0,
      click() {
        if (confirm(lang.trashcan_clear_confirm)) {
          actions
            .clearTrashcan()
            .then(loadHostsData)
            .catch((e) => console.error(e))
        }
      },
    },
  ])

  const menu_for_item = new PopupMenu([
    {
      label: lang.trashcan_restore,
      click() {
        actions.restoreItemFromTrashcan(data.id).then((success) => {
          success && loadHostsData()
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
          actions.deleteItemFromTrashcan(data.id).then((success) => {
            success && loadHostsData()
          })
        }
      },
    },
  ])

  return (
    <div
      className={clsx(styles.root, data.is_root && styles.trashcan_title)}
      onContextMenu={(e) => {
        if (data.is_root) {
          menu_for_all.show()
        } else {
          menu_for_item.show()
        }

        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <div className={styles.title} onClick={onSelect}>
        <span className={list_item_styles.icon}>
          <ItemIcon type={data.type} is_collapsed={true} />
        </span>

        {data.data.title || lang.untitled}

        {data.is_root ? <span className={styles.count}>{data.children?.length || 0}</span> : null}
      </div>
    </div>
  )
}

export default TrashcanItem
