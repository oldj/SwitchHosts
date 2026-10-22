/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { IHostsListObject } from '@common/data'
import events from '@common/events'
import { flatten } from '@common/hostsFn'
import { normalizeLineEndings } from '@common/newlines'
import { IFindShowSourceParam } from '@common/types'
import StatusBar from '@renderer/components/StatusBar'
import ConfirmModal from '@renderer/components/ConfirmModal'
import useI18n from '@renderer/models/useI18n'
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { getErrorMessage, showErrorNotification } from '@renderer/core/notify'
import useHostsData from '@renderer/models/useHostsData'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useDebounceFn } from 'ahooks'
import clsx from 'clsx'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  boundaryLabels,
  buildExtensions,
  type BuiltExtensions,
  readOnlyExtensions,
} from './hosts_cm'
import {
  toggleCommentByLine,
  toggleCommentBySelection,
  toggleCommentBySelections,
} from './hosts_highlight'
import styles from './HostsEditor.module.scss'
import {
  getEditorDrafts,
  type EditorDrafts,
  type Draft,
  draftsChanged,
  scheduleDraftApplication,
  cancelDraftApplication,
} from './editorDrafts'

const HostsEditor = () => {
  const { currentHosts, hostsData, isReadOnly, applyDrafts, isApplying } = useHostsData()
  const hostsId = currentHosts?.id || '0'
  const readOnly = isReadOnly(currentHosts)
  const groupMembers =
    currentHosts?.type === 'group' ? JSON.stringify(currentHosts.include ?? []) : null
  // References can also change through import, deletion, or nested groups.
  // Ignore metadata-only refreshes so they do not reset the preview selection.
  const groupStructure =
    currentHosts?.type === 'group'
      ? JSON.stringify(flatten(hostsData.list).map(({ id, type, include }) => [id, type, include]))
      : null
  const [content, setContent] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pendingDraft, setPendingDraft] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [isDiscarding, setIsDiscarding] = useState(false)
  const refDiscard = useRef<{
    id: string
    draft: Draft
    drafts: EditorDrafts
    view: EditorView
    restoring: boolean
  } | null>(null)
  const refBaseContent = useRef('')
  const refBlurAction = useRef<string | null>(null)
  const refPreviousId = useRef(hostsId)

  const { lang } = useI18n()
  const labelsCompartment = useRef(new Compartment())
  const refLang = useRef(lang)
  useEffect(() => {
    refLang.current = lang
  }, [lang])

  const refMount = useRef<HTMLDivElement>(null)
  const refView = useRef<EditorView | null>(null)
  const refContentRequest = useRef(0)
  const refDocumentId = useRef<string | null>(null)
  const refBuilt = useRef<BuiltExtensions | null>(null)
  const refMeasureFrame = useRef<number | null>(null)
  // Refs mirror React state so that callbacks captured by EditorView extensions
  // (which are created once on mount) can always read the latest values.
  const refHostsId = useRef(hostsId)
  const refReadOnly = useRef(readOnly)
  const refDrafts = useRef<EditorDrafts | null>(null)
  // Pending find: when a show_source event arrives before the target hosts is loaded
  // (List broadcasts select_hosts then show_source synchronously, but hostsId only
  // updates on the next render), we stash the params here and apply them once
  // loadContent finishes (with a 3s timeout to avoid stale state).
  const refPendingFind = useRef(new Map<string, { params: IFindShowSourceParam; timer: number }>())

  const clearPendingFind = (id?: string) => {
    for (const [target, pending] of refPendingFind.current) {
      if (id !== undefined && target !== id) continue
      window.clearTimeout(pending.timer)
      refPendingFind.current.delete(target)
    }
  }

  useEffect(
    () => () => {
      clearPendingFind()
      if (refMeasureFrame.current !== null) {
        window.cancelAnimationFrame(refMeasureFrame.current)
        refMeasureFrame.current = null
      }
    },
    [],
  )

  useLayoutEffect(() => {
    refHostsId.current = hostsId
  }, [hostsId])

  useLayoutEffect(() => {
    refReadOnly.current = readOnly
  }, [readOnly])

  const reportSaveError = (error: unknown) => {
    showErrorNotification({
      title: refLang.current.fail,
      message: getErrorMessage(error, refLang.current.fail),
    })
  }
  const cancelDiscard = () => {
    if (!refDiscard.current) return false
    refDiscard.current = null
    setDiscardOpen(false)
    setIsDiscarding(false)
    return true
  }
  const savePending = (isCurrent?: () => boolean) => {
    if (refDiscard.current) return
    if (!isCurrent) cancelDraftApplication()
    void applyDrafts(isCurrent).catch(reportSaveError)
  }
  const refSavePending = useRef(savePending)
  useLayoutEffect(() => {
    refSavePending.current = savePending
  })

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      refBlurAction.current =
        event.target instanceof Element
          ? (event.target.closest('[data-draft-action]')?.getAttribute('data-draft-action') ?? null)
          : null
    }
    const onPointerEnd = () => {
      refBlurAction.current = null
    }
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') cancelDraftApplication()
    }
    const onDraftChange = () => {
      const target = refDiscard.current
      if (target && target.drafts.read(target.id) !== target.draft) cancelDiscard()
      const id = refDocumentId.current
      const draft = id ? refDrafts.current?.read(id) : undefined
      setPendingDraft(!!draft)
      if (id && !draft && refView.current)
        refBaseContent.current = refView.current.state.doc.toString()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('pointerup', onPointerEnd, true)
    document.addEventListener('pointercancel', onPointerEnd, true)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('blur', cancelDraftApplication)
    window.addEventListener('pagehide', cancelDraftApplication)
    window.addEventListener(draftsChanged, onDraftChange)
    return () => {
      cancelDraftApplication()
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('pointerup', onPointerEnd, true)
      document.removeEventListener('pointercancel', onPointerEnd, true)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('blur', cancelDraftApplication)
      window.removeEventListener('pagehide', cancelDraftApplication)
      window.removeEventListener(draftsChanged, onDraftChange)
    }
  }, [])

  // A selection change can come from a keyboard/menu event without DOM blur.
  // This is deliberately not an unmount cleanup: exit only retains the journal.
  useLayoutEffect(() => {
    if (refPreviousId.current !== hostsId) {
      refPreviousId.current = hostsId
      const hadDiscard = cancelDiscard()
      const previous = refDocumentId.current
      if (!hadDiscard && !refBlurAction.current && previous && refDrafts.current?.read(previous)) {
        scheduleDraftApplication((isCurrent) => refSavePending.current(isCurrent))
      }
    }
  }, [hostsId])

  useLayoutEffect(() => {
    if (isApplying || readOnly) cancelDiscard()
  }, [isApplying, readOnly])

  const onDocChange = (nextContent: string) => {
    if (refReadOnly.current || refDocumentId.current !== refHostsId.current) return
    // New intent releases the old read immediately, even if it never returns.
    cancelDiscard()
    // An outstanding read describes an older document. It must not replace
    // edits made since that read started, including the editor's undo history.
    refContentRequest.current += 1
    const normalizedContent = normalizeLineEndings(nextContent)
    setContent(normalizedContent)
    try {
      refDrafts.current?.edit(refHostsId.current, normalizedContent, refBaseContent.current)
    } catch (error) {
      reportSaveError(error)
    }
  }

  const onGutterClick = (lineIndex: number) => {
    if (refReadOnly.current || refDocumentId.current !== refHostsId.current) return
    const view = refView.current
    if (!view) return
    if (view.composing) return

    const code = view.state.doc.toString()
    const sel = view.state.selection.main
    const next = toggleCommentByLine(code, lineIndex, sel.from, sel.to)
    if (!next.changed) return

    const changes = view.state.changes(next.changes)
    view.dispatch({
      changes,
      selection: view.state.selection.map(changes, 1),
    })
    view.focus()
  }

  const toggleComment = () => {
    if (refReadOnly.current || refDocumentId.current !== refHostsId.current) return
    const view = refView.current
    if (!view) return
    // Skip while an IME composition is active to avoid dropping characters.
    if (view.composing) return

    const code = view.state.doc.toString()
    if (view.state.selection.ranges.length > 1) {
      const changes = view.state.changes(
        toggleCommentBySelections(code, view.state.selection.ranges),
      )
      if (changes.empty) return
      view.dispatch({
        changes,
        selection: view.state.selection.map(changes, 1),
        scrollIntoView: true,
      })
      view.focus()
      return
    }
    const sel = view.state.selection.main
    const next = toggleCommentBySelection(code, sel.from, sel.to, true)
    if (!next.changed) return

    view.dispatch({
      changes: next.changes,
      selection: { anchor: next.selectionStart, head: next.selectionEnd },
      scrollIntoView: true,
    })
    view.focus()
  }

  /** Restore a character-offset selection in the editor (used by find/show-source). */
  const setSelection = (params: IFindShowSourceParam) => {
    const view = refView.current
    if (!view) return

    const docLen = view.state.doc.length
    const start = Math.max(0, Math.min(params.start, docLen))
    const end = Math.max(0, Math.min(params.end, docLen))
    view.dispatch({
      selection: { anchor: start, head: end },
      effects: EditorView.scrollIntoView(start, { y: 'center' }),
    })
    view.focus()
  }

  /**
   * Build a fresh set of extensions bound to the current readOnly value, then
   * either install them on a new EditorView or apply via setState. We rebuild
   * on every doc swap because setState resets compartments to the value bound
   * at extension-creation time — reusing the mount-time extensions would silently
   * revert any subsequent readOnly reconfigure.
   */
  const rebuildExtensions = () =>
    buildExtensions({
      initialReadOnly: refReadOnly.current || refDocumentId.current !== refHostsId.current,
      isMac: agent.platform === 'darwin',
      onOpenUrl: (url) => {
        actions.openUrl(url).catch((e) => console.error(e))
      },
      onDocChange,
      onGutterClick,
    })

  const refreshEditorLayout = (view: EditorView) => {
    view.requestMeasure()
    if (refMeasureFrame.current !== null) {
      window.cancelAnimationFrame(refMeasureFrame.current)
    }
    refMeasureFrame.current = window.requestAnimationFrame(() => {
      refMeasureFrame.current = null
      if (refView.current === view) {
        view.requestMeasure()
      }
    })
  }

  const buildEditorState = (doc: string) => {
    const built = rebuildExtensions()
    return {
      built,
      state: EditorState.create({
        doc,
        extensions: [
          ...built.extensions,
          EditorView.domEventHandlers({
            blur: (event, view) => {
              if (refView.current !== view || refDiscard.current) return
              const id = refDocumentId.current
              if (!id || !refDrafts.current?.read(id)) return
              const target = event.relatedTarget
              if (
                refBlurAction.current ||
                (target instanceof Element && target.closest('[data-draft-action]'))
              )
                return
              scheduleDraftApplication((isCurrent) => refSavePending.current(isCurrent))
            },
            keydown: (event) => {
              const modifier = agent.platform === 'darwin' ? event.metaKey : event.ctrlKey
              if (modifier && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 's') {
                event.preventDefault()
                refSavePending.current()
                return true
              }
              return false
            },
          }),
          labelsCompartment.current.of(
            boundaryLabels.of({
              start: refLang.current.hosts_managed_start,
              end: refLang.current.hosts_managed_end,
            }),
          ),
        ],
      }),
    }
  }

  const createEditorView = (doc: string) => {
    const mount = refMount.current
    if (!mount) return null

    refView.current?.destroy()
    mount.replaceChildren()

    const { built, state } = buildEditorState(doc)
    const view = new EditorView({ state, parent: mount })

    refBuilt.current = built
    refView.current = view
    return view
  }

  const confirmDiscard = async () => {
    const target = refDiscard.current
    if (!target || target.restoring || target.id !== refHostsId.current) return
    target.restoring = true
    setIsDiscarding(true)
    cancelDraftApplication()
    const request = ++refContentRequest.current
    try {
      // Keep the draft visible and durable until the replacement is available.
      const saved = normalizeLineEndings(await actions.getHostsContent(target.id))
      if (
        refDiscard.current !== target ||
        refView.current !== target.view ||
        refDocumentId.current !== target.id ||
        refHostsId.current !== target.id ||
        request !== refContentRequest.current ||
        target.drafts.read(target.id) !== target.draft
      )
        return
      const { built, state } = buildEditorState(saved)
      target.drafts.discard(target.id)
      refBaseContent.current = saved
      refBuilt.current = built
      const { scrollTop, scrollLeft } = target.view.scrollDOM
      // Replace state in the existing view, without an empty intermediate
      // document or DOM teardown. Reset undo so discarded text stays discarded.
      target.view.setState(state)
      target.view.scrollDOM.scrollTop = scrollTop
      target.view.scrollDOM.scrollLeft = scrollLeft
      setContent(saved)
      setLoadError(null)
      refreshEditorLayout(target.view)
    } catch (error) {
      if (refDiscard.current === target) reportSaveError(error)
    } finally {
      // An obsolete completion must not unlock a newer confirmation/read.
      if (refDiscard.current === target) cancelDiscard()
    }
  }

  /** Fetch hosts content and replace the editor state (clears undo history). */
  const loadContent = async (targetHostsId = hostsId) => {
    // An unlisten can still be pending after a selection change. Obsolete
    // handlers must not mutate the current document or invalidate its read.
    if (refHostsId.current !== targetHostsId) return
    // A delayed refresh must not discard an uncommitted draft.
    if (refDocumentId.current === targetHostsId && refDrafts.current?.read(targetHostsId)) return
    const request = ++refContentRequest.current
    setLoadError(null)
    if (refDocumentId.current !== targetHostsId) {
      // A different entry must never display the previous entry's document,
      // including when the new read fails. Keep this placeholder read-only.
      refDocumentId.current = null
      refDrafts.current = null
      setContent('')
      createEditorView('')
    }
    let nextContent: string
    let drafts: EditorDrafts | null = null
    try {
      if (!refReadOnly.current && targetHostsId !== '0') {
        drafts = await getEditorDrafts()
      }
      const draft = drafts?.read(targetHostsId)
      const savedContent =
        draft?.base_content ??
        normalizeLineEndings(
          targetHostsId === '0'
            ? await actions.getSystemHosts()
            : await actions.getHostsContent(targetHostsId),
        )
      nextContent = draft ? draft.content : savedContent
      if (request === refContentRequest.current && refHostsId.current === targetHostsId)
        refBaseContent.current = savedContent
    } catch (error) {
      if (refHostsId.current === targetHostsId && request === refContentRequest.current) {
        setLoadError(getErrorMessage(error, refLang.current.fail))
      }
      return
    }

    if (refHostsId.current !== targetHostsId || request !== refContentRequest.current) return

    refDocumentId.current = targetHostsId
    refDrafts.current = drafts
    setPendingDraft(!!drafts?.read(targetHostsId))
    setContent(nextContent)
    const view = createEditorView(nextContent)
    if (!view) return

    const pendingFind = refPendingFind.current.get(targetHostsId)
    if (pendingFind) {
      setSelection(pendingFind.params)
      clearPendingFind(targetHostsId)
    } else {
      view.contentDOM.blur()
    }
    refreshEditorLayout(view)
  }

  // Mount an empty EditorView first; hosts switches replace the view entirely to
  // avoid stale native caret artifacts in WebKit after document swaps.
  useEffect(() => {
    createEditorView('')

    return () => {
      refDiscard.current = null
      refContentRequest.current += 1
      refView.current?.destroy()
      refView.current = null
      refBuilt.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A group preview also changes when its references are edited in place.
  useEffect(() => {
    // Reset the external editor and its error/status display for the selected document.
    loadContent(hostsId).catch((e) => console.error(e))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostsId, groupMembers, groupStructure])

  // Reconfigure before paint so the previous document cannot receive input
  // under the newly selected id while its content is still loading.
  useLayoutEffect(() => {
    const view = refView.current
    const built = refBuilt.current
    if (!view || !built) return

    view.dispatch({
      effects: built.readOnlyCompartment.reconfigure(
        readOnlyExtensions(readOnly || refDocumentId.current !== hostsId),
      ),
    })
  }, [readOnly, hostsId])

  const { run: refreshGroup, cancel: cancelGroupRefresh } = useDebounceFn(
    (id: string) => {
      if (refHostsId.current === id) loadContent(id).catch(console.error)
    },
    { wait: 50 },
  )
  useEffect(
    () => () => {
      cancelGroupRefresh()
    },
    [hostsId, cancelGroupRefresh],
  )
  const queueGroupRefresh = () => {
    if (refHostsId.current !== hostsId || currentHosts?.type !== 'group') return
    // Invalidate a read as soon as its sources change, before the debounce runs.
    refContentRequest.current += 1
    refreshGroup(hostsId)
  }

  // A group has no cached entry file: reload its live referenced content when
  // any member changes. Do not reset an editable source's undo/caret on save.
  useOnBroadcast(events.hosts_content_changed, queueGroupRefresh, [hostsId, currentHosts?.type])
  useOnBroadcast(events.hosts_content_changed_batch, queueGroupRefresh, [
    hostsId,
    currentHosts?.type,
  ])

  useOnBroadcast(
    events.hosts_refreshed,
    (h: IHostsListObject) => {
      if (hostsId !== '0' && h.id !== hostsId) return
      loadContent().catch((e) => console.error(e))
    },
    [hostsId],
  )

  useOnBroadcast(
    events.hosts_refreshed_by_id,
    (id: string) => {
      if (hostsId !== '0' && hostsId !== id) return
      loadContent().catch((e) => console.error(e))
    },
    [hostsId],
  )

  useOnBroadcast(
    events.set_hosts_on_status,
    () => {
      if (hostsId === '0') {
        loadContent().catch((e) => console.error(e))
      }
    },
    [hostsId],
  )

  useOnBroadcast(
    events.system_hosts_updated,
    () => {
      if (hostsId === '0') {
        loadContent().catch((e) => console.error(e))
      }
    },
    [hostsId],
  )

  useOnBroadcast(events.toggle_comment, toggleComment, [hostsId])

  useOnBroadcast(
    events.show_source,
    (params: IFindShowSourceParam) => {
      // Cross-host jump: List broadcasts select_hosts to switch the active hosts,
      // but hostsId only updates on the next render. Stash params and let
      // loadContent apply them after setState.
      if (
        params.item_id !== refHostsId.current ||
        refDocumentId.current !== refHostsId.current ||
        !refView.current
      ) {
        // Independent targets must not overwrite one another while their
        // selection/load events cross. Each pending jump expires separately.
        clearPendingFind(params.item_id)
        refPendingFind.current.set(params.item_id, {
          params,
          timer: window.setTimeout(() => clearPendingFind(params.item_id), 3000),
        })
        return
      }

      clearPendingFind(params.item_id)
      setSelection(params)
    },
    [hostsId],
  )

  useEffect(() => {
    refView.current?.dispatch({
      effects: labelsCompartment.current.reconfigure(
        boundaryLabels.of({
          start: refLang.current.hosts_managed_start,
          end: refLang.current.hosts_managed_end,
        }),
      ),
    })
  }, [lang])

  return (
    <div className={styles.root}>
      <div className={clsx(styles.editor, readOnly && styles.read_only)}>
        {loadError && (
          <div role="alert" className={styles.load_error}>
            <span>{loadError}</span>
            <button
              type="button"
              onClick={() => {
                void loadContent()
              }}
            >
              {lang.history_retry}
            </button>
          </div>
        )}
        <div ref={refMount} className={styles.mount} />
      </div>

      <StatusBar
        lineCount={content.split('\n').length}
        bytes={content.length}
        readOnly={readOnly}
        pendingDraft={pendingDraft && !readOnly}
        isApplying={isApplying}
        isDiscarding={isDiscarding}
        onApply={() => savePending()}
        onDiscard={() => {
          try {
            cancelDraftApplication()
            const drafts = refDrafts.current
            const draft = drafts?.read(hostsId)
            const view = refView.current
            if (
              refDiscard.current ||
              isApplying ||
              !draft ||
              !drafts ||
              !view ||
              refDocumentId.current !== hostsId
            )
              return
            refDiscard.current = { id: hostsId, draft, drafts, view, restoring: false }
            setDiscardOpen(true)
          } catch (error) {
            reportSaveError(error)
          }
        }}
      />
      <ConfirmModal
        opened={discardOpen}
        title={lang.editor_draft_discard}
        message={lang.editor_draft_discard_confirm}
        confirmLabel={lang.editor_draft_discard}
        danger
        onConfirm={() => {
          void confirmDiscard()
        }}
        onClose={() => {
          setDiscardOpen(false)
          if (!refDiscard.current?.restoring) refDiscard.current = null
        }}
      />
    </div>
  )
}

export default HostsEditor
