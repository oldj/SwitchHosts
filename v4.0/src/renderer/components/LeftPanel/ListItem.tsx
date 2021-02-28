/**
 * ListItem
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { RightOutlined } from '@ant-design/icons'
import ItemIcon from '@renderer/components/ItemIcon'
import SwitchButton from '@renderer/components/SwitchButton'
import { agent } from '@renderer/core/agent'
import { HostsListObjectType } from '@root/common/data'
import { updateOneItem } from '@root/common/hostsFn'
import clsx from 'clsx'
import React, { useEffect, useRef, useState } from 'react'
import styles from './ListItem.less'

interface Props {
  data: HostsListObjectType;
  level?: number;
}

const ListItem = (props: Props) => {
  const { data } = props
  const { i18n } = useModel('useI18n')
  const { current_hosts, setCurrentHosts } = useModel('useCurrentHosts')
  const { hosts_data, setList } = useModel('useHostsData')
  const [folder_open, setFolderOpen] = useState(!!data.folder_open)
  const [is_on, setIsOn] = useState(data.on)
  // const [item_height, setItemHeight] = useState(0)
  const el_item = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setIsOn(data.on)
  }, [data])

  // useEffect(() => {
  //   if (folder_open) {
  //     getElItemHeight()
  //   }
  // }, [folder_open])

  const onSelect = () => {
    setCurrentHosts(data)
  }

  const toggleFolderOpen = () => {
    if (!is_folder) return

    const is_open = !folder_open
    setFolderOpen(is_open)

    setList(updateOneItem(hosts_data.list, { id: data.id, folder_open: is_open }))
      .catch(e => console.error(e))
  }

  const toggleOn = (on?: boolean) => {
    on = typeof on === 'boolean' ? on : !is_on
    setIsOn(on)

    agent.broadcast('toggle_item', data.id, on)
  }

  // const getElItemHeight = () => {
  //   let h = el_item.current ? el_item.current.offsetHeight : 0
  //   if (!h) {
  //     setTimeout(getElItemHeight, 100)
  //     return
  //   }
  //
  //   setItemHeight(h)
  // }

  if (!data) return null

  let level = props.level || 0
  const is_selected = current_hosts?.id === data.id
  const is_folder = data.where === 'folder'
  // const children_count = flatten(data.children || []).length
  // const children_height = folder_open ? (item_height ? item_height * children_count : 0) : 0

  return (
    <div className={styles.root}>
      <div
        ref={el_item}
        className={clsx(styles.item, is_selected && styles.selected, folder_open && styles.folder_open)}
        style={{ paddingLeft: `${1.3 * level}em` }}
      >
        <div className={styles.title} onClick={onSelect}>
          {is_folder ? (
            <span className={styles.folder_arrow} onClick={toggleFolderOpen}>
              <RightOutlined/>
            </span>
          ) : null}
          <span
            className={clsx(styles.icon, is_folder && styles.folder)}
            onClick={toggleFolderOpen}
          ><ItemIcon where={data.where} folder_open={data.folder_open}/></span>
          {data.title || i18n.lang.untitled}
        </div>
        <div className={styles.status}>
          <SwitchButton on={!!is_on} onChange={(on) => toggleOn(on)}/>
        </div>
      </div>
      <div
        className={styles.children}
        style={{ height: folder_open ? 'auto' : 0 }}
      >
        {(data.children || []).map(item => (
          <ListItem data={item} key={item.id} level={level + 1}/>
        ))}
      </div>
    </div>
  )
}

export default ListItem
