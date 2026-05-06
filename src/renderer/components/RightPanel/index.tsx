import { FolderModeType, IHostsListObject } from '@common/data'
import events from '@common/events'
import * as hostsFn from '@common/hostsFn'
import { Button, Group, Stack, Text } from '@mantine/core'
import { IconArrowBackUp, IconEdit, IconRefresh, IconTrash } from '@tabler/icons-react'
import BrowserLink from '@renderer/components/BrowserLink'
import ConfirmModal from '@renderer/components/ConfirmModal'
import ItemIcon from '@renderer/components/ItemIcon'
import { actions, agent } from '@renderer/core/agent'
import {
  getErrorMessage,
  showErrorNotification,
  showSuccessNotification,
} from '@renderer/core/notify'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import clsx from 'clsx'
import React, { useEffect, useRef, useState } from 'react'
import styles from './index.module.scss'

const countRules = (content: string): number =>
  content.split(/\r?\n/).filter((l) => {
    const t = l.trim()
    return t.length > 0 && !t.startsWith('#')
  }).length

const formatInterval = (
  seconds: number,
  lang: ReturnType<typeof useI18n>['lang'],
): string => {
  if (!seconds) return lang.never
  if (seconds < 60) return `${seconds} s`
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m} ${m === 1 ? lang.minute : lang.minutes}`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} ${h === 1 ? lang.hour : lang.hours}`
  const d = Math.round(h / 24)
  return `${d} ${d === 1 ? lang.day : lang.days}`
}

const InfoRow: React.FC<{
  label: string
  value: React.ReactNode
  mono?: boolean
}> = ({ label, value, mono }) => (
  <div className={styles.row}>
    <Text className={styles.row_label}>{label}</Text>
    <Text className={clsx(styles.row_value, mono && styles.mono)}>
      {value}
    </Text>
  </div>
)

