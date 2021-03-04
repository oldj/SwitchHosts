/**
 * ItemIcon
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { BlockOutlined, FileTextOutlined, FolderOpenOutlined, FolderOutlined, GlobalOutlined, HomeOutlined } from '@ant-design/icons'
import React from 'react'

interface Props {
  where?: string;
  is_collapsed?: boolean;
}

const ItemIcon = (props: Props) => {
  const { where, is_collapsed } = props

  switch (where) {
    case 'folder':
      return is_collapsed ?
        <FolderOutlined/> :
        <FolderOpenOutlined/>
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
