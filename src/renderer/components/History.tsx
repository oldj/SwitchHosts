/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { IHostsHistoryObject } from '@common/data'
import events from '@common/events'
import {
  Box,
  Button,
  Center,
  Flex,
  Group,
  Loader,
  Alert,
  Modal,
  Stack,
  Switch,
  ScrollArea,
  Select,
  Text,
  Tooltip,
} from '@mantine/core'
import HostsViewer from '@renderer/components/HostsViewer'
import SideDrawer from '@renderer/components/SideDrawer'
import { actions } from '@renderer/core/agent'
import {
  getErrorMessage,
  showErrorNotification,
  showSuccessNotification,
} from '@renderer/core/notify'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import useConfigs from '@renderer/models/useConfigs'
import useI18n from '@renderer/models/useI18n'
import { IconFileTime, IconHelpCircle, IconHistory, IconX, IconTrash } from '@tabler/icons-react'
import clsx from 'clsx'
import dayjs from 'dayjs'
import prettyBytes from 'pretty-bytes'
import React, { useRef, useState } from 'react'
import styles from './History.module.scss'

interface IHistoryProps {
  list: IHostsHistoryObject[]
  selectedItem: IHostsHistoryObject | undefined
  setSelectedItem: (item: IHostsHistoryObject) => void
}

const HistoryList = (props: IHistoryProps): React.ReactElement => {
  const { list, selectedItem, setSelectedItem } = props
  const { lang } = useI18n()

  if (list.length === 0) {
    return (
      <Center h="100%" style={{ opacity: 0.5, fontSize: 'var(--mantine-font-size-lg)' }}>
        {lang.no_record}
      </Center>
    )
  }

  return (
    <Flex h="100%" mih={0} style={{ minHeight: 0, overflow: 'hidden' }}>
      <Box
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          marginRight: 12,
          border: '1px solid var(--swh-border-color-0)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        <HostsViewer content={selectedItem ? selectedItem.content : ''} />
      </Box>
      <ScrollArea
        w={220}
        h="100%"
        scrollbars="y"
        type="hover"
        style={{
          border: '1px solid var(--swh-border-color-0)',
          borderRadius: 6,
          minHeight: 0,
          padding: 4,
        }}
      >
        {list.map((item) => (
          <Box
            component="button"
            type="button"
            aria-pressed={item.id === selectedItem?.id}
            key={item.id}
            onClick={() => setSelectedItem(item)}
            px="12px"
            py="8px"
            style={{
              userSelect: 'none',
              width: '100%',
              border: 0,
              textAlign: 'left',
              cursor: 'pointer',
              background: item.id === selectedItem?.id ? undefined : 'transparent',
              color: item.id === selectedItem?.id ? undefined : 'inherit',
            }}
            className={clsx(styles.item, item.id === selectedItem?.id && styles.selected)}
          >
            <Group gap="8px" wrap="nowrap" align="flex-start">
              <Box>
                <IconFileTime size={16} />
              </Box>
              <Box style={{ minWidth: 0 }}>
                <Text size="sm">{dayjs(item.add_time_ms).format('YYYY-MM-DD HH:mm:ss')}</Text>
                <Group
                  gap="8px"
                  style={{
                    lineHeight: '14px',
                    fontSize: 9,
                    opacity: 0.6,
                  }}
                >
                  <Box>{item.content.split('\n').length} lines</Box>
                  <Box>{prettyBytes(item.content.length)}</Box>
                </Group>
              </Box>
            </Group>
          </Box>
        ))}
      </ScrollArea>
    </Flex>
  )
}

interface LimitResult {
  confirmation_required: boolean
  previous_limit: number
  limit: number
  delete_count: number
  retained_count: number
}

type Confirmation =
  | { kind: 'delete'; item: IHostsHistoryObject }
  | { kind: 'clear' }
  | { kind: 'limit'; result: LimitResult }

