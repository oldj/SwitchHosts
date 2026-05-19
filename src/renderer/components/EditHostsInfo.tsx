/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { FolderModeType, HostsType, IHostsListObject } from '@common/data'
import events from '@common/events'
import * as hostsFn from '@common/hostsFn'
import {
  Box,
  Button,
  Group,
  SegmentedControl,
  Select,
  SimpleGrid,
  Text,
  TextInput,
} from '@mantine/core'
import DescriptionText from '@renderer/components/DescriptionText'
import ItemIcon from '@renderer/components/ItemIcon'
import SideDrawer from '@renderer/components/SideDrawer'
import Transfer from '@renderer/components/Transfer'
import { actions, agent } from '@renderer/core/agent'
import { showErrorNotification } from '@renderer/core/notify'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { formatInterval } from '@renderer/utils/formatInterval'
import lodash from 'lodash'
import React, { useState } from 'react'
import { BiEdit, BiTrash } from 'react-icons/bi'
import { v4 as uuidv4 } from 'uuid'
import useHostsData from '../models/useHostsData'
import useI18n from '../models/useI18n'
import styles from './EditHostsInfo.module.scss'

const EditHostsInfo = () => {
  const { lang } = useI18n()
  const [hosts, setHosts] = useState<IHostsListObject | null>(null)
  const { hostsData, setList, currentHosts, setCurrentHosts } = useHostsData()
  const [isShow, setIsShow] = useState(false)
  const [isAdd, setIsAdd] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const onCancel = () => {
    setHosts(null)
    setIsShow(false)
  }

  const onSave = async () => {
    const data: Omit<IHostsListObject, 'id'> & { id?: string } = { ...hosts }

    const keysToTrim = ['title', 'url']
    keysToTrim.map((k) => {
      if (data[k]) {
        data[k] = data[k].trim()
      }
    })

    if (isAdd) {
      const h: IHostsListObject = {
        ...data,
        id: uuidv4(),
      }
      const list: IHostsListObject[] = [...hostsData.list, h]
      await setList(list)
      agent.broadcast(events.select_hosts, h.id, 1000)
    } else if (data && data.id) {
      const h: IHostsListObject | undefined = hostsFn.findItemById(hostsData.list, data.id)
      if (h) {
        Object.assign(h, data)
        await setList([...hostsData.list])

        if (data.id === currentHosts?.id) {
          setCurrentHosts(h)
        }
      } else {
        setIsAdd(true)
        setTimeout(onSave, 300)
        return
      }
    } else {
      showErrorNotification({ title: lang.fail, message: lang.unknown_error })
    }

    setIsShow(false)
  }

  const onUpdate = (kv: Partial<IHostsListObject>) => {
    const obj: IHostsListObject = Object.assign({}, hosts, kv)
    setHosts(obj)
  }

  useOnBroadcast(events.edit_hosts_info, (hosts?: IHostsListObject) => {
    setHosts(hosts || null)
    setIsAdd(!hosts)
    setIsShow(true)
  })

  useOnBroadcast(events.add_new, () => {
    setHosts(null)
    setIsAdd(true)
    setIsShow(true)
  })

  useOnBroadcast(
    events.hosts_refreshed,
    (_hosts: IHostsListObject) => {
      if (hosts && hosts.id === _hosts.id) {
        onUpdate(lodash.pick(_hosts, ['last_refresh', 'last_refresh_ms']))
      }
    },
    [hosts],
  )

  const forRemote = (): React.ReactElement => {
    return (
      <>
        <Box className={styles.ln}>
          <Text mb="8px">URL</Text>
          <TextInput
            aria-label="URL"
            value={hosts?.url || ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate({ url: e.target.value })}
            placeholder={lang.url_placeholder}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && onSave()}
          />
        </Box>

        <Box className={styles.ln}>
          <Text mb="8px">{lang.auto_refresh}</Text>
          <Select
            aria-label={lang.auto_refresh}
            value={(hosts?.refresh_interval || 0).toString()}
            onChange={(v) => onUpdate({ refresh_interval: parseInt(v || '0') || 0 })}
            data={[0, 60, 60 * 5, 60 * 15, 60 * 60, 60 * 60 * 24, 60 * 60 * 24 * 7].map((s) => ({
              value: s.toString(),
              label: formatInterval(s, lang),
            }))}
            maw={160}
            allowDeselect={false}
          />
          {isAdd ? null : (
            <Box className={styles.refresh_info} mt="8px">
              <span>
                {lang.last_refresh}
                {hosts?.last_refresh || 'N/A'}
              </span>
              <Button
                size="sm"
                variant="subtle"
                disabled={isRefreshing}
                onClick={() => {
                  if (!hosts) return

                  setIsRefreshing(true)
                  actions
                    .refreshHosts(hosts.id)
                    .then((r) => {
                      if (!r.success) {
                        console.error(r.message || r.code || 'Error!')
                        return
                      }

                      onUpdate({
                        last_refresh: r.data.last_refresh,
                        last_refresh_ms: r.data.last_refresh_ms,
                      })
                    })
                    .catch((e) => {
                      console.error(e.message)
                    })
                    .finally(() => setIsRefreshing(false))
                }}
              >
                {lang.refresh}
              </Button>
            </Box>
          )}
        </Box>
      </>
    )
  }

  const renderTransferItem = (item: IHostsListObject): React.ReactElement => {
    return (
      <Group gap="8px">
        <ItemIcon type={item.type} />
        <span>{item.title || lang.untitled}</span>
      </Group>
    )
  }

  const forGroup = (): React.ReactElement => {
    const list = hostsFn.flatten(hostsData.list)

    const sourceList: IHostsListObject[] = list
      .filter((item) => !item.type || item.type === 'local' || item.type === 'remote')
      .map((item) => {
        const o = { ...item }
        o.key = o.id
        return o
      })

    const targetKeys: string[] = hosts?.include || []

    return (
      <Box className={styles.ln}>
        <Text mb="8px">{lang.content}</Text>
        <Transfer
          dataSource={sourceList}
          targetKeys={targetKeys}
          render={renderTransferItem}
          onChange={(nextTargetKeys) => {
            onUpdate({ include: nextTargetKeys })
          }}
        />
      </Box>
    )
  }

  const forFolder = (): React.ReactElement => {
    const folderMode = (hosts?.folder_mode || 0) as FolderModeType
    const choiceModeEffect: Record<FolderModeType, string> = {
      0: lang.choice_mode_default_effect,
      1: lang.choice_mode_single_effect,
      2: lang.choice_mode_multiple_effect,
    }

    return (
      <Box className={styles.ln}>
        <Text mb="8px">{lang.choice_mode}</Text>
        <SegmentedControl
          value={folderMode.toString()}
          onChange={(v) => onUpdate({ folder_mode: (parseInt(v) || 0) as FolderModeType })}
          data={[
            { value: '0', label: lang.choice_mode_default },
            { value: '1', label: lang.choice_mode_single },
            { value: '2', label: lang.choice_mode_multiple },
          ]}
        />
        <DescriptionText mt="8px">
          {choiceModeEffect[folderMode]}
        </DescriptionText>
      </Box>
    )
  }

  const types: HostsType[] = ['local', 'remote', 'group', 'folder']

  return (
    <SideDrawer
      opened={isShow}
      onClose={onCancel}
      size="lg"
      title={
        <Group gap="8px">
          <BiEdit />
          <Box>{isAdd ? lang.hosts_add : lang.hosts_edit}</Box>
        </Group>
      }
      scrollAreaStyle={{
        paddingBottom: 24,
      }}
      footer={
        <SimpleGrid cols={2} style={{ width: '100%', alignItems: 'center' }}>
          <Box>
            {isAdd ? null : (
              <Button
                variant="outline"
                disabled={!hosts}
                leftSection={<BiTrash />}
                onClick={() => {
                  if (hosts) {
                    agent.broadcast(events.move_to_trashcan, [hosts.id])
                    onCancel()
                  }
                }}
              >
                {lang.move_to_trashcan}
              </Button>
            )}
          </Box>
          <Group justify="flex-end" gap="12px">
            <Button onClick={onCancel} variant="outline">
              {lang.btn_cancel}
            </Button>
            <Button onClick={onSave}>{lang.btn_ok}</Button>
          </Group>
        </SimpleGrid>
      }
    >
      <Box>
        <Box className={styles.ln}>
          <Text mb="8px">{lang.hosts_type}</Text>
          <SegmentedControl
            value={hosts?.type || 'local'}
            onChange={(v) => onUpdate({ type: v as HostsType })}
            disabled={!isAdd}
            data={types.map((type) => ({
              value: type,
              label: (
                <Group gap="4px" wrap="nowrap">
                  <ItemIcon type={type} />
                  <span>{lang[type]}</span>
                </Group>
              ),
            }))}
          />
        </Box>

        <Box className={styles.ln}>
          <Text mb="8px">{lang.hosts_title}</Text>
          <TextInput
            aria-label={lang.hosts_title}
            data-autofocus
            value={hosts?.title || ''}
            maxLength={50}
            placeholder=""
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onUpdate({ title: e.target.value })
            }
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && onSave()}
          />
        </Box>

        {hosts?.type === 'remote' ? forRemote() : null}
        {hosts?.type === 'group' ? forGroup() : null}
        {hosts?.type === 'folder' ? forFolder() : null}
      </Box>
    </SideDrawer>
  )
}

export default EditHostsInfo
