/**
 * ItemIcon
 * @author: oldj
 * @homepage: https://oldj.net
 */

import DescriptionOutlinedIcon from '@material-ui/icons/DescriptionOutlined'
import FolderOpenOutlinedIcon from '@material-ui/icons/FolderOpenOutlined'
import FolderOutlinedIcon from '@material-ui/icons/FolderOutlined'
import HomeOutlinedIcon from '@material-ui/icons/HomeOutlined'
import LanguageOutlinedIcon from '@material-ui/icons/LanguageOutlined'
import LibraryBooksOutlinedIcon from '@material-ui/icons/LibraryBooksOutlined'
import React from 'react'

interface Props {
  where: string;
  folder_open?: boolean;
  size?: 'small' | 'large' | number | null;
}

const ItemIcon = (props: Props) => {
  const { where, folder_open, size } = props

  const props2: any = {}
  const style: any = {}
  if (typeof size === 'string') {
    props2.fontSize = size
  } else if (typeof size === 'number') {
    style.fontSize = size
  }
  props2.style = style

  switch (where) {
    case 'folder':
      return folder_open ?
        <FolderOpenOutlinedIcon {...props2}/> :
        <FolderOutlinedIcon {...props2}/>
    case 'remote':
      return <LanguageOutlinedIcon {...props2}/>
    case 'group':
      return <LibraryBooksOutlinedIcon {...props2}/>
    case 'system':
      return <HomeOutlinedIcon {...props2}/>
    default:
      return <DescriptionOutlinedIcon {...props2}/>
  }
}

export default ItemIcon
