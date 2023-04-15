/**
 * Transfer
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { IoArrowBack, IoArrowForward } from 'react-icons/io5'
import { Box, Center, Grid, IconButton, VStack } from '@chakra-ui/react'
import React, { useState } from 'react'
import clsx from 'clsx'
import styles from './Transfer.module.scss'
import useI18n from '../models/useI18n'

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
              px={3}
              py={1}
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
      <Grid templateColumns="minmax(0, 1fr) 40px minmax(0, 1fr)" gap={1}>
        <Box borderWidth="1px" borderRadius="md">
          <Box className={styles.title} borderBottomWidth={1} px={3} py={1}>
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
          <VStack>
            <IconButton
              size="sm"
              variant="outline"
              aria-label="Move to right"
              icon={<IoArrowForward />}
              isDisabled={left_selected_keys.length === 0}
              onClick={moveLeftToRight}
            />
            <IconButton
              size="sm"
              variant="outline"
              aria-label="Move to left"
              icon={<IoArrowBack />}
              isDisabled={right_selected_keys.length === 0}
              onClick={moveRightToLeft}
            />
          </VStack>
        </Center>
        <Box borderWidth="1px" borderRadius="md">
          <Box className={styles.title} borderBottomWidth={1} px={3} py={1}>
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
      </Grid>
    </div>
  )
}

export default Transfer
