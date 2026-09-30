/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { FolderModeType, HostsType, IHostsListObject } from '@common/data'
import { dnsProviderLabel } from '@common/dns'
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
import useConfigs from '../models/useConfigs'
import useI18n from '../models/useI18n'
import styles from './EditHostsInfo.module.scss'

const EditHostsInfo = () => {
  const { lang, i18n } = useI18n()
  const [hosts, setHosts] = useState<IHostsListObject | null>(null)
  const { hostsData, setList, currentHosts, setCurrentHosts } = useHostsData()
  const { configs } = useConfigs()
  const [domainError, setDomainError] = useState('')

  const source = (hosts?.source as 'url' | 'domain') || 'url'
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

    if (data.type === 'remote' && (data.source as string) === 'domain') {
      const domain = hostsFn.extractDomain(String(data.url || ''))
      if (!domain) {
        setDomainError(i18n.trans('invalid_domain', [data.url || '']))
        return
      }
      data.url = domain
    }
    setDomainError('')

    if (isAdd) {
      const h: IHostsListObject = {
        ...data,
        id: uuidv4(),
      }
      await setList((list) => [...list, h])
      agent.broadcast(events.select_hosts, h.id, 1000)
      if (data.type === 'remote' && (data.source as string) === 'domain') {
        actions.refreshHosts(h.id).catch((e) => console.error(e))
      }
    } else if (data && data.id) {
      const id = data.id
      // Only form fields belong to this edit. Apply them to the latest node,
      // preserving concurrent switch changes and remote-refresh metadata.
      const fields = lodash.pick(data, [
        'title',
        'type',
        'url',
        'source',
        'refresh_interval',
        'include',
        'folder_mode',
      ])
      let edited: IHostsListObject | undefined
      let refresh = false
      await setList((list) => {
        const h = hostsFn.findItemById(list, id)
        if (!h) throw new Error(lang.storage_conflict)
        refresh =
          data.type === 'remote' &&
          data.source === 'domain' &&
          ((h.source || 'url') !== 'domain' || (h.url || '') !== data.url)
        Object.assign(h, fields)
        edited = h
        return list
      })
      if (id === currentHosts?.id && edited) setCurrentHosts(edited)
      if (refresh) actions.refreshHosts(id).catch((e) => console.error(e))
    } else {
      showErrorNotification({ title: lang.fail, message: lang.unknown_error })
    }

    setIsShow(false)
  }

  // setList reports persistence failures. Keep the editor open and consume
  // the rejection at event boundaries so no success follow-up runs.
  const saveFromUI = () => onSave().catch((error: unknown) => console.error(error))

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
          <Text mb="8px">{lang.source_type}</Text>
          <SegmentedControl
            value={source}
            onChange={(v) => onUpdate({ source: v as 'url' | 'domain' })}
            data={[
              { value: 'url', label: lang.source_url },
              { value: 'domain', label: lang.source_domain },
            ]}
          />
        </Box>

        <Box className={styles.ln}>
          <Text mb="8px">{source === 'domain' ? lang.source_domain : 'URL'}</Text>
          <TextInput
            aria-label={source === 'domain' ? lang.source_domain : 'URL'}
            value={hosts?.url || ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate({ url: e.target.value })}
            placeholder={source === 'domain' ? lang.domain_placeholder : lang.url_placeholder}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) =>
              e.key === 'Enter' && saveFromUI()
            }
            error={source === 'domain' && domainError ? domainError : undefined}
          />
          {source === 'domain' ? (
            <Text size="xs" c="dimmed" mt="4px">
              {i18n.trans('domain_hint', [dnsProviderLabel(configs?.dns_provider)])}
            </Text>
          ) : null}
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
        <DescriptionText mt="8px">{choiceModeEffect[folderMode]}</DescriptionText>
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
            <Button onClick={saveFromUI}>{lang.btn_ok}</Button>
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
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) =>
              e.key === 'Enter' && saveFromUI()
            }
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
