/**
 * ItemIcon
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { BlockOutlined, FileTextOutlined, FolderOpenOutlined, FolderOutlined, GlobalOutlined, HomeOutlined } from '@ant-design/icons'
import React from 'react'

interface Props {
  where: string;
  folder_open?: boolean;
}

const ItemIcon = (props: Props) => {
  const { where, folder_open } = props

  switch (where) {
    case 'folder':
      return folder_open ?
        <FolderOpenOutlined/> :
        <FolderOutlined/>
    case 'remote':
      return <GlobalOutlined/>
    case 'group':
      return <BlockOutlined/>
    case 'system':
      return <HomeOutlined/>
    default:
      return <FileTextOutlined/>
  }
}

export default ItemIcon
