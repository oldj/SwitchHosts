/**
 * EditHostsInfo
 * @author: oldj
 * @homepage: https://oldj.net
 */

import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  FormControl,
  FormHelperText,
  FormLabel,
  Grid,
  HStack,
  Input,
  Radio,
  RadioGroup,
  Select,
  Stack,
  useToast,
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

  const toast = useToast()

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
        <FormControl className={styles.ln}>
          <FormLabel>URL</FormLabel>
          <Input
            value={hosts?.url || ''}
            onChange={(e) => onUpdate({ url: e.target.value })}
            placeholder={lang.url_placeholder}
            onKeyDown={(e) => e.key === 'Enter' && onSave()}
          />
        </FormControl>

        <FormControl className={styles.ln}>
          <FormLabel>{lang.auto_refresh}</FormLabel>
          <div>
            <Select
              value={hosts?.refresh_interval || 0}
              onChange={(e) => onUpdate({ refresh_interval: parseInt(e.target.value) || 0 })}
              style={{ minWidth: 120 }}
            >
              <option value={0}>{lang.never}</option>
              <option value={60}>1 {lang.minute}</option>
              <option value={60 * 5}>5 {lang.minutes}</option>
              <option value={60 * 15}>15 {lang.minutes}</option>
              <option value={60 * 60}>1 {lang.hour}</option>
              <option value={60 * 60 * 24}>24 {lang.hours}</option>
              <option value={60 * 60 * 24 * 7}>7 {lang.days}</option>
            </Select>
          </div>
          {is_add ? null : (
            <FormHelperText className={styles.refresh_info}>
              <span>
                {lang.last_refresh}
                {hosts?.last_refresh || 'N/A'}
              </span>
              <Button
                size="small"
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
                        toast({
                          status: 'error',
                          description: r.message || r.code || 'Error!',
                          isClosable: true,
                        })
                        return
                      }

                      toast({
                        status: 'success',
                        description: 'OK!',
                        isClosable: true,
                      })
                      onUpdate({
                        last_refresh: r.data.last_refresh,
                        last_refresh_ms: r.data.last_refresh_ms,
                      })
                    })
                    .catch((e) => {
                      console.log(e)
                      toast({
                        status: 'error',
                        description: e.message,
                        isClosable: true,
                      })
                    })
                    .finally(() => setIsRefreshing(false))
                }}
              >
                {lang.refresh}
              </Button>
            </FormHelperText>
          )}
        </FormControl>
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
      <FormControl className={styles.ln}>
        <FormLabel>{lang.content}</FormLabel>
        <Transfer
          dataSource={source_list}
          targetKeys={target_keys}
          render={renderTransferItem}
          onChange={(next_target_keys) => {
            onUpdate({ include: next_target_keys })
          }}
        />
      </FormControl>
    )
  }

  const forFolder = (): React.ReactElement => {
    return (
      <FormControl className={styles.ln}>
        <FormLabel>{lang.choice_mode}</FormLabel>
        <RadioGroup
          value={(hosts?.folder_mode || 0).toString()}
          onChange={(v: string) => onUpdate({ folder_mode: (parseInt(v) || 0) as FolderModeType })}
        >
          <HStack spacing={3}>
            <Radio value="0">{lang.choice_mode_default}</Radio>
            <Radio value="1">{lang.choice_mode_single}</Radio>
            <Radio value="2">{lang.choice_mode_multiple}</Radio>
          </HStack>
        </RadioGroup>
      </FormControl>
    )
  }

  const types: HostsType[] = ['local', 'remote', 'group', 'folder']

  const footer_buttons = (
    <Grid templateColumns="1fr 1fr" style={{ width: '100%' }}>
      <Box>
        {is_add ? null : (
          <Button
            leftIcon={<BiTrash />}
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
    <Drawer initialFocusRef={ipt_title_ref} isOpen={is_show} onClose={onCancel} size="lg">
      <DrawerOverlay />
      <DrawerContent>
        <DrawerHeader>
          <HStack>
            <Box mr={1}>
              <BiEdit />
            </Box>
            <Box>{is_add ? lang.hosts_add : lang.hosts_edit}</Box>
          </HStack>
        </DrawerHeader>
        <DrawerBody pb={6}>
          <FormControl className={styles.ln}>
            <FormLabel>{lang.hosts_type}</FormLabel>
            <RadioGroup
              onChange={(type: HostsType) => onUpdate({ type: type })}
              value={hosts?.type || 'local'}
            >
              <Stack direction="row" spacing={6}>
                {types.map((type) => (
                  <Radio value={type} key={type} isDisabled={!is_add}>
                    <HStack spacing="4px">
                      <ItemIcon type={type} />
                      <span>{lang[type]}</span>
                    </HStack>
                  </Radio>
                ))}
              </Stack>
            </RadioGroup>
          </FormControl>

          <FormControl className={styles.ln}>
            <FormLabel>{lang.hosts_title}</FormLabel>
            <Input
              ref={ipt_title_ref}
              value={hosts?.title || ''}
              maxLength={50}
              onChange={(e) => onUpdate({ title: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && onSave()}
            />
          </FormControl>

          {hosts?.type === 'remote' ? forRemote() : null}
          {hosts?.type === 'group' ? forGroup() : null}
          {hosts?.type === 'folder' ? forFolder() : null}
        </DrawerBody>

        <DrawerFooter>{footer_buttons}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

export default EditHostsInfo
