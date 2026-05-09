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
  ScrollArea,
  Select,
  Text,
  Tooltip,
} from '@mantine/core'
import ConfirmModal from '@renderer/components/ConfirmModal'
import HostsViewer from '@renderer/components/HostsViewer'
import SideDrawer from '@renderer/components/SideDrawer'
import { actions } from '@renderer/core/agent'
import { showSuccessNotification } from '@renderer/core/notify'
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
  selectedItem: IHostsHistoryObject | undefined
  setSelectedItem: (item: IHostsHistoryObject) => void
}

const HistoryList = (props: IHistoryProps): React.ReactElement => {
  const { list, selectedItem, setSelectedItem } = props
  const { lang } = useI18n()

  if (list.length === 0) {
    return (
      <Center h="100%" style={{ opacity: 0.5, fontSize: 'var(--mantine-font-size-lg)' }}>
        {lang.no_record}
      </Center>
    )
  }

  return (
    <Flex h="100%" mih={0} style={{ minHeight: 0, overflow: 'hidden' }}>
      <Box
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          marginRight: 12,
          border: '1px solid var(--swh-border-color-0)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        <HostsViewer content={selectedItem ? selectedItem.content : ''} />
      </Box>
      <ScrollArea
        w={200}
        h="100%"
        scrollbars="y"
        type="hover"
        style={{
          border: '1px solid var(--swh-border-color-0)',
          borderRadius: 6,
          minHeight: 0,
          padding: 4,
        }}
      >
        {list.map((item) => (
          <Box
            key={item.id}
            onClick={() => setSelectedItem(item)}
            px="12px"
            py="8px"
            style={{ userSelect: 'none' }}
            className={clsx(styles.item, item.id === selectedItem?.id && styles.selected)}
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
      </ScrollArea>
    </Flex>
  )
}

const Loading = () => (
  <Center h="100%">
    <Group gap="12px">
      <Loader size="lg" />
      <Text>Loading...</Text>
    </Group>
  </Center>
)

const History = () => {
  const { configs, updateConfigs } = useConfigs()
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [list, setList] = useState<IHostsHistoryObject[]>([])
  const [selectedItem, setSelectedItem] = useState<IHostsHistoryObject>()
  const [deleteTarget, setDeleteTarget] = useState<IHostsHistoryObject>()

  const { lang } = useI18n()

  const loadData = async () => {
    setIsLoading(true)
    let nextList = await actions.getHistoryList()
    nextList = nextList.reverse()
    setList(nextList)
    if (!selectedItem) {
      setSelectedItem(nextList[0])
    }
    setIsLoading(false)

    return nextList
  }

  const onClose = () => {
    setIsOpen(false)
    setList([])
    setDeleteTarget(undefined)
  }

  const deleteItem = async (id: string) => {
    const idx = list.findIndex((i) => i.id === id)
    const success = await actions.deleteHistory(id)
    if (success === false) return

    setSelectedItem(undefined)
    const list2 = await loadData()

    const nextItem = list2[idx] || list2[idx - 1]
    if (nextItem) {
      setSelectedItem(nextItem)
    }
    showSuccessNotification({ title: lang.delete, message: lang.success })
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

  const historyLimitValues: number[] = [10, 50, 100, 500]
  if (configs && !historyLimitValues.includes(configs.history_limit)) {
    historyLimitValues.push(configs.history_limit)
    historyLimitValues.sort()
  }

  return (
    <>
      <SideDrawer
        opened={isOpen}
        onClose={onClose}
        size="lg"
        scrollable={false}
        title={
          <Group gap="8px">
            <IconHistory size={16} />
            <Box>{lang.system_hosts_history}</Box>
          </Group>
        }
        footer={
          <Flex align="center" gap="12px">
            <Box>{lang.system_hosts_history_limit}</Box>
            <Select
              data={historyLimitValues.map((v) => v.toString())}
              value={String(configs?.history_limit ?? '')}
              onChange={(v) => updateHistoryLimit(parseInt(v || '0'))}
              w={100}
              allowDeselect={false}
            />
            <Tooltip label={lang.system_hosts_history_help}>
              <Box style={{ display: 'flex' }}>
                <IconHelpCircle size={16} />
              </Box>
            </Tooltip>
            <Box style={{ flex: 1 }} />
            <Button
              variant="outline"
              disabled={!selectedItem}
              onClick={() => selectedItem && setDeleteTarget(selectedItem)}
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
        <Box style={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>
          {isLoading ? (
            <Loading />
          ) : (
            <HistoryList
              list={list}
              selectedItem={selectedItem}
              setSelectedItem={setSelectedItem}
            />
          )}
        </Box>
      </SideDrawer>

      <ConfirmModal
        opened={!!deleteTarget}
        onClose={() => setDeleteTarget(undefined)}
        onConfirm={() => deleteTarget && deleteItem(deleteTarget.id)}
        title={lang.delete}
        message={lang.system_hosts_history_delete_confirm}
        confirmLabel={lang.delete}
        danger
      />
    </>
  )
}

export default History
