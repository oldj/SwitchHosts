/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { FolderModeType, HostsType, IHostsListObject, IOperationResult } from '@common/data'
import {
  dnsProviderLabel,
  getDomainList,
  getDomainResults,
  getRefreshTarget,
  getRefreshTime,
  mergeRefreshMetadata,
  parseDomains,
} from '@common/dns'
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
import DomainResolutionResults from '@renderer/components/DomainResolutionResults'
import ItemIcon from '@renderer/components/ItemIcon'
import SideDrawer from '@renderer/components/SideDrawer'
import Transfer from '@renderer/components/Transfer'
import { actions, agent } from '@renderer/core/agent'
import {
  getErrorMessage,
  showErrorNotification,
  showSuccessNotification,
} from '@renderer/core/notify'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { formatInterval } from '@renderer/utils/formatInterval'
import lodash from 'lodash'
import React, { useId, useMemo, useRef, useState } from 'react'
import { BiEdit, BiTrash } from 'react-icons/bi'
import { v4 as uuidv4 } from 'uuid'
import useHostsData from '../models/useHostsData'
import useConfigs from '../models/useConfigs'
import useI18n from '../models/useI18n'
import styles from './EditHostsInfo.module.scss'

const EditHostsInfo = () => {
  const { lang, i18n } = useI18n()
  const [hosts, setHosts] = useState<IHostsListObject | null>(null)
  const { hostsData, setList, setCurrentHosts } = useHostsData()
  const { configs } = useConfigs()
  const [domainText, setDomainText] = useState('')
  const [validateDomains, setValidateDomains] = useState(false)
  const [savedDomainSource, setSavedDomainSource] = useState(false)
  const [savedDomainsValid, setSavedDomainsValid] = useState(false)
  const [savedDomains, setSavedDomains] = useState<string[]>([])
  const domainInputId = useId()
  const lineNumbersRef = useRef<HTMLDivElement>(null)
  const refreshRequestRef = useRef(0)
  const editorSessionRef = useRef(0)
  const domainDraftInitializedRef = useRef(false)
  const savePendingRef = useRef<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const parsedDomains = useMemo(() => parseDomains(domainText), [domainText])

  const source = (hosts?.source as 'url' | 'domain') || 'url'
  const [isShow, setIsShow] = useState(false)
  const [isAdd, setIsAdd] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const domainsChanged =
    !savedDomainSource ||
    !savedDomainsValid ||
    parsedDomains.errors.length > 0 ||
    !lodash.isEqual(parsedDomains.domains, savedDomains)
  const domainErrors = validateDomains
    ? parsedDomains.errors.map(({ line, value }) =>
        i18n.trans('domain_line_error', [String(line), value]),
      )
    : []
  if (validateDomains && !domainText.trim()) domainErrors.push(lang.domain_list_empty)

  const resetDomainEditor = (item?: IHostsListObject) => {
    const domains = getDomainList(item)
    editorSessionRef.current += 1
    domainDraftInitializedRef.current = item?.source === 'domain'
    setIsSaving(false)
    setDomainText(item?.source === 'domain' ? domains.join('\n') : '')
    setSavedDomains(parseDomains(domains.join('\n')).domains)
    setSavedDomainSource(item?.source === 'domain')
    setSavedDomainsValid(!!item && getRefreshTarget(item) !== null)
    setValidateDomains(false)
    refreshRequestRef.current += 1
    setIsRefreshing(false)
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = 0
  }

  const onCancel = () => {
    editorSessionRef.current += 1
    refreshRequestRef.current += 1
    setIsSaving(false)
    setHosts(null)
    setIsShow(false)
  }

  const updateRefreshMetadata = (item: IHostsListObject, id: string) => {
    setHosts((current) => (current?.id === id ? mergeRefreshMetadata(current, item) : current))
  }

  const refreshHosts = async (id: string, isDomain = true) => {
    try {
      const result: IOperationResult = await actions.refreshHosts(id)
      // Partial and failed batches also return metadata for each domain.
      if (result.data) updateRefreshMetadata(result.data, id)
      if (
        !result.success ||
        (isDomain &&
          (result.data?.domain_refresh_status === 'partial' ||
            result.data?.domain_refresh_status === 'failed'))
      ) {
        showErrorNotification({
          title: isDomain ? lang.domain_results : lang.refresh,
          message:
            result.code === 'domain_partial' || result.code === 'domain_failed'
              ? lang.domain_resolution_incomplete
              : result.message || lang.fail,
        })
      } else {
        const results = isDomain && result.data ? getDomainResults(result.data) : []
        showSuccessNotification({
          title: isDomain ? lang.domain_results : lang.refresh,
          message: results?.length
            ? i18n.trans(
                'domain_result_summary',
                ['resolved', 'stale', 'failed'].map((status) =>
                  String(results.filter((item) => item.status === status).length),
                ),
              )
            : lang.success,
        })
      }
    } catch (error) {
      showErrorNotification({
        title: lang.refresh,
        message: getErrorMessage(error, lang.fail),
      })
    }
  }

  const onSave = async (session: number) => {
    const data: Omit<IHostsListObject, 'id'> & { id?: string } = { ...hosts }
    // Persist the displayed default too, so a queued edit cannot leave the
    // latest node's source discriminator paired with this form's old URL.
    if (data.type === 'remote') data.source = data.source || 'url'

    const keysToTrim = ['title', 'url']
    keysToTrim.map((k) => {
      if (typeof data[k] === 'string') {
        data[k] = data[k].trim()
      }
    })

    if (data.type === 'remote' && (data.source as string) === 'domain') {
      setValidateDomains(true)
      if (parsedDomains.errors.length || !parsedDomains.domains.length) {
        return
      }
      data.domains = parsedDomains.domains
      // Keep old clients able to read the first domain during migration.
      data.url = parsedDomains.domains[0]
    } else if (data.type === 'remote') {
      delete data.domains
    }

    let refreshId: string | undefined

    if (isAdd) {
      const h: IHostsListObject = {
        ...data,
        id: uuidv4(),
      }
      await setList((list) => [...list, h])
      if (session === editorSessionRef.current) {
        agent.broadcast(events.select_hosts, h.id, 1000)
      }
      if (data.type === 'remote' && (data.source as string) === 'domain') {
        refreshId = h.id
      }
    } else if (data && data.id) {
      const id = data.id
      // Only form fields belong to this edit. Apply them to the latest node,
      // preserving concurrent switch changes and remote-refresh metadata.
      const fields = lodash.pick(data, [
        'title',
        'type',
        'url',
        'domains',
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
          ((h.source || 'url') !== 'domain' ||
            !lodash.isEqual(h.domains === undefined ? [h.url] : h.domains, data.domains))
        if ((h.source || 'url') !== (data.source || 'url')) {
          // A subscription and a DNS list have different cache provenance.
          // Explicitly empty results also disable legacy content fallback.
          h.domain_results = []
          delete h.domain_refresh_status
          delete h.last_attempt
          delete h.last_attempt_ms
        }
        if (data.type === 'remote' && data.source !== 'domain') delete h.domains
        Object.assign(h, fields)
        edited = h
        return list
      })
      if (edited) {
        const saved = edited
        setCurrentHosts((current) =>
          current?.id === id ? mergeRefreshMetadata(saved, current) || saved : current,
        )
      }
      if (refresh) refreshId = id
    } else {
      showErrorNotification({ title: lang.fail, message: lang.unknown_error })
      return
    }

    if (data.type === 'remote' && data.source === 'domain') {
      const messages = [
        i18n.trans(refreshId ? 'domain_saved_resolving' : 'domain_saved', [
          String(parsedDomains.domains.length),
        ]),
      ]
      if (parsedDomains.duplicates) {
        messages.push(i18n.trans('domain_duplicates', [String(parsedDomains.duplicates)]))
      }
      showSuccessNotification({ title: lang.domain_config_saved, message: messages.join(' · ') })
    }
    if (refreshId) void refreshHosts(refreshId)
    if (session === editorSessionRef.current) setIsShow(false)
  }

  // setList reports persistence failures. Keep the editor open and consume
  // the rejection at event boundaries so no success follow-up runs.
  const saveFromUI = () => {
    const session = editorSessionRef.current
    if (savePendingRef.current === session) return
    savePendingRef.current = session
    setIsSaving(true)
    onSave(session)
      .catch((error: unknown) => console.error(error))
      .finally(() => {
        if (savePendingRef.current === session) savePendingRef.current = null
        if (editorSessionRef.current === session) setIsSaving(false)
      })
  }

  const onUpdate = (kv: Partial<IHostsListObject>) => {
    setHosts((current) => Object.assign({}, current, kv))
  }

  useOnBroadcast(events.edit_hosts_info, (hosts?: IHostsListObject) => {
    resetDomainEditor(hosts)
    setHosts(hosts || null)
    setIsAdd(!hosts)
    setIsShow(true)
  })

  useOnBroadcast(events.add_new, () => {
    resetDomainEditor()
    setHosts(null)
    setIsAdd(true)
    setIsShow(true)
  })

  useOnBroadcast(
    events.hosts_refreshed,
    (_hosts: IHostsListObject) => {
      if (hosts && hosts.id === _hosts.id) {
        updateRefreshMetadata(_hosts, _hosts.id)
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
            onChange={(v) => {
              if (v === 'domain' && !domainDraftInitializedRef.current) {
                setDomainText(typeof hosts?.url === 'string' ? hosts.url : '')
                domainDraftInitializedRef.current = true
              }
              setValidateDomains(false)
              onUpdate({ source: v as 'url' | 'domain' })
            }}
            data={[
              { value: 'url', label: lang.source_url },
              { value: 'domain', label: lang.source_domain },
            ]}
          />
        </Box>

        <Box className={styles.ln}>
          {source === 'domain' ? (
            <>
              <Group justify="space-between" gap="8px" mb="8px">
                <Text component="label" htmlFor={domainInputId}>
                  {lang.domain_list}
                </Text>
                <Text size="xs" c="dimmed" aria-live="polite">
                  {i18n.trans('domain_count', [String(parsedDomains.domains.length)])}
                </Text>
              </Group>
              <div
                className={styles.domain_editor}
                data-invalid={domainErrors.length > 0 || undefined}
              >
                <div ref={lineNumbersRef} className={styles.line_numbers} aria-hidden="true">
                  {Array.from(
                    { length: Math.max(6, domainText.split(/\r\n|\r|\n/).length) },
                    (_, i) => (
                      <div key={i}>{i + 1}</div>
                    ),
                  )}
                </div>
                <textarea
                  id={domainInputId}
                  className={styles.domain_input}
                  aria-label={lang.domain_list}
                  aria-invalid={domainErrors.length > 0 || undefined}
                  aria-describedby={`${domainInputId}-hint${domainErrors.length ? ` ${domainInputId}-errors` : ''}`}
                  value={domainText}
                  rows={6}
                  wrap="off"
                  spellCheck={false}
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder={lang.domain_placeholder}
                  onChange={(e) => setDomainText(e.target.value)}
                  onScroll={(e) => {
                    if (lineNumbersRef.current) {
                      lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop
                    }
                  }}
                  onKeyDown={(e) => {
                    if (
                      e.key === 'Enter' &&
                      (e.metaKey || e.ctrlKey) &&
                      !e.nativeEvent.isComposing &&
                      e.keyCode !== 229
                    ) {
                      e.preventDefault()
                      saveFromUI()
                    }
                  }}
                />
              </div>
              {domainErrors.length ? (
                <Box id={`${domainInputId}-errors`} role="alert" mt="4px">
                  {domainErrors.map((error) => (
                    <Text key={error} size="xs" c="red" className={styles.domain_error}>
                      {error}
                    </Text>
                  ))}
                </Box>
              ) : null}
              <Box id={`${domainInputId}-hint`} mt="4px">
                <Text size="xs" c="dimmed">
                  {lang.domain_list_hint}
                </Text>
                {parsedDomains.duplicates || parsedDomains.normalized ? (
                  <Text size="xs" c="dimmed" aria-live="polite">
                    {[
                      parsedDomains.duplicates
                        ? i18n.trans('domain_duplicates', [String(parsedDomains.duplicates)])
                        : '',
                      parsedDomains.normalized
                        ? i18n.trans('domain_normalized', [String(parsedDomains.normalized)])
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                ) : null}
                <Text size="xs" c="dimmed">
                  {i18n.trans('domain_hint', [dnsProviderLabel(configs?.dns_provider)])}
                </Text>
              </Box>
            </>
          ) : (
            <>
              <Text mb="8px">URL</Text>
              <TextInput
                aria-label="URL"
                value={hosts?.url || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  onUpdate({ url: e.target.value })
                }
                placeholder={lang.url_placeholder}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) =>
                  e.key === 'Enter' &&
                  !e.nativeEvent.isComposing &&
                  e.keyCode !== 229 &&
                  saveFromUI()
                }
              />
            </>
          )}
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
                {source === 'domain' ? lang.domain_last_attempt : lang.last_refresh}
                {(source === 'domain'
                  ? getRefreshTime(hosts?.last_attempt) || getRefreshTime(hosts?.last_refresh)
                  : getRefreshTime(hosts?.last_refresh)) || 'N/A'}
              </span>
              <Button
                size={source === 'domain' ? 'compact-sm' : 'sm'}
                variant="subtle"
                loading={isRefreshing}
                disabled={
                  isRefreshing || (source === 'domain' ? domainsChanged : savedDomainSource)
                }
                onClick={() => {
                  if (!hosts) return

                  const request = ++refreshRequestRef.current
                  setIsRefreshing(true)
                  void refreshHosts(hosts.id, source === 'domain').finally(() => {
                    if (request === refreshRequestRef.current) setIsRefreshing(false)
                  })
                }}
              >
                {source === 'domain' && domainsChanged ? lang.domain_save_to_resolve : lang.refresh}
              </Button>
            </Box>
          )}
          {source === 'domain' && savedDomainSource && hosts && !isAdd ? (
            <Box mt="8px">
              <DomainResolutionResults hosts={{ ...hosts, domains: savedDomains }} />
            </Box>
          ) : null}
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
            <Button onClick={saveFromUI} loading={isSaving}>
              {lang.btn_ok}
            </Button>
          </Group>
        </SimpleGrid>
      }
    >
      <Box
        className={hosts?.type === 'remote' && source === 'domain' ? styles.domain_form : undefined}
      >
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
              e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229 && saveFromUI()
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
