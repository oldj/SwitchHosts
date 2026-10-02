import { FolderModeType, IHostsListObject, IOperationResult } from '@common/data'
import { getDomainList, getRefreshTime, mergeRefreshMetadata } from '@common/dns'
import events from '@common/events'
import * as hostsFn from '@common/hostsFn'
import { Button, Group, ScrollArea, Stack, Text } from '@mantine/core'
import BrowserLink from '@renderer/components/BrowserLink'
import ConfirmModal from '@renderer/components/ConfirmModal'
import DomainResolutionResults from '@renderer/components/DomainResolutionResults'
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
import { IconArrowBackUp, IconEdit, IconRefresh, IconTrash } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { formatInterval } from '@renderer/utils/formatInterval'
import styles from './index.module.scss'
import { InfoRow, countRules } from './shared'
import SystemHostsPanel from './SystemHostsPanel'

const RightPanel = () => {
  const { lang } = useI18n()
  const { currentHosts, hostsData, setCurrentHosts, isHostsInTrashcan, loadHostsData } =
    useHostsData()
  const [ruleCount, setRuleCount] = useState<{ id: string; value: number } | null>(null)
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(() => new Set())
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const ruleCountRequestRef = useRef(0)

  const hosts = currentHosts
  const type = hosts?.type || 'local'
  const hasContent = !!hosts && (type === 'local' || type === 'remote')
  const isRefreshing = !!hosts && refreshingIds.has(hosts.id)
  const currentRuleCount = ruleCount?.id === hosts?.id ? ruleCount?.value : null

  useEffect(() => {
    if (!hosts?.id) return
    const latest = hostsFn.findItemById(hostsData.list, hosts.id)
    if (!latest) return
    // A fast initial refresh can finish before the new item is selected.
    // Recover its metadata from the reloaded list even if that event was missed.
    setCurrentHosts((current) => mergeRefreshMetadata(current, latest))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hosts?.id, hostsData.list])

  const loadRuleCount = async (id: string) => {
    const request = ++ruleCountRequestRef.current
    try {
      const content: string = (await actions.getHostsContent(id)) || ''
      if (ruleCountRequestRef.current !== request) return
      setRuleCount({ id, value: countRules(content) })
    } catch {
      if (ruleCountRequestRef.current !== request) return
      setRuleCount(null)
    }
  }

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch rule count or reset when current hosts changes */
    setRuleCount(null)
    if (hosts && hasContent) {
      loadRuleCount(hosts.id)
    }
    return () => {
      ruleCountRequestRef.current += 1
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
      setCurrentHosts((current) => mergeRefreshMetadata(current, refreshed))
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
    if (!hosts || hosts.type !== 'remote' || refreshingIds.has(hosts.id)) return
    setRefreshingIds((ids) => new Set(ids).add(hosts.id))
    actions
      .refreshHosts(hosts.id)
      .then((r: IOperationResult) => {
        if (r.data) {
          setCurrentHosts((current) => mergeRefreshMetadata(current, r.data))
        }
        if (r?.success) {
          showSuccessNotification({
            title: lang.refresh,
            message: lang.success,
          })
        } else {
          showErrorNotification({
            title: lang.refresh,
            message:
              r?.code === 'domain_partial' || r?.code === 'domain_failed'
                ? lang.domain_resolution_incomplete
                : r?.message || (r?.code ? String(r.code) : lang.fail),
          })
        }
      })
      .catch((e: unknown) => {
        showErrorNotification({
          title: lang.refresh,
          message: getErrorMessage(e, lang.fail),
        })
      })
      .finally(() =>
        setRefreshingIds((ids) => {
          const next = new Set(ids)
          next.delete(hosts.id)
          return next
        }),
      )
  }

  if (!hosts) {
    // currentHosts === null is the convention for "System Hosts is selected"
    // (see LeftPanel/SystemHostsItem.tsx).
    return <SystemHostsPanel />
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
      <ScrollArea className={styles.body} scrollbars="y" type="hover">
        <div className={styles.header}>
          <Group gap="8px" wrap="nowrap" className={styles.title_wrap}>
            <span className={styles.title_icon} data-testid="right-panel-title-icon">
              <ItemIcon type={type} />
            </span>
            <Text
              className={styles.title}
              title={hosts.title || lang.untitled}
              data-testid="right-panel-title"
            >
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
          {hasContent && currentRuleCount != null ? (
            <InfoRow label={lang.rules} value={String(currentRuleCount)} />
          ) : null}
        </Stack>

        {type === 'remote' ? (
          <Stack gap="8px" className={styles.section}>
            {hosts.source === 'domain' ? (
              <>
                <InfoRow
                  label={lang.domain_list}
                  value={getDomainList(hosts).map((domain, index) => (
                    <span key={`${domain}-${index}`} style={{ display: 'block' }}>
                      {domain}
                    </span>
                  ))}
                  mono
                />
                <DomainResolutionResults hosts={hosts} />
              </>
            ) : (
              <InfoRow
                label="URL"
                value={hosts.url ? <BrowserLink href={hosts.url}>{hosts.url}</BrowserLink> : '—'}
                mono
              />
            )}
            {inTrashcan ? null : (
              <InfoRow
                label={lang.auto_refresh}
                value={formatInterval(hosts.refresh_interval || 0, lang)}
              />
            )}
            <InfoRow
              label={lang.last_refresh.replace(/[:：]\s*$/, '')}
              value={getRefreshTime(hosts.last_refresh) || 'N/A'}
            />
            {hosts.source === 'domain' && getRefreshTime(hosts.last_attempt) ? (
              <InfoRow
                label={lang.domain_last_attempt.replace(/[:：]\s*$/, '')}
                value={getRefreshTime(hosts.last_attempt)}
              />
            ) : null}
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
              size="compact-sm"
              variant="light"
              leftSection={<IconArrowBackUp size={14} stroke={1.5} />}
              onClick={onRestore}
            >
              {lang.trashcan_restore}
            </Button>
            <Button
              size="compact-sm"
              variant="light"
              leftSection={<IconTrash size={14} stroke={1.5} />}
              onClick={() => setIsDeleteConfirmOpen(true)}
            >
              {lang.hosts_delete}
            </Button>
          </div>
        ) : null}
      </ScrollArea>
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
