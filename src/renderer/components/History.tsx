/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { IHostsHistoryObject } from '@common/data'
import events from '@common/events'
import {
  Box,
  Button,
  Center,
  Flex,
  Group,
  Loader,
  NativeSelect,
  Text,
  Tooltip,
} from '@mantine/core'
import HostsViewer from '@renderer/components/HostsViewer'
import SideDrawer from '@renderer/components/SideDrawer'
import { actions } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import useConfigs from '@renderer/models/useConfigs'
import useI18n from '@renderer/models/useI18n'
import { IconFileTime, IconHelpCircle, IconHistory, IconX } from '@tabler/icons-react'
import clsx from 'clsx'
import dayjs from 'dayjs'
import prettyBytes from 'pretty-bytes'
import React, { useState } from 'react'
import styles from './History.module.scss'

interface IHistoryProps {
  list: IHostsHistoryObject[]
  selected_item: IHostsHistoryObject | undefined
  setSelectedItem: (item: IHostsHistoryObject) => void
}

const HistoryList = (props: IHistoryProps): React.ReactElement => {
  const { list, selected_item, setSelectedItem } = props
  const { lang } = useI18n()

  if (list.length === 0) {
    return (
      <Center h="100%" style={{ opacity: 0.5, fontSize: 'var(--mantine-font-size-lg)' }}>
        {lang.no_record}
      </Center>
    )
  }

  return (
    <Flex h="100%" mih={300}>
      <Box
        style={{
          flex: 1,
          marginRight: 12,
          border: '1px solid var(--swh-border-color-0)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        <HostsViewer content={selected_item ? selected_item.content : ''} />
      </Box>
      <Box
        w={200}
        h="100%"
        style={{
          overflow: 'auto',
          border: '1px solid var(--swh-border-color-0)',
          borderRadius: 6,
        }}
      >
        {list.map((item) => (
          <Box
            key={item.id}
            onClick={() => setSelectedItem(item)}
            px="12px"
            py="8px"
            style={{ userSelect: 'none' }}
            className={clsx(item.id === selected_item?.id && styles.selected)}
          >
            <Group gap="8px" wrap="nowrap" align="flex-start">
              <Box>
                <IconFileTime size={16} />
              </Box>
              <Box style={{ minWidth: 0 }}>
                <Text size="sm">{dayjs(item.add_time_ms).format('YYYY-MM-DD HH:mm:ss')}</Text>
                <Group
                  gap="8px"
                  style={{
                    lineHeight: '14px',
                    fontSize: 9,
                    opacity: 0.6,
                  }}
                >
                  <Box>{item.content.split('\n').length} lines</Box>
                  <Box>{prettyBytes(item.content.length)}</Box>
                </Group>
              </Box>
            </Group>
          </Box>
        ))}
      </Box>
    </Flex>
  )
}

const Loading = () => (
  <Center h={300}>
    <Group gap="12px">
      <Loader size="lg" />
      <Text>Loading...</Text>
    </Group>
  </Center>
)

const History = () => {
  const { configs, updateConfigs } = useConfigs()
  const [is_open, setIsOpen] = useState(false)
  const [is_loading, setIsLoading] = useState(false)
  const [list, setList] = useState<IHostsHistoryObject[]>([])
  const [selected_item, setSelectedItem] = useState<IHostsHistoryObject>()

  const { lang } = useI18n()

  const loadData = async () => {
    setIsLoading(true)
    let next_list = await actions.getHistoryList()
    next_list = next_list.reverse()
    setList(next_list)
    if (!selected_item) {
      setSelectedItem(next_list[0])
    }
    setIsLoading(false)

    return next_list
  }

  const onClose = () => {
    setIsOpen(false)
    setList([])
  }

  const deleteItem = async (id: string) => {
    if (!confirm(lang.system_hosts_history_delete_confirm)) {
      return
    }

    let idx = list.findIndex((i) => i.id === id)
    await actions.deleteHistory(id)
    setSelectedItem(undefined)
    let list2 = await loadData()

    let next_item = list2[idx] || list2[idx - 1]
    if (next_item) {
      setSelectedItem(next_item)
    }
  }

  const updateHistoryLimit = async (value: number) => {
    if (!value || value < 0) return
    await updateConfigs({ history_limit: value })
  }

  useOnBroadcast(events.show_history, () => {
    setIsOpen(true)
    loadData().catch((e) => {
      console.error(e)
    })
  })

  let history_limit_values: number[] = [10, 50, 100, 500]
  if (configs && !history_limit_values.includes(configs.history_limit)) {
    history_limit_values.push(configs.history_limit)
    history_limit_values.sort()
  }

  return (
    <SideDrawer
      opened={is_open}
      onClose={onClose}
      size="lg"
      title={
        <Group gap="8px">
          <IconHistory size={16} />
          <Box>{lang.system_hosts_history}</Box>
        </Group>
      }
      footer={
        <Flex align="center" gap="12px">
          <Box>{lang.system_hosts_history_limit}</Box>
          <NativeSelect
            data={history_limit_values.map((v) => v.toString())}
            value={String(configs?.history_limit ?? '')}
            onChange={(e) => updateHistoryLimit(parseInt(e.target.value || '0'))}
            w={100}
          />
          <Tooltip label={lang.system_hosts_history_help}>
            <Box style={{ display: 'flex' }}>
              <IconHelpCircle size={16} />
            </Box>
          </Tooltip>
          <Box style={{ flex: 1 }} />
          <Button
            variant="outline"
            color="red"
            disabled={!selected_item}
            onClick={() => selected_item && deleteItem(selected_item.id)}
            leftSection={<IconX size={16} />}
          >
            {lang.delete}
          </Button>
          <Button onClick={onClose} variant="outline">
            {lang.close}
          </Button>
        </Flex>
      }
    >
      <Box style={{ height: '100%' }}>
        {is_loading ? (
          <Loading />
        ) : (
          <HistoryList
            list={list}
            selected_item={selected_item}
            setSelectedItem={setSelectedItem}
          />
        )}
      </Box>
    </SideDrawer>
  )
}

export default History
