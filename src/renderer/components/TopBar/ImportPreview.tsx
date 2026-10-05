import type { IHostsListObject } from '@common/data'
import {
  changeImportSelection,
  importCounts,
  importLeaves,
  importNodes,
  importSelectedIds,
  importSelectionState,
  importedTree,
  type ImportPreview as Preview,
} from '@common/import'
import type { LanguageDict } from '@common/types'
import { Button, Checkbox, Modal, Radio, Select, Text } from '@mantine/core'
import HostsViewer from '@renderer/components/HostsViewer'
import { actions } from '@renderer/core/agent'
import {
  getErrorMessage,
  showErrorNotification,
  showSuccessNotification,
} from '@renderer/core/notify'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import {
  IconArrowLeft,
  IconChevronDown,
  IconChevronRight,
  IconFileText,
  IconFolder,
  IconStack2,
  IconCloudDownload,
} from '@tabler/icons-react'
import { useEffect, useId, useRef, useState } from 'react'
import clsx from 'clsx'
import styles from './ImportPreview.module.scss'

export function importErrorMessage(error: unknown, lang: LanguageDict): string {
  const e = error as { kind?: string; detail?: string | unknown }
  if (e?.kind === 'changed') return lang.import_changed
  if (e?.kind === 'expired') return lang.import_expired
  if (e?.kind === 'storage') return getErrorMessage(e.detail, lang.import_fail)
  const code = typeof e?.detail === 'string' ? e.detail : error
  if (code === 'new_version') return lang.import_new_version
  if (code === 'empty_import') return lang.import_empty
  if (code === 'invalid_reference' || code === 'cyclic_reference')
    return lang.import_reference_error
  if (code === 'missing_dependency') return lang.import_dependency_error
  if (code === 'application_recovery') return lang.import_application_recovery
  if (
    [
      'parse_error',
      'invalid_data',
      'invalid_data_key',
      'invalid_v3_data',
      'duplicate_id',
      'missing_content',
    ].includes(String(code))
  )
    return lang.import_invalid
  const message = getErrorMessage(code, lang.import_fail)
  return message === lang.import_fail ? message : `${lang.import_fail} [${message}]`
}

interface Props {
  preview: Preview
  onClose: () => void
}

