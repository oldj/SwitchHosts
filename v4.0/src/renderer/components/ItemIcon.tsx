/**
 * ItemIcon
 * @author: oldj
 * @homepage: https://oldj.net
 */

import React from 'react'
import { BiFile, BiFolder, BiFolderOpen, BiGlobe, BiHome, BiOutline } from 'react-icons/bi'

interface Props {
  where: string;
  folder_open?: boolean;
}

const ItemIcon = (props: Props) => {
  const { where, folder_open } = props

  switch (where) {
    case 'folder':
      return folder_open ? <BiFolderOpen/> : <BiFolder/>
    case 'remote':
      return <BiGlobe/>
    case 'group':
      return <BiOutline/>
    case 'system':
      return <BiHome/>
    default:
      return <BiFile/>
  }
}

export default ItemIcon
