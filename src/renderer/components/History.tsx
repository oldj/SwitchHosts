/**
 * History
 * @author: oldj
 * @homepage: https://oldj.net
 */

import HostsViewer from '@renderer/components/HostsViewer'
import { actions } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { IHostsHistoryObject } from '@common/data'
import events from '@common/events'
import clsx from 'clsx'
import dayjs from 'dayjs'
import prettyBytes from 'pretty-bytes'
import React, { useState } from 'react'
import { BiDetail, BiHelpCircle, BiHistory, BiTrash } from 'react-icons/bi'
import useConfigs from '@renderer/models/useConfigs'
import useI18n from '@renderer/models/useI18n'
import styles from './History.module.scss'
import {
  Box,
  Button,
  Center,
  Drawer,
  Flex,
  Group,
  List,
  Select,
  Stack,
  Tooltip,
  useMantineTheme,
} from '@mantine/core'

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
      <Center h="100%" opacity={0.5} fz="lg">
        {lang.no_record}
      </Center>
    )
  }

  return (
    <Flex h="100%" mih="300px" gap={8}>
      <Box sx={{ flex: 1 }}>
        <HostsViewer content={selected_item ? selected_item.content : ''} />
      </Box>
      <Stack w="200px" h="100%" spacing={0} className={styles.list}>
        {list.map((item) => (
          <Group
            key={item.id}
            onClick={() => setSelectedItem(item)}
            px={8}
            py={8}
            className={clsx(item.id === selected_item?.id && styles.selected)}
          >
            <Box>
              <BiDetail />
            </Box>
            <Stack align="left" spacing={0}>
              <Box>{dayjs(item.add_time_ms).format('YYYY-MM-DD HH:mm:ss')}</Box>
              <Group fz="9px" opacity={0.6}>
                <Box>{item.content.split('\n').length} lines</Box>
                <Box>{prettyBytes(item.content.length)}</Box>
              </Group>
            </Stack>
          </Group>
        ))}
      </Stack>
    </Flex>
  )
}

const Loading = (): React.ReactElement => {
  return (
    <Center h="300px">
      {/*<Spinner speed="1s" emptyColor="gray.200" size="lg" mr={3} />*/}
      <Box>Loading...</Box>
    </Center>
  )
}

const History = () => {
  const { configs, updateConfigs } = useConfigs()
  const [is_open, setIsOpen] = useState(false)
  const [is_loading, setIsLoading] = useState(false)
  const [list, setList] = useState<IHostsHistoryObject[]>([])
  const [selected_item, setSelectedItem] = useState<IHostsHistoryObject>()
  const theme = useMantineTheme()

  const { lang } = useI18n()

  const loadData = async () => {
    setIsLoading(true)
    let list = await actions.getHistoryList()
    list = list.reverse()
    setList(list)
    if (!selected_item) {
      setSelectedItem(list[0])
    }

    setIsLoading(false)

    return list
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
    loadData()
  })

  let history_limit_values: number[] = [10, 50, 100, 500]
  if (configs && !history_limit_values.includes(configs.history_limit)) {
    history_limit_values.push(configs.history_limit)
    history_limit_values.sort()
  }

  return (
    <Drawer
      className={styles.root}
      size={640}
      padding={'lg'}
      position="right"
      opened={is_open}
      overlayColor={theme.colorScheme === 'dark' ? theme.colors.dark[9] : theme.colors.gray[2]}
      overlayOpacity={0.55}
      overlayBlur={3}
      onClose={onClose}
      // initialFocusRef={btn_close}
      title={
        <Group spacing={8}>
          <BiHistory />
          <span>{lang.system_hosts_history}</span>
        </Group>
      }
    >
      <div className={styles.body}>
        <Box className={styles.content}>
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

        <Group h={60}>
          <Box>{lang.system_hosts_history_limit}</Box>
          <Select
            value={configs?.history_limit.toString() || '10'}
            data={history_limit_values.map((v) => v.toString())}
            onChange={(v) => updateHistoryLimit(parseInt(v || '10') || 10)}
          />
          <Tooltip label={lang.system_hosts_history_help} aria-label="A tooltip">
            <Box ml={3}>
              <BiHelpCircle />
            </Box>
          </Tooltip>
          <div style={{ flex: 1 }} />
          <Button
            leftIcon={<BiTrash />}
            variant="outline"
            mr={3}
            color="pink"
            disabled={!selected_item}
            onClick={() => selected_item && deleteItem(selected_item.id)}
          >
            {lang.delete}
          </Button>
          <Button
            onClick={onClose}
            // ref={btn_close}
            variant="outline"
          >
            {lang.close}
          </Button>
        </Group>
      </div>
    </Drawer>
  )
}

export default History
