/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { IHostsListObject } from '@common/data'
import events from '@common/events'
import { IMenuItemOption } from '@common/types'
import { ActionIcon } from '@mantine/core'
import ItemIcon from '@renderer/components/ItemIcon'
import SwitchButton from '@renderer/components/SwitchButton'
import { actions, agent } from '@renderer/core/agent'
import { PopupMenu } from '@renderer/core/PopupMenu'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import { IconEdit } from '@tabler/icons-react'
import clsx from 'clsx'
import React, { useEffect, useRef, useState } from 'react'
import scrollIntoView from 'smooth-scroll-into-view-if-needed'
import styles from './ListItem.module.scss'

interface Props {
  data: IHostsListObject
  selectedIds: string[]
  isTray?: boolean
}

const ListItem = (props: Props) => {
  const { data, isTray, selectedIds } = props
  const { lang, i18n } = useI18n()
  const { currentHosts, setCurrentHosts } = useHostsData()
  const [isOn, setIsOn] = useState(data.on)
  const el = useRef<HTMLDivElement>(null)
  // const [item_height, setItemHeight] = useState(0)
  const refToastRefresh = useRef<string | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror prop into local optimistic state
    setIsOn(data.on)
  }, [data])

  // Roll-back signal from List/index.tsx::onToggleItem. The optimistic
  // toggle in `toggleOn` flips `isOn` locally before the apply round
  // trip starts. When the apply fails (e.g. user dismissed the OS auth
  // prompt), `loadHostsData` reloads manifest.json — but if the apply
  // never persisted, the reloaded `data.on` matches the previous value
  // and Tree/Node's deep-equal `React.memo` skips re-rendering, so the
  // useEffect above never re-fires. Subscribing here gives us an
  // explicit rollback path that bypasses the memo.
  useOnBroadcast(
    events.set_hosts_on_status,
    (id: string, on: boolean) => {
      if (id === data.id) {
        setIsOn(on)
      }
    },
    [data.id],
  )

  useEffect(() => {
    const isSelected = data.id === currentHosts?.id

    if (isSelected && el.current) {
      // el.current.scrollIntoViewIfNeeded()
      scrollIntoView(el.current, {
        behavior: 'smooth',
        scrollMode: 'if-needed',
      })
    }
  }, [data, currentHosts, el])

  const onSelect = () => {
    if (isTray) return
    setCurrentHosts(data.is_sys ? null : data)
  }

  const toggleOn = (on?: boolean) => {
    on = typeof on === 'boolean' ? on : !isOn
    setIsOn(on)

    agent.broadcast(events.toggle_item, data.id, on)
  }

  if (!data) return null

  const isFolder = data.type === 'folder'
  const isSelected = data.id === currentHosts?.id
  const title = data.title || lang.untitled

  return (
    <div
      className={clsx(styles.root, isSelected && styles.selected, isTray && styles.isTray)}
      // className={clsx(styles.item, isSelected && styles.selected, isCollapsed && styles.isCollapsed)}
      // style={{ paddingLeft: `${1.3 * level}em` }}
      onContextMenu={(e) => {
        let dealCount = 1
        if (selectedIds.includes(data.id)) {
          dealCount = selectedIds.length
        }

        let menuItems: IMenuItemOption[] = [
          {
            label: lang.edit,
            click() {
              agent.broadcast(events.edit_hosts_info, data)
            },
          },
          {
            label: lang.refresh,
            async click() {
              refToastRefresh.current = `${Date.now()}`

              actions
                .refreshHosts(data.id)
                .then((r) => {
                  if (!r.success) {
                    console.error(r.message || r.code || 'Error!')
                    return
                  }
                })
                .catch((e) => {
                  console.error(e.message)
                })
                .finally(() => {
                  if (refToastRefresh.current) {
                    refToastRefresh.current = null
                  }
                })
            },
          },
          {
            type: 'separator',
          },
          {
            label:
              dealCount === 1
                ? lang.move_to_trashcan
                : i18n.trans('move_items_to_trashcan', [dealCount.toLocaleString()]),
            click() {
              const ids = dealCount === 1 ? [data.id] : selectedIds
              agent.broadcast(events.move_to_trashcan, ids)
            },
          },
        ]

        if (data.type !== 'remote') {
          menuItems = menuItems.filter((i) => i.label !== lang.refresh)
        }

        const menu = new PopupMenu(menuItems)

        if (!data.is_sys && !isTray) menu.show()
        e.preventDefault()
        e.stopPropagation()
      }}
      ref={el}
      onClick={(e: React.MouseEvent) => {
        if (isTray) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
    >
      <div
        className={styles.title}
        onClick={onSelect}
        onDoubleClick={() => {
          if (!isTray) return
          agent.broadcast(events.select_hosts, data.id, 1000)
          agent.broadcast(events.active_main_window)
        }}
      >
        <span className={clsx(styles.icon, isFolder && styles.folder)}>
          <ItemIcon type={data.is_sys ? 'system' : data.type} isCollapsed={data.is_collapsed} />
        </span>
        <span className={styles.label} title={title}>
          {title}
        </span>
      </div>
      <div className={styles.status}>
        {data.is_sys ? null : (
          <>
            <div className={styles.edit}>
              <ActionIcon
                variant="subtle"
                onClick={() => {
                  agent.broadcast(events.edit_hosts_info, data)
                }}
                size={24}
              >
                <IconEdit size={16} stroke={1.5} />
              </ActionIcon>
            </div>
            <SwitchButton on={!!isOn} onChange={(on) => toggleOn(on)} />
          </>
        )}
      </div>
    </div>
  )
}

export default ListItem
