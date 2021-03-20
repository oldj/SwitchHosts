/**
 * ItemIcon
 * @author: oldj
 * @homepage: https://oldj.net
 */

import React from 'react'
import {
  BiDesktop,
  BiFile,
  BiFolder,
  BiFolderOpen,
  BiGlobe,
  BiLayer,
  BiTrash,
} from 'react-icons/bi'

interface Props {
  type?: string;
  is_collapsed?: boolean;
}

const ItemIcon = (props: Props) => {
  const { type, is_collapsed } = props

  switch (type) {
    case 'folder':
      return is_collapsed ?
        <BiFolder/> :
        <BiFolderOpen/>
    case 'remote':
      return <BiGlobe/>
    case 'group':
      return <BiLayer/>
    case 'system':
      return <BiDesktop/>
    case 'trashcan':
      return <BiTrash/>
    default:
      return <BiFile/>
  }
}

export default ItemIcon
