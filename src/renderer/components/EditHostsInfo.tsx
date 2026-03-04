/**
 * EditHostsInfo
 * @author: oldj
 * @homepage: https://oldj.net
 */

import {
  Box,
  Button,
  Drawer,
  Grid,
  HStack,
  Input,
  Portal,
  Stack,
} from '@chakra-ui/react'
import ItemIcon from '@renderer/components/ItemIcon'
import Transfer from '@renderer/components/Transfer'
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { FolderModeType, HostsType, IHostsListObject } from '@common/data'
import events from '@common/events'
import * as hostsFn from '@common/hostsFn'
import lodash from 'lodash'
import React, { useRef, useState } from 'react'
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
  const ipt_title_ref = useRef<HTMLInputElement>(null)
  const DrawerPositioner = Drawer.Positioner as unknown as React.FC<React.PropsWithChildren>
  const DrawerContent = Drawer.Content as unknown as React.FC<React.PropsWithChildren>

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
        id: uuidv4(),
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
      <>
        <Box className={styles.ln}>
          <Box mb={2}>URL</Box>
          <Input
            value={hosts?.url || ''}
            onChange={(e) => onUpdate({ url: e.target.value })}
            placeholder={lang.url_placeholder}
            onKeyDown={(e) => e.key === 'Enter' && onSave()}
          />
        </Box>

        <Box className={styles.ln}>
          <Box mb={2}>{lang.auto_refresh}</Box>
          <div>
            <select
              value={hosts?.refresh_interval || 0}
              onChange={(e) => onUpdate({ refresh_interval: parseInt(e.target.value) || 0 })}
              style={{ minWidth: 120, padding: '6px 10px' }}
            >
              <option value={0}>{lang.never}</option>
              <option value={60}>1 {lang.minute}</option>
              <option value={60 * 5}>5 {lang.minutes}</option>
              <option value={60 * 15}>15 {lang.minutes}</option>
              <option value={60 * 60}>1 {lang.hour}</option>
              <option value={60 * 60 * 24}>24 {lang.hours}</option>
              <option value={60 * 60 * 24 * 7}>7 {lang.days}</option>
            </select>
          </div>
          {is_add ? null : (
            <Box className={styles.refresh_info}>
              <span>
                {lang.last_refresh}
                {hosts?.last_refresh || 'N/A'}
              </span>
              <Button
                size="sm"
                variant="ghost"
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
      <HStack>
        <ItemIcon type={item.type} />
        <span style={{ marginLeft: 4 }}>{item.title || lang.untitled}</span>
      </HStack>
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
        <Box mb={2}>{lang.content}</Box>
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
        <Box mb={2}>{lang.choice_mode}</Box>
        <HStack gap={3}>
          <label>
            <input
              type="radio"
              name="folder_mode"
              value="0"
              checked={(hosts?.folder_mode || 0).toString() === '0'}
              onChange={(e) => onUpdate({ folder_mode: (parseInt(e.target.value) || 0) as FolderModeType })}
            />
            {lang.choice_mode_default}
          </label>
          <label>
            <input
              type="radio"
              name="folder_mode"
              value="1"
              checked={(hosts?.folder_mode || 0).toString() === '1'}
              onChange={(e) => onUpdate({ folder_mode: (parseInt(e.target.value) || 0) as FolderModeType })}
            />
            {lang.choice_mode_single}
          </label>
          <label>
            <input
              type="radio"
              name="folder_mode"
              value="2"
              checked={(hosts?.folder_mode || 0).toString() === '2'}
              onChange={(e) => onUpdate({ folder_mode: (parseInt(e.target.value) || 0) as FolderModeType })}
            />
            {lang.choice_mode_multiple}
          </label>
        </HStack>
      </Box>
    )
  }

  const types: HostsType[] = ['local', 'remote', 'group', 'folder']

  const footer_buttons = (
    <Grid templateColumns="1fr 1fr" style={{ width: '100%' }}>
      <Box>
        {is_add ? null : (
          <Button
            mr={3}
            variant="outline"
            disabled={!hosts}
            colorScheme="pink"
            onClick={() => {
              if (hosts) {
                agent.broadcast(events.move_to_trashcan, [hosts.id])
                onCancel()
              }
            }}
          >
            <BiTrash />
            {lang.move_to_trashcan}
          </Button>
        )}
      </Box>
      <Box style={{ textAlign: 'right' }}>
        <Button onClick={onCancel} variant="outline" mr={3}>
          {lang.btn_cancel}
        </Button>
        <Button onClick={onSave} colorScheme="blue">
          {lang.btn_ok}
        </Button>
      </Box>
    </Grid>
  )

  return (
    <Drawer.Root open={is_show} onOpenChange={(e: { open: boolean }) => setIsShow(e.open)} size="lg">
      <Portal>
        <Drawer.Backdrop />
        <DrawerPositioner>
          <DrawerContent>
            <Drawer.Header>
          <HStack>
            <Box mr={1}>
              <BiEdit />
            </Box>
            <Box>{is_add ? lang.hosts_add : lang.hosts_edit}</Box>
          </HStack>
            </Drawer.Header>
            <Drawer.Body pb={6}>
              <Box className={styles.ln}>
                <Box mb={2}>{lang.hosts_type}</Box>
                <Stack direction="row" gap={6}>
                  {types.map((type) => (
                    <label key={type} style={{ opacity: !is_add && hosts?.type !== type ? 0.6 : 1 }}>
                      <input
                        type="radio"
                        name="hosts_type"
                        value={type}
                        disabled={!is_add}
                        checked={(hosts?.type || 'local') === type}
                        onChange={(e) => onUpdate({ type: e.target.value as HostsType })}
                      />
                    <HStack gap="4px">
                      <ItemIcon type={type} />
                      <span>{lang[type]}</span>
                    </HStack>
                    </label>
                  ))}
                </Stack>
              </Box>

              <Box className={styles.ln}>
                <Box mb={2}>{lang.hosts_title}</Box>
                <Input
                  ref={ipt_title_ref}
                  value={hosts?.title || ''}
                  maxLength={50}
                  onChange={(e) => onUpdate({ title: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && onSave()}
                />
              </Box>

              {hosts?.type === 'remote' ? forRemote() : null}
              {hosts?.type === 'group' ? forGroup() : null}
              {hosts?.type === 'folder' ? forFolder() : null}
            </Drawer.Body>

            <Drawer.Footer>{footer_buttons}</Drawer.Footer>
          </DrawerContent>
        </DrawerPositioner>
      </Portal>
    </Drawer.Root>
  )
}

export default EditHostsInfo