export default function ImportPreview({ preview: initial, onClose }: Props) {
  const { lang, i18n } = useI18n()
  const { loadHostsData, setCurrentHosts } = useHostsData()
  const [preview, setPreview] = useState(initial)
  const [mode, setMode] = useState<'append' | 'replace'>('append')
  const [selected, setSelected] = useState(() => new Set(initial.list.flatMap(importLeaves)))
  const [collapsed, setCollapsed] = useState(new Set<string>())
  const [destination, setDestination] = useState('folder')
  const [detail, setDetail] = useState<IHostsListObject | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [notice, setNotice] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [refreshRequired, setRefreshRequired] = useState(false)
  const submitting = useRef(false)
  const backButton = useRef<HTMLButtonElement>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const modeId = useId()
  useEffect(() => {
    if (confirm) backButton.current?.focus()
  }, [confirm])
  useEffect(() => {
    if (error) scroll.current?.scrollTo({ top: 0 })
  }, [error])
  const errorKind = (error as { kind?: string } | null)?.kind
  const expired = errorKind === 'expired'
  const existing = importCounts(preview.existing_list)
  const counts = importCounts(preview.list, mode === 'append' ? selected : undefined)
  const all = preview.list.flatMap(importLeaves)
  const flat = importNodes(preview.list)
  const title = (node: IHostsListObject) => node.title || lang.untitled
  const t = (key: Parameters<typeof i18n.trans>[0], ...args: (number | string)[]) =>
    i18n.trans(key, args.map(String))
  const affected = mode === 'append' ? importedTree(preview.list, selected) : preview.list
  const impact =
    mode === 'append'
      ? t('import_impact', existing.configurations, counts.configurations, counts.folders)
      : t(
          'import_replace_impact',
          existing.configurations,
          existing.folders,
          counts.configurations,
          counts.folders,
        )

  const close = () => {
    if (submitting.current) return
    void actions.discardImport(preview.id).catch(console.error)
    onClose()
  }

  const commit = async () => {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setError(null)
    try {
      await actions.commitImport({
        id: preview.id,
        mode,
        selected: importSelectedIds(preview.list, selected),
        folder_name: mode === 'append' && destination === 'folder' ? preview.name : null,
        confirmed: mode === 'replace' && confirm,
      })
    } catch (e) {
      setError(e)
      if ((e as { kind?: string })?.kind === 'changed') setRefreshRequired(true)
      submitting.current = false
      setBusy(false)
      return
    }
    // A renderer refresh failure must not offer to execute an already committed
    // import a second time. Close first; the backend also broadcasts the change.
    setCurrentHosts(null)
    onClose()
    showSuccessNotification({ title: lang.import, message: lang.import_done })
    await loadHostsData().catch((e: unknown) =>
      showErrorNotification({ title: lang.fail, message: getErrorMessage(e, lang.fail) }),
    )
  }

  const rebase = async () => {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    try {
      setPreview(await actions.rebaseImport(preview.id))
      setConfirm(false)
      setRefreshRequired(false)
      setError(null)
    } catch (e) {
      setError(e)
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  const choose = (node: IHostsListObject, checked: boolean) => {
    const update = changeImportSelection(preview.list, selected, node, checked)
    setSelected(update.selected)
    setNotice(update.removedGroups)
  }

  const tree = (nodes: IHostsListObject[], depth = 0, readOnly = false) =>
    nodes.map((node) => {
      const folder = node.type === 'folder'
      const isCollapsed = !readOnly && collapsed.has(node.id)
      const status = importSelectionState(node, selected)
      const Icon = folder
        ? IconFolder
        : node.type === 'remote'
          ? IconCloudDownload
          : node.type === 'group'
            ? IconStack2
            : IconFileText
      return (
        <div key={node.id}>
          <div className={styles.row} style={{ paddingInlineStart: 12 + Math.min(depth, 8) * 14 }}>
            {!readOnly && mode === 'append' && (
              <Checkbox
                size="xs"
                checked={status.checked}
                indeterminate={status.indeterminate}
                disabled={busy}
                aria-label={t('import_select', title(node))}
                onChange={(e) => choose(node, e.currentTarget.checked)}
              />
            )}
            <button
              type="button"
              className={styles.item}
              disabled={busy || readOnly}
              aria-label={t(
                folder ? (isCollapsed ? 'import_expand' : 'import_collapse') : 'import_inspect',
                title(node),
              )}
              aria-expanded={folder ? !isCollapsed : undefined}
              onClick={() =>
                folder
                  ? setCollapsed((prev) => {
                      const next = new Set(prev)
                      if (next.has(node.id)) next.delete(node.id)
                      else next.add(node.id)
                      return next
                    })
                  : setDetail(node)
              }
            >
              {folder &&
                (isCollapsed ? <IconChevronRight size={13} /> : <IconChevronDown size={13} />)}
              <Icon size={15} />
              <span>{title(node)}</span>
            </button>
            {!readOnly && mode === 'append' && !folder && (
              <span className={styles.meta}>
                {preview.same_content.includes(node.id)
                  ? lang.import_same_content
                  : preview.same_title.includes(node.id)
                    ? lang.import_same_title
                    : ''}
              </span>
            )}
          </div>
          {folder && !isCollapsed && tree(node.children || [], depth + 1, readOnly)}
        </div>
      )
    })

  return (
    <Modal
      opened
      onClose={close}
      title={
        confirm ? lang.import_confirm_title : detail ? lang.import_content : lang.import_preview
      }
      size={620}
      centered
      padding={0}
      closeOnClickOutside={false}
      closeOnEscape={!busy}
      withCloseButton={!busy}
      classNames={{
        inner: styles.inner,
        content: styles.modal,
        header: styles.header,
        body: styles.body,
      }}
    >
      <div className={styles.source}>
        {preview.name} ·{' '}
        {t(
          'import_counts',
          importCounts(preview.list).configurations,
          importCounts(preview.list).folders,
        )}
      </div>
      {!confirm && !detail && (
        <div className={styles.controls}>
          <Radio.Group
            value={mode}
            onChange={(v) => {
              setMode(v as 'append' | 'replace')
              setNotice(false)
            }}
            aria-label={lang.import}
          >
            <div className={styles.modes}>
              <Radio.Card
                value="append"
                disabled={busy}
                className={styles.modeCard}
                aria-label={lang.import_append}
                aria-describedby={`${modeId}-append-description`}
                tabIndex={mode === 'append' ? 0 : -1}
              >
                <Radio.Indicator size="sm" variant="outline" disabled={busy} />
                <span className={styles.modeContent}>
                  <span className={styles.modeTitle}>
                    <span>{lang.import_append}</span>
                    <span className={styles.recommended}>{lang.import_recommended}</span>
                  </span>
                  <span className={styles.modeDescription} id={`${modeId}-append-description`}>
                    {lang.import_append_help}
                  </span>
                </span>
              </Radio.Card>
              <Radio.Card
                value="replace"
                disabled={busy}
                className={styles.modeCard}
                aria-label={lang.import_replace}
                aria-describedby={`${modeId}-replace-description`}
                tabIndex={mode === 'replace' ? 0 : -1}
              >
                <Radio.Indicator size="sm" variant="outline" disabled={busy} />
                <span className={styles.modeContent}>
                  <span className={styles.modeTitle}>{lang.import_replace}</span>
                  <span className={styles.modeDescription} id={`${modeId}-replace-description`}>
                    {lang.import_replace_help}
                  </span>
                </span>
              </Radio.Card>
            </div>
          </Radio.Group>
          <div className={styles.help} role="status">
            {notice ? lang.import_dependencies_removed : null}
          </div>
          {mode === 'append' && (
            <div className={styles.destination}>
              <span>{lang.import_destination}</span>
              <Select
                aria-label={lang.import_destination}
                size="xs"
                value={destination}
                allowDeselect={false}
                disabled={busy}
                onChange={(v) => setDestination(v || 'folder')}
                data={[
                  { value: 'folder', label: t('import_new_folder', preview.name) },
                  { value: 'root', label: lang.import_root },
                ]}
              />
            </div>
          )}
        </div>
      )}
      {!confirm && !detail && (
        <div className={styles.listHeader} data-testid="import-list-header">
          {mode === 'append' ? (
            <Checkbox
              size="xs"
              label={lang.select_all}
              checked={all.every((id) => selected.has(id))}
              indeterminate={selected.size > 0 && selected.size < all.length}
              disabled={busy}
              onChange={(e) => {
                setSelected(new Set(e.currentTarget.checked ? all : []))
                setNotice(false)
              }}
            />
          ) : (
            lang.import_replace
          )}
          <span>{t('import_counts', counts.configurations, counts.folders)}</span>
        </div>
      )}
      {!confirm && detail && (
        <div className={styles.detailToolbar} data-testid="import-detail-toolbar">
          <Button
            variant="outline"
            size="xs"
            leftSection={<IconArrowLeft size={14} aria-hidden="true" />}
            onClick={() => setDetail(null)}
          >
            {lang.import_back_to_list}
          </Button>
        </div>
      )}
      <div
        ref={scroll}
        key={confirm ? 'confirm' : detail?.id || 'list'}
        className={clsx(
          styles.scroll,
          !confirm && detail && detail.type !== 'group' && styles.contentPane,
        )}
        data-testid="import-scroll"
      >
        {error ? (
          <div role="alert" className={styles.error}>
            {importErrorMessage(error, lang)}
            {refreshRequired && !expired && (
              <Button mt="xs" size="xs" onClick={rebase} loading={busy}>
                {lang.import_refresh_preview}
              </Button>
            )}
          </div>
        ) : null}
        {confirm ? (
          <div className={styles.confirm}>
            <Text c="red" size="sm" fw={600}>
              {impact}
            </Text>
            <Text size="sm" mt="sm">
              {lang.import_confirm_warning}
            </Text>
            <details>
              <summary>{lang.import_removed}</summary>
              {tree(preview.existing_list, 0, true)}
            </details>
            <details>
              <summary>{t('import_counts', counts.configurations, counts.folders)}</summary>
              {tree(affected, 0, true)}
            </details>
          </div>
        ) : detail ? (
          <div className={clsx(styles.detail, detail.type !== 'group' && styles.contentDetail)}>
            <div className={styles.detailHeading}>
              <Text size="sm" fw={600}>
                {title(detail)}
              </Text>
              {detail.type === 'remote' && (
                <Text size="xs" c="dimmed">
                  {detail.source === 'domain' ? detail.domains?.join(', ') : detail.url}
                </Text>
              )}
            </div>
            {detail.type === 'group' ? (
              <>
                <Text size="xs" c="dimmed">
                  {lang.import_dependencies}
                </Text>
                <ul>
                  {detail.include?.map((id) => (
                    <li key={id}>{title(flat.find((node) => node.id === id)!)}</li>
                  ))}
                </ul>
              </>
            ) : (
              <div className={styles.viewer} data-testid="import-content-viewer">
                <HostsViewer content={preview.contents[detail.id] || ''} showStatusBar={false} />
              </div>
            )}
          </div>
        ) : (
          tree(preview.list)
        )}
      </div>
      <footer className={styles.footer} data-testid="import-footer">
        {!confirm && <div className={styles.impact}>{impact}</div>}
        <div className={styles.actions}>
          {!confirm && <span className={styles.footnote}>{lang.import_disabled}</span>}
          <Button
            ref={backButton}
            size="xs"
            variant="default"
            disabled={busy}
            onClick={() => (confirm ? setConfirm(false) : close())}
          >
            {confirm ? lang.import_back : lang.btn_cancel}
          </Button>
          <Button
            size="xs"
            color={mode === 'replace' ? 'red' : undefined}
            loading={busy}
            disabled={refreshRequired || expired || (mode === 'append' && selected.size === 0)}
            onClick={(event) => {
              if (confirm && event.detail > 1) return
              if (mode === 'replace' && !confirm) {
                setDetail(null)
                setConfirm(true)
              } else void commit()
            }}
          >
            {mode === 'append'
              ? lang.import_append_action
              : confirm
                ? lang.import_replace
                : lang.import_next_step}
          </Button>
        </div>
      </footer>
    </Modal>
  )
}
