/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { IHostsListObject } from '@common/data'
import events from '@common/events'
import { normalizeLineEndings } from '@common/newlines'
import { IFindShowSourceParam } from '@common/types'
import StatusBar from '@renderer/components/StatusBar'
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import useHostsData from '@renderer/models/useHostsData'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useDebounceFn } from 'ahooks'
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import {
  buildExtensions,
  type BuiltExtensions,
  readOnlyExtensions,
} from './hosts_cm'
import { toggleCommentByLine, toggleCommentBySelection } from './hosts_highlight'
import styles from './HostsEditor.module.scss'

const HostsEditor = () => {
  const { currentHosts, isReadOnly } = useHostsData()
  const hostsId = currentHosts?.id || '0'
  const readOnly = isReadOnly(currentHosts)
  const [content, setContent] = useState('')

  const refMount = useRef<HTMLDivElement>(null)
  const refView = useRef<EditorView | null>(null)
  const refBuilt = useRef<BuiltExtensions | null>(null)
  const refMeasureFrame = useRef<number | null>(null)
  // Refs mirror React state so that callbacks captured by EditorView extensions
  // (which are created once on mount) can always read the latest values.
  const refHostsId = useRef(hostsId)
  const refReadOnly = useRef(readOnly)
  // Pending find: when a show_source event arrives before the target hosts is loaded
  // (List broadcasts select_hosts then show_source synchronously, but hostsId only
  // updates on the next render), we stash the params here and apply them once
  // loadContent finishes (with a 3s timeout to avoid stale state).
  const refPendingFind = useRef<IFindShowSourceParam | null>(null)
  const refPendingFindTimer = useRef<number | null>(null)

  const clearPendingFind = () => {
    if (refPendingFindTimer.current) {
      window.clearTimeout(refPendingFindTimer.current)
      refPendingFindTimer.current = null
    }
    refPendingFind.current = null
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

  useEffect(() => {
    refHostsId.current = hostsId
  }, [hostsId])

  useEffect(() => {
    refReadOnly.current = readOnly
  }, [readOnly])

  const { run: toSave } = useDebounceFn(
    (id: string, nextContent: string) => {
      actions
        .setHostsContent(id, nextContent)
        .then(() => agent.broadcast(events.hosts_content_changed, id))
        .catch((e) => console.error(e))
    },
    { wait: 1000 },
  )

  const onDocChange = (nextContent: string) => {
    const normalizedContent = normalizeLineEndings(nextContent)
    setContent(normalizedContent)
    toSave(refHostsId.current, normalizedContent)
  }

  const onGutterClick = (lineIndex: number) => {
    if (refReadOnly.current) return
    const view = refView.current
    if (!view) return
    if (view.composing) return

    const code = view.state.doc.toString()
    const sel = view.state.selection.main
    const next = toggleCommentByLine(code, lineIndex, sel.from, sel.to)
    if (!next.changed) return

    view.dispatch({
      changes: next.changes,
      selection: { anchor: next.selectionStart, head: next.selectionEnd },
    })
    view.focus()
  }

  const toggleComment = () => {
    if (refReadOnly.current) return
    const view = refView.current
    if (!view) return
    // Skip while an IME composition is active to avoid dropping characters.
    if (view.composing) return

    const code = view.state.doc.toString()
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
      initialReadOnly: refReadOnly.current,
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

  const createEditorView = (doc: string) => {
    const mount = refMount.current
    if (!mount) return null

    refView.current?.destroy()
    mount.replaceChildren()

    const built = rebuildExtensions()
    const view = new EditorView({
      state: EditorState.create({ doc, extensions: built.extensions }),
      parent: mount,
    })

    refBuilt.current = built
    refView.current = view
    return view
  }

  /** Fetch hosts content and replace the editor state (clears undo history). */
  const loadContent = async (targetHostsId = hostsId) => {
    const nextContent = normalizeLineEndings(
      targetHostsId === '0'
        ? await actions.getSystemHosts()
        : await actions.getHostsContent(targetHostsId),
    )

    if (refHostsId.current !== targetHostsId) return

    setContent(nextContent)
    const view = createEditorView(nextContent)
    if (!view) return

    const pendingFind = refPendingFind.current
    if (pendingFind && pendingFind.item_id === targetHostsId) {
      setSelection(pendingFind)
      clearPendingFind()
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
      refView.current?.destroy()
      refView.current = null
      refBuilt.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load content when the active hosts changes.
  useEffect(() => {
    loadContent(hostsId).catch((e) => console.error(e))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostsId])

  // Reconfigure read-only state via the compartment without rebuilding the editor.
  useEffect(() => {
    const view = refView.current
    const built = refBuilt.current
    if (!view || !built) return

    view.dispatch({
      effects: built.readOnlyCompartment.reconfigure(readOnlyExtensions(readOnly)),
    })
  }, [readOnly])

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
      if (params.item_id !== hostsId || !refView.current) {
        clearPendingFind()
        refPendingFind.current = params
        refPendingFindTimer.current = window.setTimeout(clearPendingFind, 3000)
        return
      }

      clearPendingFind()
      setSelection(params)
    },
    [hostsId],
  )

  return (
    <div className={styles.root}>
      <div className={clsx(styles.editor, readOnly && styles.read_only)}>
        <div ref={refMount} className={styles.mount} />
      </div>

      <StatusBar
        lineCount={content.split('\n').length}
        bytes={content.length}
        readOnly={readOnly}
      />
    </div>
  )
}

export default HostsEditor
