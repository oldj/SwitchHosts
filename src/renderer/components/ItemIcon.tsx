/**
 * ItemIcon
 * @author: oldj
 * @homepage: https://oldj.net
 */

import {
  IconComponents,
  IconDeviceDesktop,
  IconFileDescription,
  IconFolder,
  IconTrash,
  IconWorld,
} from '@tabler/icons-react'
import React from 'react'

interface Props {
  type?: string
  is_collapsed?: boolean
}

const ItemIcon = (props: Props) => {
  const { type, is_collapsed } = props
  let icon: React.ReactNode

  switch (type) {
    case 'folder':
      icon = is_collapsed ? (
        <IconFolder size={16} stroke={1.5} />
      ) : (
        <IconFolder size={16} stroke={1.5} />
      )
      break
    case 'remote':
      icon = <IconWorld size={16} stroke={1.5} />
      break
    case 'group':
      icon = <IconComponents size={16} stroke={1.5} />
      break
    case 'system':
      icon = <IconDeviceDesktop size={16} stroke={1.5} />
      break
    case 'trashcan':
      icon = <IconTrash size={16} stroke={1.5} />
      break
    default:
      icon = <IconFileDescription size={16} stroke={1.5} />
  }

  return <div>{icon}</div>
}

export default ItemIcon
