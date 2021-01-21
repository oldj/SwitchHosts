/**
 * List
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { actions } from '@renderer/agent'
import ListItem from '@renderer/components/LeftPanel/ListItem'
import { HostsDataType } from '@root/common/data'
import React, { useEffect, useState } from 'react'
import styles from './List.less'

interface Props {
}

const List = (props: Props) => {
  const [data, setData] = useState<HostsDataType>({})

  useEffect(() => {
    actions.localDataLoad().then(d => {
      // console.log(d)
      setData(d)
    })
  }, [])

  return (
    <div className={styles.root}>
      {data.list?.map(item => (
        <ListItem data={item} key={item.id}/>
      ))}
    </div>
  )
}

export default List
