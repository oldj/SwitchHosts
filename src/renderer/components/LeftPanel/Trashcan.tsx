/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ITrashcanListObject } from '@common/data'
import { ActionIcon, Tooltip } from '@mantine/core'
import { IconTrashX } from '@tabler/icons-react'
import ConfirmModal from '@renderer/components/ConfirmModal'
import TrashcanItem from '@renderer/components/LeftPanel/TrashcanItem'
import list_styles from '@renderer/components/List/index.module.scss'
import { Tree } from '@renderer/components/Tree'
import { actions } from '@renderer/core/agent'
import {
  getErrorMessage,
  showErrorNotification,
  showSuccessNotification,
} from '@renderer/core/notify'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import { useMemo, useState } from 'react'
import styles from './Trashcan.module.scss'

const Trashcan = () => {
  const { lang } = useI18n()
  const { hostsData, currentHosts, setCurrentHosts, loadHostsData } = useHostsData()
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false)

  const trashList = useMemo<ITrashcanListObject[]>(
    () =>
      hostsData.trashcan.map((i) => ({
        ...i,
        id: i.data.id,
        can_drag: false,
        type: i.data.type,
      })),
    [hostsData.trashcan],
  )

  const onSelect = (ids: string[]) => {
    const id = ids[0]
    const item = hostsData.trashcan.find((i) => i.data.id === id)
    if (!item) return
    setCurrentHosts(item.data)
  }

  const doClearTrashcan = () => {
    actions
      .clearTrashcan()
      .then(async () => {
        await loadHostsData()
        showSuccessNotification({ title: lang.trashcan_clear, message: lang.success })
      })
      .catch((e: unknown) => {
        showErrorNotification({
          title: lang.trashcan_clear,
          message: getErrorMessage(e, lang.fail),
        })
      })
  }

  const isEmpty = hostsData.trashcan.length === 0

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.header_title}>{lang.trashcan}</span>
        <Tooltip label={lang.trashcan_clear} position="bottom">
          <ActionIcon
            variant="subtle"
            color="red"
            size={24}
            onClick={() => setIsClearConfirmOpen(true)}
            disabled={isEmpty}
            aria-label={lang.trashcan_clear}
          >
            <IconTrashX size={16} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
      </div>

      <div className={styles.body}>
        {isEmpty ? (
          <div className={styles.empty}>{lang.trashcan_empty}</div>
        ) : (
          <Tree
            data={trashList}
            nodeRender={(item) => <TrashcanItem data={item as ITrashcanListObject} />}
            nodeClassName={list_styles.node}
            nodeSelectedClassName={list_styles.node_selected}
            nodeCollapseArrowClassName={list_styles.arrow}
            onSelect={onSelect}
            selectedIds={currentHosts ? [currentHosts.id] : []}
          />
        )}
      </div>

      <ConfirmModal
        opened={isClearConfirmOpen}
        onClose={() => setIsClearConfirmOpen(false)}
        onConfirm={doClearTrashcan}
        title={lang.trashcan_clear}
        message={lang.trashcan_clear_confirm}
        confirmLabel={lang.delete}
        danger
      />
    </div>
  )
}

export default Trashcan
