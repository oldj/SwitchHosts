/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

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

  const iconAttrs = {
    size: 16,
    stroke: 1.5,
  }

  switch (type) {
    case 'folder':
      return is_collapsed ? <IconFolder {...iconAttrs} /> : <IconFolder {...iconAttrs} />
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
