/**
 * ListItem
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import SwitchButton from '@renderer/components/LeftPanel/SwitchButton'
import { HostsObjectType } from '@root/common/data'
import clsx from 'clsx'
import React, { useState } from 'react'
import { BiFile, BiFolder, BiFolderOpen, BiGlobe, BiOutline, BiChevronRight } from 'react-icons/bi'
import styles from './ListItem.less'

interface Props {
  data: HostsObjectType;
  level?: number;
}

const ListItem = (props: Props) => {
  const { data } = props
  const { i18n } = useModel('useI18n')
  const { current_hosts, setCurrentHosts } = useModel('useCurrentHosts')
  const [folder_open, setFolderOpen] = useState(!!data.folder_open)

  const onSelect = () => {
    setCurrentHosts(data)
  }

  const getIcon = () => {
    switch (data.where) {
      case 'folder':
        return folder_open ? <BiFolderOpen/> : <BiFolder/>
      case 'remote':
        return <BiGlobe/>
      case 'group':
        return <BiOutline/>
      default:
        return <BiFile/>
    }
  }

  if (!data) return null

  let level = props.level || 0
  const is_selected = current_hosts?.id === data.id
  const is_folder = data.where === 'folder'

  return (
    <div className={styles.root}>
      <div
        className={clsx(styles.item, is_selected && styles.selected, folder_open && styles.folder_open)}
        style={{ paddingLeft: `${level}em` }}
      >
        <div className={styles.title} onClick={onSelect}>
          {is_folder ? (
            <span className={styles.folder_arrow} onClick={() => setFolderOpen(!folder_open)}>
              <BiChevronRight/>
            </span>
          ) : null}
          <span
            className={clsx(styles.icon, is_folder && styles.folder)}
            onClick={() => {
              is_folder && setFolderOpen(!folder_open)
            }}
          >{getIcon()}</span>
          {data.title || i18n.lang.untitled}
        </div>
        <div className={styles.status}>
          <SwitchButton on={data.on}/>
        </div>
      </div>
      <div className={styles.children}>
        {folder_open ? (data.children || []).map(item => (
          <ListItem data={item} key={item.id} level={level + 1}/>
        )) : null}
      </div>
    </div>
  )
}

export default ListItem
