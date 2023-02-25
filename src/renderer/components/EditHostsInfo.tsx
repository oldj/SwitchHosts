/**
 * EditHostsInfo
 * @author: oldj
 * @homepage: https://oldj.net
 */

import ItemIcon from '@renderer/components/ItemIcon'
import Transfer from '@renderer/components/Transfer'
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { FolderModeType, HostsType, IHostsListObject } from '@common/data'
import events from '@common/events'
import * as hostsFn from '@common/hostsFn'
import lodash from 'lodash'
import React, { useState } from 'react'
import { BiEdit, BiTrash } from 'react-icons/bi'
import { v4 as uuid4 } from 'uuid'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import styles from './EditHostsInfo.module.scss'
import {
  Button,
  Drawer,
  Grid,
  Group,
  Input,
  Radio,
  Select,
  Stack,
  useMantineTheme,
} from '@mantine/core'
import { showNotification } from '@mantine/notifications'

const EditHostsInfo = () => {
  const { lang } = useI18n()
  const theme = useMantineTheme()
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
      // add
      let h: IHostsListObject = {
        ...data,
        id: uuid4(),
      }
      let list: IHostsListObject[] = [...hosts_data.list, h]
      await setList(list)
      agent.broadcast(events.select_hosts, h.id, 1000)
    } else if (data && data.id) {
      // edit
      let h: IHostsListObject | undefined = hostsFn.findItemById(hosts_data.list, data.id)
      if (h) {
        Object.assign(h, data)
        await setList([...hosts_data.list])

        if (data.id === current_hosts?.id) {
          setCurrentHosts(h)
        }
      } else {
        // can not find by id
        setIsAdd(true)
        setTimeout(onSave, 300)
        return
      }
    } else {
      // unknown error
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
      <Stack spacing={'lg'}>
        <Input.Wrapper label={'URL'}>
          <Input
            value={hosts?.url || ''}
            onChange={(e) => onUpdate({ url: e.target.value })}
            placeholder={lang.url_placeholder}
            onKeyDown={(e) => e.key === 'Enter' && onSave()}
          />
        </Input.Wrapper>

        <Stack align={'flex-start'}>
          <Select
            label={lang.auto_refresh}
            data={[
              { label: lang.never, value: (0).toString() },
              { label: '1 ' + lang.minute, value: (60).toString() },
              { label: '5 ' + lang.minutes, value: (60 * 5).toString() },
              { label: '15 ' + lang.minutes, value: (60 * 15).toString() },
              { label: '1 ' + lang.hour, value: (60 * 60).toString() },
              { label: '24 ' + lang.hours, value: (60 * 60 * 24).toString() },
              { label: '7 ' + lang.days, value: (60 * 60 * 24 * 7).toString() },
            ]}
            value={(hosts?.refresh_interval || 0).toString()}
            onChange={(v) => onUpdate({ refresh_interval: parseInt(v || '0') || 0 })}
            style={{ minWidth: 120 }}
          />

          {is_add ? null : (
            <div className={styles.refresh_info}>
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
                        showNotification({
                          // status: 'error',
                          color: 'red',
                          message: r.message || r.code || 'Error!',
                        })
                        return
                      }

                      showNotification({
                        // status: 'success',
                        color: 'green',
                        message: 'OK!',
                      })
                      onUpdate({
                        last_refresh: r.data.last_refresh,
                        last_refresh_ms: r.data.last_refresh_ms,
                      })
                    })
                    .catch((e) => {
                      console.log(e)
                      showNotification({
                        // status: 'error',
                        color: 'red',
                        message: e.message,
                      })
                    })
                    .finally(() => setIsRefreshing(false))
                }}
              >
                {lang.refresh}
              </Button>
            </div>
          )}
        </Stack>
      </Stack>
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
      <Stack>
        <h3>{lang.content}</h3>
        <Transfer
          dataSource={source_list}
          targetKeys={target_keys}
          onChange={(next_target_keys) => {
            onUpdate({ include: next_target_keys })
          }}
        />
      </Stack>
    )
  }

  const forFolder = (): React.ReactElement => {
    return (
      <Radio.Group
        label={lang.choice_mode}
        value={(hosts?.folder_mode || 0).toString()}
        onChange={(v: string) => onUpdate({ folder_mode: (parseInt(v) || 0) as FolderModeType })}
      >
        <Radio value="0" label={lang.choice_mode_default} />
        <Radio value="1" label={lang.choice_mode_single} />
        <Radio value="2" label={lang.choice_mode_multiple} />
      </Radio.Group>
    )
  }

  const types: HostsType[] = ['local', 'remote', 'group', 'folder']

  const footer_buttons = (
    <Grid>
      <Grid.Col span={6}>
        {is_add ? null : (
          <Button
            leftIcon={<BiTrash />}
            mr={3}
            variant="outline"
            disabled={!hosts}
            color="pink"
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
      </Grid.Col>
      <Grid.Col span={6}>
        <Group position={'right'}>
          <Button onClick={onCancel} variant="outline" mr={3}>
            {lang.btn_cancel}
          </Button>
          <Button onClick={onSave}>{lang.btn_ok}</Button>
        </Group>
      </Grid.Col>
    </Grid>
  )

  return (
    <Drawer
      className={styles.root}
      size="640px"
      opened={is_show}
      position="right"
      onClose={onCancel}
      overlayColor={theme.colorScheme === 'dark' ? theme.colors.dark[9] : theme.colors.gray[2]}
      overlayOpacity={0.55}
      overlayBlur={3}
      padding="lg"
      title={
        <Group>
          <BiEdit />
          <span>{is_add ? lang.hosts_add : lang.hosts_edit}</span>
        </Group>
      }
    >
      <Stack spacing={'lg'}>
        <Radio.Group
          label={lang.hosts_type}
          onChange={(type: HostsType) => onUpdate({ type: type })}
          value={hosts?.type || 'local'}
          spacing={32}
        >
          {types.map((type) => (
            <Radio
              value={type}
              key={type}
              disabled={!is_add}
              label={
                <Group spacing={4}>
                  <ItemIcon type={type} />
                  <span>{lang[type]}</span>
                </Group>
              }
            />
          ))}
        </Radio.Group>

        <Input.Wrapper label={lang.hosts_title}>
          <Input
            data-autofocus
            value={hosts?.title || ''}
            maxLength={50}
            onChange={(e) => onUpdate({ title: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && onSave()}
          />
        </Input.Wrapper>

        <Stack>
          {hosts?.type === 'remote' ? forRemote() : null}
          {hosts?.type === 'group' ? forGroup() : null}
          {hosts?.type === 'folder' ? forFolder() : null}
        </Stack>

        <Stack>{footer_buttons}</Stack>
      </Stack>
    </Drawer>
  )
}

export default EditHostsInfo
