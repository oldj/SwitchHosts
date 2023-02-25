/**
 * Transfer
 * @author: oldj
 * @homepage: https://oldj.net
 */

import React, { useEffect, useState } from 'react'
import styles from './Transfer.module.scss'
import useI18n from '@renderer/models/useI18n'
import {
  Checkbox,
  Group,
  TransferList,
  TransferListData,
  TransferListItemComponent,
  TransferListItemComponentProps,
} from '@mantine/core'
import { IHostsListObject } from '@common/data'
import ItemIcon from '@renderer/components/ItemIcon'

type IdType = string

interface Props {
  dataSource: IHostsListObject[]
  targetKeys: IdType[]
  onChange?: (next_target_keys: IdType[]) => void
}

const ItemComponent: TransferListItemComponent = (props: TransferListItemComponentProps) => {
  const { lang } = useI18n()
  const { data, selected } = props
  const { hosts } = data

  return (
    <Group noWrap>
      <div style={{ flex: 1 }}>
        <Group spacing={8}>
          <ItemIcon type={hosts.type} />
          <span>{hosts.title || lang.untitled}</span>
        </Group>
      </div>
      <Checkbox
        checked={selected}
        onChange={() => {}}
        tabIndex={-1}
        sx={{ pointerEvents: 'none' }}
      />
    </Group>
  )
}

const Transfer = (props: Props) => {
  const { dataSource, targetKeys, onChange } = props
  const { lang } = useI18n()
  const [data, setData] = useState<TransferListData>([[], []])

  useEffect(() => {
    let left: TransferListData[number] = []
    dataSource
      .filter((i) => !targetKeys.includes(i.id))
      .forEach((hosts) => {
        left.push({
          value: hosts.id,
          label: '',
          hosts,
        })
      })

    let right: TransferListData[number] = []
    targetKeys.forEach((id) => {
      const hosts = dataSource.find((item) => item.id === id)
      if (hosts) {
        right.push({
          value: hosts.id,
          label: '',
          hosts,
        })
      }
    })
    setData([left, right])
  }, [dataSource, targetKeys])

  const onSave = (new_data: TransferListData) => {
    setData(new_data)
    onChange && onChange(new_data[1].map((item) => item.value))
  }

  return (
    <div className={styles.root}>
      <TransferList
        value={data}
        onChange={onSave}
        searchPlaceholder={lang.search}
        nothingFound={lang.no_record}
        titles={[lang.all, lang.selected]}
        listHeight={300}
        breakpoint="sm"
        itemComponent={ItemComponent}
        filter={(query, item) => {
          return item.hosts.title.toLowerCase().includes(query.toLowerCase().trim())
        }}
      />
    </div>
  )
}

export default Transfer