const RightPanel = () => {
  const { lang } = useI18n()
  const { currentHosts, hostsData, setCurrentHosts, isHostsInTrashcan, loadHostsData } =
    useHostsData()
  const [ruleCount, setRuleCount] = useState<number | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const refLoadingId = useRef<string | null>(null)

  const hosts = currentHosts
  const type = hosts?.type || 'local'
  const hasContent = !!hosts && (type === 'local' || type === 'remote')

  const loadRuleCount = async (id: string) => {
    refLoadingId.current = id
    try {
      const content: string = (await actions.getHostsContent(id)) || ''
      if (refLoadingId.current !== id) return
      setRuleCount(countRules(content))
    } catch {
      if (refLoadingId.current !== id) return
      setRuleCount(null)
    }
  }

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch rule count or reset when current hosts changes */
    if (!hosts) {
      refLoadingId.current = null
      setRuleCount(null)
      return
    }
    if (hasContent) {
      loadRuleCount(hosts.id)
    } else {
      setRuleCount(null)
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hosts?.id, hosts?.type])

  useOnBroadcast(
    events.hosts_content_changed,
    (id: string) => {
      if (hosts && id === hosts.id && hasContent) loadRuleCount(id)
    },
    [hosts?.id, hasContent],
  )

  useOnBroadcast(
    events.hosts_refreshed,
    (refreshed: IHostsListObject) => {
      if (!hosts || refreshed.id !== hosts.id) return
      if (hasContent) loadRuleCount(hosts.id)
      if (
        refreshed.last_refresh !== hosts.last_refresh ||
        refreshed.last_refresh_ms !== hosts.last_refresh_ms
      ) {
        setCurrentHosts({
          ...hosts,
          last_refresh: refreshed.last_refresh,
          last_refresh_ms: refreshed.last_refresh_ms,
        })
      }
    },
    [hosts, hasContent],
  )

  const onEdit = () => {
    if (!hosts) return
    agent.broadcast(events.edit_hosts_info, hosts)
  }

  const onPermanentDelete = () => {
    if (!hosts) return
    actions
      .deleteItemFromTrashcan(hosts.id)
      .then(async (success: boolean) => {
        if (!success) {
          showErrorNotification({ title: lang.hosts_delete, message: lang.fail })
          return
        }
        setCurrentHosts(null)
        await loadHostsData()
        showSuccessNotification({ title: lang.hosts_delete, message: lang.success })
      })
      .catch((e: unknown) => {
        showErrorNotification({
          title: lang.hosts_delete,
          message: getErrorMessage(e, lang.fail),
        })
      })
  }

  const onRestore = () => {
    if (!hosts) return
    actions
      .restoreItemFromTrashcan(hosts.id)
      .then(async (success: boolean) => {
        if (!success) {
          showErrorNotification({ title: lang.trashcan_restore, message: lang.fail })
          return
        }
        await loadHostsData()
        showSuccessNotification({ title: lang.trashcan_restore, message: lang.success })
      })
      .catch((e: unknown) => {
        showErrorNotification({
          title: lang.trashcan_restore,
          message: getErrorMessage(e, lang.fail),
        })
      })
  }

  const onRefresh = () => {
    if (!hosts || hosts.type !== 'remote') return
    setIsRefreshing(true)
    actions
      .refreshHosts(hosts.id)
      .then((r: any) => {
        if (r?.success) {
          if (r.data) {
            setCurrentHosts({
              ...hosts,
              last_refresh: r.data.last_refresh,
              last_refresh_ms: r.data.last_refresh_ms,
            })
          }
          showSuccessNotification({
            title: lang.refresh,
            message: lang.success,
          })
        } else {
          showErrorNotification({
            title: lang.refresh,
            message: r?.message || (r?.code ? String(r.code) : lang.fail),
          })
        }
      })
      .catch((e: unknown) => {
        showErrorNotification({
          title: lang.refresh,
          message: getErrorMessage(e, lang.fail),
        })
      })
      .finally(() => setIsRefreshing(false))
  }

  if (!hosts) {
    return (
      <div className={styles.root}>
        <div className={styles.body} />
        <div className={styles.status_bar} />
      </div>
    )
  }

  const folderModeLabel: Record<FolderModeType, string> = {
    0: lang.choice_mode_default,
    1: lang.choice_mode_single,
    2: lang.choice_mode_multiple,
  }

  const includeItems =
    type === 'group'
      ? (hosts.include || []).map((id) => ({
          id,
          item: hostsFn.findItemById(hostsData.list, id),
        }))
      : []

  const inTrashcan = isHostsInTrashcan(hosts.id)

  return (
    <div className={styles.root}>
      <div className={styles.body}>
        <div className={styles.header}>
          <Group gap="8px" wrap="nowrap" className={styles.title_wrap}>
            <ItemIcon type={type} />
            <Text className={styles.title} title={hosts.title || lang.untitled}>
              {hosts.title || lang.untitled}
            </Text>
          </Group>
          {inTrashcan ? null : (
            <Button
              size="compact-sm"
              variant="subtle"
              leftSection={<IconEdit size={14} stroke={1.5} />}
              onClick={onEdit}
            >
              {lang.edit}
            </Button>
          )}
        </div>

        <Stack gap="8px" className={styles.section}>
          <InfoRow label={lang.hosts_type} value={lang[type] || type} />
          {hasContent && ruleCount != null ? (
            <InfoRow label={lang.rules} value={String(ruleCount)} />
          ) : null}
        </Stack>

        {type === 'remote' ? (
          <Stack gap="8px" className={styles.section}>
            <InfoRow
              label="URL"
              value={
                hosts.url ? (
                  <BrowserLink href={hosts.url}>{hosts.url}</BrowserLink>
                ) : (
                  '—'
                )
              }
              mono
            />
            {inTrashcan ? null : (
              <InfoRow
                label={lang.auto_refresh}
                value={formatInterval(hosts.refresh_interval || 0, lang)}
              />
            )}
            <InfoRow
              label={lang.last_refresh.replace(/[:：]\s*$/, '')}
              value={hosts.last_refresh || 'N/A'}
            />
            {inTrashcan ? null : (
              <Button
                size="compact-sm"
                variant="light"
                leftSection={<IconRefresh size={14} stroke={1.5} />}
                loading={isRefreshing}
                disabled={isRefreshing}
                onClick={onRefresh}
                className={styles.refresh_btn}
              >
                {lang.refresh}
              </Button>
            )}
          </Stack>
        ) : null}

        {type === 'folder' ? (
          <Stack gap="8px" className={styles.section}>
            <InfoRow
              label={lang.choice_mode}
              value={folderModeLabel[(hosts.folder_mode || 0) as FolderModeType]}
            />
          </Stack>
        ) : null}

        {type === 'group' ? (
          <div className={styles.section}>
            <Text className={styles.section_title}>
              {lang.content} ({includeItems.length})
            </Text>
            {includeItems.length === 0 ? (
              <Text className={styles.muted}>—</Text>
            ) : (
              <ul className={styles.include_list}>
                {includeItems.map(({ id, item }) => (
                  <li key={id}>
                    <Group gap="6px" wrap="nowrap">
                      <ItemIcon type={item?.type} />
                      <span className={item ? '' : styles.missing}>
                        {item ? item.title || lang.untitled : id}
                      </span>
                    </Group>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {inTrashcan ? (
          <div className={styles.footer}>
            <Button
              variant="outline"
              leftSection={<IconArrowBackUp size={14} stroke={1.5} />}
              onClick={onRestore}
            >
              {lang.trashcan_restore}
            </Button>
            <Button
              variant="outline"
              color="red"
              leftSection={<IconTrash size={14} stroke={1.5} />}
              onClick={() => setIsDeleteConfirmOpen(true)}
            >
              {lang.hosts_delete}
            </Button>
          </div>
        ) : null}
      </div>
      <div className={styles.status_bar} />

      <ConfirmModal
        opened={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={onPermanentDelete}
        title={lang.hosts_delete}
        message={lang.trashcan_delete_confirm}
        confirmLabel={lang.delete}
        danger
      />
    </div>
  )
}

export default RightPanel
