/**
 * ListItem
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import ItemIcon from '@renderer/components/ItemIcon'
import SwitchButton from '@renderer/components/LeftPanel/SwitchButton'
import { flattern, updateOneItem } from '@renderer/libs/hostsFn'
import { HostsObjectType } from '@root/common/data'
import clsx from 'clsx'
import React, { useRef, useState } from 'react'
import { BiChevronRight, BiFile, BiFolder, BiFolderOpen, BiGlobe, BiOutline } from 'react-icons/bi'
import styles from './ListItem.less'

interface Props {
  data: HostsObjectType;
  level?: number;
}

const ListItem = (props: Props) => {
  const { data } = props
  const { i18n } = useModel('useI18n')
  const { current_hosts, setCurrentHosts } = useModel('useCurrentHosts')
  const { hosts_data, setList } = useModel('useHostsData')
  const [folder_open, setFolderOpen] = useState(!!data.folder_open)
  const el_item = useRef<HTMLDivElement>(null)

  const onSelect = () => {
    setCurrentHosts(data)
  }

  const toggleFolderOpen = () => {
    if (!is_folder) return

    const is_open = !folder_open
    setFolderOpen(is_open)

    setList(updateOneItem(hosts_data.list, { ...data, folder_open: is_open }))
      .catch(e => console.error(e))
  }

  const getElItemHeight = () => {
    return el_item.current ? el_item.current.offsetHeight : 0
  }

  if (!data) return null

  let level = props.level || 0
  const is_selected = current_hosts?.id === data.id
  const is_folder = data.where === 'folder'
  const children_count = flattern(data.children || []).length

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
              <BiChevronRight/>
            </span>
          ) : null}
          <span
            className={clsx(styles.icon, is_folder && styles.folder)}
            onClick={toggleFolderOpen}
          ><ItemIcon data={data}/></span>
          {data.title || i18n.lang.untitled}
        </div>
        <div className={styles.status}>
          <SwitchButton on={data.on}/>
        </div>
      </div>
      <div className={styles.children} style={{ height: folder_open ? getElItemHeight() * children_count : 0 }}>
        {(data.children || []).map(item => (
          <ListItem data={item} key={item.id} level={level + 1}/>
        ))}
      </div>
    </div>
  )
}

export default ListItem