const History = () => {
  const { configs, updateConfigs, loadConfigs } = useConfigs()
  const { lang, i18n } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const operationInFlight = useRef(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [error, setError] = useState('')
  const [list, setList] = useState<IHostsHistoryObject[]>([])
  const [selectedItem, setSelectedItem] = useState<IHostsHistoryObject>()
  const [confirmation, setConfirmation] = useState<Confirmation>()

  const reportError = (e: unknown) => {
    const message = getErrorMessage(e, lang.unknown_error)
    setError(message)
    showErrorNotification({ title: lang.history_error, message })
  }

  const loadData = async () => {
    setIsLoading(true)
    try {
      // Refresh both halves of the snapshot. In particular, a successful trim
      // followed by a failed config read must offer a retry, not leave a stale
      // dropdown and an apparently actionable old list.
      await loadConfigs()
      const nextList: IHostsHistoryObject[] = (await actions.getHistoryList()).reverse()
      setList(nextList)
      setSelectedItem(
        (previous) => nextList.find((item) => item.id === previous?.id) || nextList[0],
      )
      setLoadFailed(false)
    } catch (e) {
      setLoadFailed(true)
      throw e
    } finally {
      setIsLoading(false)
    }
  }

  const run = async (action: () => Promise<void>) => {
    // Broadcasts can arrive before React commits the disabled controls.
    if (operationInFlight.current) return
    operationInFlight.current = true
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (e) {
      reportError(e)
    } finally {
      operationInFlight.current = false
      setBusy(false)
    }
  }

  const onClose = () => {
    if (busy || isLoading || confirmation) return
    setIsOpen(false)
    setList([])
    setSelectedItem(undefined)
    setError('')
  }

  const updateLimit = async (limit: number, preview?: LimitResult) => {
    const result: LimitResult = await actions.updateHistoryLimit({
      limit,
      confirmation: preview
        ? { previous_limit: preview.previous_limit, delete_count: preview.delete_count }
        : null,
    })
    if (result.confirmation_required) {
      setConfirmation({ kind: 'limit', result })
      return
    }
    setConfirmation(undefined)
    await loadData()
  }

  const confirm = async () => {
    if (!confirmation) return
    if (confirmation.kind === 'limit') {
      await updateLimit(confirmation.result.limit, confirmation.result)
      return
    }
    if (confirmation.kind === 'clear') {
      await actions.clearHistory()
    } else {
      await actions.deleteHistory(confirmation.item.id)
    }
    setConfirmation(undefined)
    await loadData()
    showSuccessNotification({ title: lang.delete, message: lang.success })
  }

  useOnBroadcast(
    events.show_history,
    () => {
      setIsOpen(true)
      void run(loadData)
    },
    [lang],
  )

  useOnBroadcast(
    'apply_history_error',
    (message: string) => {
      reportError(message)
    },
    [lang],
  )

  const disabled = busy || isLoading || loadFailed || !configs
  const historyLimitValues = Array.from(
    new Set([10, 50, 100, 500, configs?.history_limit ?? 50]),
  ).sort((a, b) => a - b)
  const limitLabel = (value: number) => (value === 0 ? lang.history_unlimited : String(value))
  const preview = confirmation?.kind === 'limit' ? confirmation.result : undefined

  return (
    <>
      <SideDrawer
        opened={isOpen}
        onClose={onClose}
        size="lg"
        scrollable={false}
        closeOnEscape={!confirmation && !busy}
        closeOnClickOutside={!confirmation && !busy}
        title={
          <Group gap="8px">
            <IconHistory size={16} />
            <Box>{lang.system_hosts_history}</Box>
          </Group>
        }
        footer={
          <Group justify="space-between" gap="sm">
            <Button
              variant="outline"
              color="red"
              disabled={disabled || list.length === 0}
              onClick={() => setConfirmation({ kind: 'clear' })}
              leftSection={<IconTrash size={16} />}
            >
              {lang.clear_history}
            </Button>
            <Group gap="sm">
              <Button
                variant="outline"
                disabled={disabled || !selectedItem}
                onClick={() =>
                  selectedItem && setConfirmation({ kind: 'delete', item: selectedItem })
                }
                leftSection={<IconX size={16} />}
              >
                {lang.history_delete_selected}
              </Button>
              <Button onClick={onClose} variant="outline" disabled={busy || isLoading}>
                {lang.close}
              </Button>
            </Group>
          </Group>
        }
      >
        <Stack h="100%" gap="sm" style={{ minHeight: 0 }}>
          <Group justify="space-between" gap="sm">
            <Switch
              label={lang.history_record}
              checked={configs?.history_enabled ?? true}
              disabled={busy || isLoading || !configs}
              onChange={(event) => {
                const enabled = event.currentTarget.checked
                // useConfigs already reports and rolls back rejected writes.
                void run(async () => {
                  await updateConfigs({ history_enabled: enabled }).catch(() => {})
                  await loadData()
                })
              }}
            />
            <Group gap="xs" wrap="nowrap">
              <Text size="sm">{lang.system_hosts_history_limit}</Text>
              <Select
                aria-label={lang.system_hosts_history_limit}
                data={historyLimitValues.map((value) => ({
                  value: String(value),
                  label: limitLabel(value),
                }))}
                value={String(configs?.history_limit ?? 50)}
                onChange={(value) => {
                  if (value !== null && Number(value) !== configs?.history_limit) {
                    void run(() => updateLimit(Number(value)))
                  }
                }}
                disabled={disabled}
                w={110}
                allowDeselect={false}
              />
              <Tooltip label={lang.system_hosts_history_help}>
                <Box style={{ display: 'flex' }}>
                  <IconHelpCircle size={16} />
                </Box>
              </Tooltip>
            </Group>
          </Group>
          {!configs?.history_enabled && configs && (
            <Text size="xs" c="dimmed">
              {lang.history_disabled_hint}
            </Text>
          )}
          {!loadFailed && (
            <Text size="sm" c="dimmed">
              {i18n.trans('history_count', [String(list.length)])}
            </Text>
          )}
          {error && (
            <Alert color="red" title={lang.history_error}>
              {error}
              {loadFailed && (
                <Button
                  variant="subtle"
                  size="xs"
                  disabled={busy}
                  onClick={() => void run(loadData)}
                >
                  {lang.history_retry}
                </Button>
              )}
            </Alert>
          )}
          <Box style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {isLoading ? (
              <Center h="100%">
                <Group gap="sm">
                  <Loader />
                  <Text>{lang.loading}</Text>
                </Group>
              </Center>
            ) : (
              !loadFailed && (
                <HistoryList
                  list={list}
                  selectedItem={selectedItem}
                  setSelectedItem={setSelectedItem}
                />
              )
            )}
          </Box>
        </Stack>
      </SideDrawer>

      <Modal
        opened={!!confirmation}
        onClose={() => !busy && setConfirmation(undefined)}
        centered
        title={
          preview
            ? lang.history_trim_title
            : confirmation?.kind === 'clear'
              ? lang.clear_history
              : lang.delete
        }
        withCloseButton={false}
        closeOnEscape={!busy}
        closeOnClickOutside={!busy}
      >
        <Stack gap="sm">
          {preview ? (
            <>
              <Text>
                {i18n.trans('history_trim_change', [
                  limitLabel(preview.previous_limit),
                  limitLabel(preview.limit),
                ])}
              </Text>
              <Text>
                {i18n.trans('history_trim_details', [
                  String(preview.retained_count),
                  String(preview.delete_count),
                ])}
              </Text>
              <Text>{lang.history_irreversible}</Text>
            </>
          ) : (
            <Text>
              {confirmation?.kind === 'clear'
                ? lang.history_clear_confirm
                : lang.system_hosts_history_delete_confirm}
            </Text>
          )}
          <Group justify="flex-end" mt="sm">
            <Button variant="outline" disabled={busy} onClick={() => setConfirmation(undefined)}>
              {lang.btn_cancel}
            </Button>
            <Button color="red" loading={busy} onClick={() => void run(confirm)}>
              {preview
                ? i18n.trans('history_trim_confirm', [String(preview.delete_count)])
                : confirmation?.kind === 'clear'
                  ? lang.clear_history
                  : lang.delete}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}

export default History
