/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ActionIcon, Box, Center, ScrollArea, Stack } from '@mantine/core'
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
  selectedKeys: IdType[]
  setSelectedKeys: (ids: IdType[]) => void
}

interface Props {
  dataSource: ITransferSourceObject[]
  targetKeys: IdType[]
  render?: (obj: ITransferSourceObject) => React.ReactElement
  onChange?: (nextTargetKeys: IdType[]) => void
}

const Transfer = (props: Props) => {
  const { dataSource, targetKeys, render, onChange } = props
  const { lang } = useI18n()
  const [rightKeys, setRightKeys] = useState<IdType[]>(targetKeys)
  const [leftSelectedKeys, setLeftSelectedKeys] = useState<IdType[]>([])
  const [rightSelectedKeys, setRightSelectedKeys] = useState<IdType[]>([])

  const renderList = (listProps: IListProps) => {
    const { data, selectedKeys, setSelectedKeys } = listProps

    const toggleSelect = (id: IdType) => {
      setSelectedKeys(
        selectedKeys.includes(id) ? selectedKeys.filter((i) => i != id) : [...selectedKeys, id],
      )
    }

    return (
      <ScrollArea h={200} scrollbars="y" type="hover">
        {data.map((item) => {
          if (!item || !item.id) return null
          const isSelected = selectedKeys.includes(item.id)

          return (
            <Box
              key={item.id}
              className={clsx(styles.item, isSelected && styles.selected)}
              px="12px"
              py="4px"
              onClick={() => toggleSelect(item.id)}
            >
              {render ? render(item) : item.title || item.id}
            </Box>
          )
        })}
      </ScrollArea>
    )
  }

  const moveLeftToRight = () => {
    const result = [...rightKeys, ...leftSelectedKeys]
    setRightKeys(result)
    setLeftSelectedKeys([])
    if (onChange) onChange(result)
  }

  const moveRightToLeft = () => {
    const result = rightKeys.filter((i) => !rightSelectedKeys.includes(i))
    setRightKeys(result)
    setRightSelectedKeys([])
    if (onChange) onChange(result)
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
              {leftSelectedKeys.length === 0
                ? dataSource.length
                : `${leftSelectedKeys.length}/${dataSource.length}`}
              )
            </span>
          </Box>
          {renderList({
            data: dataSource.filter((i) => !rightKeys.includes(i.id)),
            selectedKeys: leftSelectedKeys,
            setSelectedKeys: setLeftSelectedKeys,
          })}
        </Box>
        <Center h="100%">
          <Stack gap="8px">
            <ActionIcon
              size="sm"
              variant="outline"
              aria-label="Move to right"
              disabled={leftSelectedKeys.length === 0}
              onClick={moveLeftToRight}
            >
              <IoArrowForward />
            </ActionIcon>
            <ActionIcon
              size="sm"
              variant="outline"
              aria-label="Move to left"
              disabled={rightSelectedKeys.length === 0}
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
              {rightSelectedKeys.length === 0
                ? rightKeys.length
                : `${rightSelectedKeys.length}/${rightKeys.length}`}
              )
            </span>
          </Box>
          {renderList({
            data: rightKeys.map((id) =>
              dataSource.find((i) => i.id === id),
            ) as ITransferSourceObject[],
            selectedKeys: rightSelectedKeys,
            setSelectedKeys: setRightSelectedKeys,
          })}
        </Box>
      </Box>
    </div>
  )
}

export default Transfer
