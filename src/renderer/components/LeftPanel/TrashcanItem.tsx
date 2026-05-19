/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ITrashcanListObject } from '@common/data'
import ConfirmModal from '@renderer/components/ConfirmModal'
import ItemIcon from '@renderer/components/ItemIcon'
import list_item_styles from '@renderer/components/List/ListItem.module.scss'
import { actions } from '@renderer/core/agent'
import {
  getErrorMessage,
  showErrorNotification,
  showSuccessNotification,
} from '@renderer/core/notify'
import { PopupMenu } from '@renderer/core/PopupMenu'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import { useState } from 'react'
import styles from './TrashcanItem.module.scss'

interface Props {
  data: ITrashcanListObject
}

const TrashcanItem = (props: Props) => {
  const { data } = props
  const { lang } = useI18n()
  const { loadHostsData } = useHostsData()
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)

  const doPermanentDelete = () => {
    actions
      .deleteItemFromTrashcan(data.id)
      .then(async (success: boolean) => {
        if (!success) {
          showErrorNotification({ title: lang.hosts_delete, message: lang.fail })
          return
        }
        await loadHostsData()
        showSuccessNotification({ title: lang.hosts_delete, message: lang.success })
      })
      .catch((e: unknown) => {
        showErrorNotification({
          title: lang.hosts_delete,
          message: getErrorMessage(e, lang.fail),
        })
      })
  }

  const doRestore = () => {
    actions
      .restoreItemFromTrashcan(data.id)
      .then(async (success: boolean) => {
        if (!success) {
          showErrorNotification({ title: lang.trashcan_restore, message: lang.fail })
          return
        }
        await loadHostsData()
        showSuccessNotification({ title: lang.trashcan_restore, message: lang.success })
      })
      .catch((e: unknown) => {
        showErrorNotification({
          title: lang.trashcan_restore,
          message: getErrorMessage(e, lang.fail),
        })
      })
  }

  const menuForItem = new PopupMenu([
    {
      label: lang.trashcan_restore,
      click() {
        doRestore()
      },
    },
    {
      type: 'separator',
    },
    {
      label: lang.hosts_delete,
      click() {
        setIsDeleteConfirmOpen(true)
      },
    },
  ])

  return (
    <div
      className={styles.root}
      onContextMenu={(e) => {
        menuForItem.show()
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <div className={styles.title}>
        <span className={list_item_styles.icon}>
          <ItemIcon type={data.type} isCollapsed={true} />
        </span>

        {data.data.title || lang.untitled}
      </div>

      <ConfirmModal
        opened={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={doPermanentDelete}
        title={lang.hosts_delete}
        message={lang.trashcan_delete_confirm}
        confirmLabel={lang.delete}
        danger
      />
    </div>
  )
}

export default TrashcanItem
