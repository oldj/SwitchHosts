/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import {
  IconDeviceDesktop,
  IconFileText,
  IconFolder,
  IconFolderOpen,
  IconStack2,
  IconTrash,
  IconWorld,
} from '@tabler/icons-react'

interface Props {
  type?: string
  isCollapsed?: boolean
}

const ItemIcon = (props: Props) => {
  const { type, isCollapsed } = props

  const iconAttrs = {
    size: 16,
    stroke: 1.5,
  }

  switch (type) {
    case 'folder':
      return isCollapsed ? <IconFolder {...iconAttrs} /> : <IconFolderOpen {...iconAttrs} />
    case 'remote':
      return <IconWorld {...iconAttrs} />
    case 'group':
      return <IconStack2 {...iconAttrs} />
    case 'system':
      return <IconDeviceDesktop {...iconAttrs} />
    case 'trashcan':
      return <IconTrash {...iconAttrs} />
    default:
      return <IconFileText {...iconAttrs} />
  }
}

export default ItemIcon
