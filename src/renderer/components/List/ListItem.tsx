/**
 * ListItem
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import ItemIcon from '@renderer/components/ItemIcon'
import SwitchButton from '@renderer/components/SwitchButton'
import { agent } from '@renderer/core/agent'
import { PopupMenu } from '@renderer/core/PopupMenu'
import { IHostsListObject } from '@root/common/data'
import { updateOneItem } from '@root/common/hostsFn'
import clsx from 'clsx'
import React, { useEffect, useRef, useState } from 'react'
import { BiEdit } from 'react-icons/bi'
import { Center } from '@chakra-ui/react'
import scrollIntoView from 'smooth-scroll-into-view-if-needed'
import styles from './ListItem.less'
import events from '@root/common/events'

interface Props {
  data: IHostsListObject
  selected_ids: string[]
  is_tray?: boolean
}

const ListItem = (props: Props) => {
  const { data, is_tray, selected_ids } = props
  const { lang, i18n } = useModel('useI18n')
  const { hosts_data, setList, current_hosts, setCurrentHosts } =
    useModel('useHostsData')
  const [is_collapsed, setIsCollapsed] = useState(!!data.is_collapsed)
  const [is_on, setIsOn] = useState(data.on)
  const el = useRef<HTMLDivElement>(null)
  // const [item_height, setItemHeight] = useState(0)

  useEffect(() => {
    setIsOn(data.on)
  }, [data])

  useEffect(() => {
    const is_selected = data.id === current_hosts?.id

    if (is_selected && el.current) {
      // el.current.scrollIntoViewIfNeeded()
      scrollIntoView(el.current, {
        behavior: 'smooth',
        scrollMode: 'if-needed',
      })
    }
  }, [data, current_hosts, el])

  const onSelect = () => {
    setCurrentHosts(data.is_sys ? null : data)
  }

  const toggleIsCollapsed = () => {
    if (!is_folder) return

    let _is_collapsed = !is_collapsed
    setIsCollapsed(_is_collapsed)
    setList(
      updateOneItem(hosts_data.list, {
        id: data.id,
        is_collapsed: _is_collapsed,
      }),
    ).catch((e) => console.error(e))
  }

  const toggleOn = (on?: boolean) => {
    on = typeof on === 'boolean' ? on : !is_on
    setIsOn(on)

    agent.broadcast(events.toggle_item, data.id, on)
  }

  if (!data) return null

  const is_folder = data.type === 'folder'
  const is_selected = data.id === current_hosts?.id

  return (
    <div
      className={clsx(
        styles.root,
        is_selected && styles.selected,
        is_tray && styles.is_tray,
      )}
      // className={clsx(styles.item, is_selected && styles.selected, is_collapsed && styles.is_collapsed)}
      // style={{ paddingLeft: `${1.3 * level}em` }}
      onContextMenu={(e) => {
        let deal_count = 1
        if (selected_ids.includes(data.id)) {
          deal_count = selected_ids.length
        }

        const menu = new PopupMenu([
          {
            label: lang.edit,
            click() {
              agent.broadcast(events.edit_hosts_info, data)
            },
          },
          {
            type: 'separator',
          },
          {
            label:
              deal_count === 1
                ? lang.move_to_trashcan
                : i18n.trans('move_items_to_trashcan', [
                    deal_count.toLocaleString(),
                  ]),
            click() {
              let ids = deal_count === 1 ? [data.id] : selected_ids
              agent.broadcast(events.move_to_trashcan, ids)
            },
          },
        ])

        !data.is_sys && !is_tray && menu.show()
        e.preventDefault()
        e.stopPropagation()
      }}
      ref={el}
      onClick={(e: React.MouseEvent) => {
        if (is_tray) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
    >
      <div className={styles.title} onClick={onSelect}>
        <span
          className={clsx(styles.icon, is_folder && styles.folder)}
          onClick={toggleIsCollapsed}
        >
          <ItemIcon
            type={data.is_sys ? 'system' : data.type}
            is_collapsed={data.is_collapsed}
          />
        </span>
        {data.title || lang.untitled}
      </div>
      <div className={styles.status}>
        {data.is_sys ? null : (
          <>
            <div className={styles.edit}>
              <Center h="var(--swh-tree-row-height)">
                <BiEdit
                  title={lang.edit}
                  onClick={() => {
                    agent.broadcast(events.edit_hosts_info, data)
                  }}
                />
              </Center>
            </div>
            <SwitchButton on={!!is_on} onChange={(on) => toggleOn(on)} />
          </>
        )}
      </div>
    </div>
  )
}

export default ListItem
