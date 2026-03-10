/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ActionIcon, Box, Center, Stack } from '@mantine/core'
import clsx from 'clsx'
import React, { useState } from 'react'
import { IoArrowBack, IoArrowForward } from 'react-icons/io5'
import useI18n from '../models/useI18n'
import styles from './Transfer.module.scss'

type IdType = string

interface ITransferSourceObject {
  id: IdType

  [key: string]: any
}

interface IListProps {
  data: ITransferSourceObject[]
  selected_keys: IdType[]
  setSelectedKeys: (ids: IdType[]) => void
}

interface Props {
  dataSource: ITransferSourceObject[]
  targetKeys: IdType[]
  render?: (obj: ITransferSourceObject) => React.ReactElement
  onChange?: (next_target_keys: IdType[]) => void
}

const Transfer = (props: Props) => {
  const { dataSource, targetKeys, render, onChange } = props
  const { lang } = useI18n()
  const [right_keys, setRightKeys] = useState<IdType[]>(targetKeys)
  const [left_selected_keys, setLeftSelectedKeys] = useState<IdType[]>([])
  const [right_selected_keys, setRightSelectedKeys] = useState<IdType[]>([])

  const List = (list_props: IListProps) => {
    const { data, selected_keys, setSelectedKeys } = list_props

    const toggleSelect = (id: IdType) => {
      setSelectedKeys(
        selected_keys.includes(id) ? selected_keys.filter((i) => i != id) : [...selected_keys, id],
      )
    }

    return (
      <div className={styles.list}>
        {data.map((item) => {
          if (!item || !item.id) return null
          const is_selected = selected_keys.includes(item.id)

          return (
            <Box
              key={item.id}
              className={clsx(styles.item, is_selected && styles.selected)}
              px="12px"
              py="4px"
              onClick={() => toggleSelect(item.id)}
            >
              {render ? render(item) : item.title || item.id}
            </Box>
          )
        })}
      </div>
    )
  }

  const moveLeftToRight = () => {
    let result = [...right_keys, ...left_selected_keys]
    setRightKeys(result)
    setLeftSelectedKeys([])
    onChange && onChange(result)
  }

  const moveRightToLeft = () => {
    let result = right_keys.filter((i) => !right_selected_keys.includes(i))
    setRightKeys(result)
    setRightSelectedKeys([])
    onChange && onChange(result)
  }

  return (
    <div className={styles.root}>
      <Box
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 40px minmax(0, 1fr)',
          gap: 4,
        }}
      >
        <Box style={{ border: '1px solid var(--swh-border-color-0)', borderRadius: 6 }}>
          <Box
            className={styles.title}
            px="12px"
            py="4px"
            style={{ borderBottom: '1px solid var(--swh-border-color-0)' }}
          >
            {lang.all}{' '}
            <span>
              (
              {left_selected_keys.length === 0
                ? dataSource.length
                : `${left_selected_keys.length}/${dataSource.length}`}
              )
            </span>
          </Box>
          <List
            data={dataSource.filter((i) => !right_keys.includes(i.id))}
            selected_keys={left_selected_keys}
            setSelectedKeys={setLeftSelectedKeys}
          />
        </Box>
        <Center h="100%">
          <Stack gap="8px">
            <ActionIcon
              size="sm"
              variant="outline"
              aria-label="Move to right"
              disabled={left_selected_keys.length === 0}
              onClick={moveLeftToRight}
            >
              <IoArrowForward />
            </ActionIcon>
            <ActionIcon
              size="sm"
              variant="outline"
              aria-label="Move to left"
              disabled={right_selected_keys.length === 0}
              onClick={moveRightToLeft}
            >
              <IoArrowBack />
            </ActionIcon>
          </Stack>
        </Center>
        <Box style={{ border: '1px solid var(--swh-border-color-0)', borderRadius: 6 }}>
          <Box
            className={styles.title}
            px="12px"
            py="4px"
            style={{ borderBottom: '1px solid var(--swh-border-color-0)' }}
          >
            {lang.selected}{' '}
            <span>
              (
              {right_selected_keys.length === 0
                ? right_keys.length
                : `${right_selected_keys.length}/${right_keys.length}`}
              )
            </span>
          </Box>
          <List
            data={
              right_keys.map((id) => dataSource.find((i) => i.id === id)) as ITransferSourceObject[]
            }
            selected_keys={right_selected_keys}
            setSelectedKeys={setRightSelectedKeys}
          />
        </Box>
      </Box>
    </div>
  )
}

export default Transfer
