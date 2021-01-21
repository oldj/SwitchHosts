/**
 * ItemIcon
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { HostsObjectType } from '@root/common/data'
import React from 'react'
import { BiFile, BiFolder, BiFolderOpen, BiGlobe, BiOutline } from 'react-icons/bi'

interface Props {
  data: HostsObjectType;
  ignore_folder_open?: boolean;
}

const ItemIcon = (props: Props) => {
  const { data, ignore_folder_open } = props

  switch (data.where) {
    case 'folder':
      return data.folder_open && !ignore_folder_open ? <BiFolderOpen/> : <BiFolder/>
    case 'remote':
      return <BiGlobe/>
    case 'group':
      return <BiOutline/>
    default:
      return <BiFile/>
  }
}

export default ItemIcon
