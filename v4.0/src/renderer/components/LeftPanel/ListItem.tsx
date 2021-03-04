/**
 * ListItem
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { FormOutlined } from '@ant-design/icons'
import ItemIcon from '@renderer/components/ItemIcon'
import SwitchButton from '@renderer/components/SwitchButton'
import { agent } from '@renderer/core/agent'
import { PopupMenu } from '@renderer/core/PopupMenu'
import { HostsListObjectType } from '@root/common/data'
import { updateOneItem } from '@root/common/hostsFn'
import clsx from 'clsx'
import React, { useEffect, useState } from 'react'
import styles from './ListItem.less'

interface Props {
  data: HostsListObjectType;
}

const ListItem = (props: Props) => {
  const { data } = props
  const { lang } = useModel('useI18n')
  const { setCurrentHosts } = useModel('useCurrentHosts')
  const { hosts_data, setList } = useModel('useHostsData')
  const [folder_open, setFolderOpen] = useState(!!data.folder_open)
  const [is_on, setIsOn] = useState(data.on)
  // const [item_height, setItemHeight] = useState(0)

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

  if (!data) return null

  const is_folder = data.where === 'folder'

  const menu = new PopupMenu([
    {
      label: lang.edit,
      click() {
        agent.broadcast('edit_hosts_info', data)
      },
    },
    {
      type: 'separator',
    },
    {
      label: lang.delete,
      click() {
        if (confirm(lang.hosts_delete_confirm)) {
          agent.broadcast('delete_hosts', data.id)
        }
      },
    },
  ])

  return (
    <div
      className={styles.root}
      // className={clsx(styles.item, is_selected && styles.selected, folder_open && styles.folder_open)}
      // style={{ paddingLeft: `${1.3 * level}em` }}
      onContextMenu={() => menu.show()}
    >
      <div className={styles.title} onClick={onSelect}>
        <span
          className={clsx(styles.icon, is_folder && styles.folder)}
          onClick={toggleFolderOpen}
        >
          <ItemIcon where={data.is_sys ? 'system' : data.where} folder_open={data.folder_open}/>
        </span>
        {data.title || lang.untitled}
      </div>
      <div className={styles.status}>
        {data.is_sys ? null : (
          <>
            <div className={styles.edit}>
              <FormOutlined
                title={lang.edit}
                onClick={() => {
                  agent.broadcast('edit_hosts_info', data)
                }}
              />
            </div>
            <SwitchButton on={!!is_on} onChange={(on) => toggleOn(on)}/>
          </>
        )}
      </div>
    </div>
  )
}

export default ListItem
