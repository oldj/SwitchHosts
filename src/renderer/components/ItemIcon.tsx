/**
 * ItemIcon
 * @author: oldj
 * @homepage: https://oldj.net
 */

import React from 'react'
import {
  IconDeviceDesktop,
  IconFileText,
  IconFolder,
  IconStack2,
  IconTrash,
  IconWorld,
} from '@tabler/icons-react'

interface Props {
  type?: string
  is_collapsed?: boolean
}

const ItemIcon = (props: Props) => {
  const { type, is_collapsed } = props

  switch (type) {
    case 'folder':
      return is_collapsed ? <IconFolder size={16} /> : <IconFolder size={16} />
    case 'remote':
      return <IconWorld size={16} />
    case 'group':
      return <IconStack2 size={16} />
    case 'system':
      return <IconDeviceDesktop size={16} />
    case 'trashcan':
      return <IconTrash size={16} />
    default:
      return <IconFileText size={16} />
  }
}

export default ItemIcon
