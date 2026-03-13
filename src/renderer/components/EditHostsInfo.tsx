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
  NativeSelect,
  Radio,
  SimpleGrid,
  Text,
  TextInput,
} from '@mantine/core'
import ItemIcon from '@renderer/components/ItemIcon'
import SideDrawer from '@renderer/components/SideDrawer'
import Transfer from '@renderer/components/Transfer'
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
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
  const { hosts_data, setList, current_hosts, setCurrentHosts } = useHostsData()
  const [is_show, setIsShow] = useState(false)
  const [is_add, setIsAdd] = useState(true)
  const [is_refreshing, setIsRefreshing] = useState(false)

  const onCancel = () => {
    setHosts(null)
    setIsShow(false)
  }

  const onSave = async () => {
    let data: Omit<IHostsListObject, 'id'> & { id?: string } = { ...hosts }

    const keys_to_trim = ['title', 'url']
    keys_to_trim.map((k) => {
      if (data[k]) {
        data[k] = data[k].trim()
      }
    })

    if (is_add) {
      let h: IHostsListObject = {
        ...data,
        id: uuidv4(),
      }
      let list: IHostsListObject[] = [...hosts_data.list, h]
      await setList(list)
      agent.broadcast(events.select_hosts, h.id, 1000)
    } else if (data && data.id) {
      let h: IHostsListObject | undefined = hostsFn.findItemById(hosts_data.list, data.id)
      if (h) {
        Object.assign(h, data)
        await setList([...hosts_data.list])

        if (data.id === current_hosts?.id) {
          setCurrentHosts(h)
        }
      } else {
        setIsAdd(true)
        setTimeout(onSave, 300)
        return
      }
    } else {
      alert('unknown error!')
    }

    setIsShow(false)
  }

  const onUpdate = (kv: Partial<IHostsListObject>) => {
    let obj: IHostsListObject = Object.assign({}, hosts, kv)
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
            value={hosts?.url || ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate({ url: e.target.value })}
            placeholder={lang.url_placeholder}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && onSave()}
          />
        </Box>

        <Box className={styles.ln}>
          <Text mb="8px">{lang.auto_refresh}</Text>
          <NativeSelect
            value={(hosts?.refresh_interval || 0).toString()}
            onChange={(e) => onUpdate({ refresh_interval: parseInt(e.target.value) || 0 })}
            data={[
              { value: '0', label: lang.never },
              { value: '60', label: `1 ${lang.minute}` },
              { value: `${60 * 5}`, label: `5 ${lang.minutes}` },
              { value: `${60 * 15}`, label: `15 ${lang.minutes}` },
              { value: `${60 * 60}`, label: `1 ${lang.hour}` },
              { value: `${60 * 60 * 24}`, label: `24 ${lang.hours}` },
              { value: `${60 * 60 * 24 * 7}`, label: `7 ${lang.days}` },
            ]}
            maw={160}
          />
          {is_add ? null : (
            <Box className={styles.refresh_info} mt="8px">
              <span>
                {lang.last_refresh}
                {hosts?.last_refresh || 'N/A'}
              </span>
              <Button
                size="sm"
                variant="subtle"
                disabled={is_refreshing}
                onClick={() => {
                  if (!hosts) return

                  setIsRefreshing(true)
                  actions
                    .refreshHosts(hosts.id)
                    .then((r) => {
                      console.log(r)
                      if (!r.success) {
                        console.error(r.message || r.code || 'Error!')
                        return
                      }

                      console.log('OK!')
                      onUpdate({
                        last_refresh: r.data.last_refresh,
                        last_refresh_ms: r.data.last_refresh_ms,
                      })
                    })
                    .catch((e) => {
                      console.log(e)
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
    const list = hostsFn.flatten(hosts_data.list)

    let source_list: IHostsListObject[] = list
      .filter((item) => !item.type || item.type === 'local' || item.type === 'remote')
      .map((item) => {
        let o = { ...item }
        o.key = o.id
        return o
      })

    let target_keys: string[] = hosts?.include || []

    return (
      <Box className={styles.ln}>
        <Text mb="8px">{lang.content}</Text>
        <Transfer
          dataSource={source_list}
          targetKeys={target_keys}
          render={renderTransferItem}
          onChange={(next_target_keys) => {
            onUpdate({ include: next_target_keys })
          }}
        />
      </Box>
    )
  }

  const forFolder = (): React.ReactElement => {
    return (
      <Box className={styles.ln}>
        <Text mb="8px">{lang.choice_mode}</Text>
        <Radio.Group
          value={(hosts?.folder_mode || 0).toString()}
          onChange={(v) => onUpdate({ folder_mode: (parseInt(v) || 0) as FolderModeType })}
        >
          <Group gap="12px">
            <Radio value="0" label={lang.choice_mode_default} />
            <Radio value="1" label={lang.choice_mode_single} />
            <Radio value="2" label={lang.choice_mode_multiple} />
          </Group>
        </Radio.Group>
      </Box>
    )
  }

  const types: HostsType[] = ['local', 'remote', 'group', 'folder']

  return (
    <SideDrawer
      opened={is_show}
      onClose={onCancel}
      size="lg"
      title={
        <Group gap="8px">
          <BiEdit />
          <Box>{is_add ? lang.hosts_add : lang.hosts_edit}</Box>
        </Group>
      }
      scrollAreaStyle={{
        paddingBottom: 24,
      }}
      footer={
        <SimpleGrid cols={2} style={{ width: '100%', alignItems: 'center' }}>
          <Box>
            {is_add ? null : (
              <Button
                variant="outline"
                color="pink"
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
            <Button onClick={onSave} color="blue">
              {lang.btn_ok}
            </Button>
          </Group>
        </SimpleGrid>
      }
    >
      <Box>
        <Box className={styles.ln}>
          <Text mb="8px">{lang.hosts_type}</Text>
          <Radio.Group
            value={hosts?.type || 'local'}
            onChange={(v) => onUpdate({ type: v as HostsType })}
          >
            <Group gap="24px">
              {types.map((type) => (
                <Radio
                  key={type}
                  value={type}
                  disabled={!is_add}
                  label={
                    <Group gap="4px" wrap="nowrap">
                      <ItemIcon type={type} />
                      <span>{lang[type]}</span>
                    </Group>
                  }
                />
              ))}
            </Group>
          </Radio.Group>
        </Box>

        <Box className={styles.ln}>
          <Text mb="8px">{lang.hosts_title}</Text>
          <TextInput
            data-autofocus
            value={hosts?.title || ''}
            maxLength={50}
            placeholder=""
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate({ title: e.target.value })}
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
