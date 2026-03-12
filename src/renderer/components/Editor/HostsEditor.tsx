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
import { useDebounceFn } from 'ahooks'
import clsx from 'clsx'
import { CodeJar, type Position } from 'codejar'
import { withLineNumbers } from 'codejar-linenumbers'
import 'codejar-linenumbers/es/codejar-linenumbers.css'
import { useEffect, useRef, useState } from 'react'
import { highlightHosts, toggleCommentByLine, toggleCommentBySelection } from './hosts_highlight'
import styles from './HostsEditor.module.scss'

const HostsEditor = () => {
  const { current_hosts, isReadOnly } = useHostsData()
  const hosts_id = current_hosts?.id || '0'
  const is_read_only = isReadOnly(current_hosts)
  const [content, setContent] = useState('')

  const ref_mount = useRef<HTMLDivElement>(null) // outer container that hosts the CodeJar wrapper
  const ref_editor = useRef<HTMLDivElement | null>(null) // contenteditable div managed by CodeJar
  const ref_jar = useRef<ReturnType<typeof CodeJar> | null>(null)
  // Refs mirror React state so that callbacks inside the CodeJar effect
  // (which only re-runs on hosts_id change) can always read the latest values.
  const ref_hosts_id = useRef(hosts_id)
  const ref_is_read_only = useRef(is_read_only)
  // Pending find: when a show_source event arrives before the target hosts is loaded,
  // we stash the params here and apply them once loadContent finishes (with a 3s timeout).
  const ref_pending_find = useRef<IFindShowSourceParam | null>(null)
  const ref_pending_find_timer = useRef<number | null>(null)

  useEffect(() => {
    ref_hosts_id.current = hosts_id
  }, [hosts_id])

  useEffect(() => {
    ref_is_read_only.current = is_read_only
  }, [is_read_only])

  const clearPendingFind = () => {
    if (ref_pending_find_timer.current) {
      window.clearTimeout(ref_pending_find_timer.current)
      ref_pending_find_timer.current = null
    }
    ref_pending_find.current = null
  }

  useEffect(() => clearPendingFind, [])

  const { run: toSave } = useDebounceFn(
    (id: string, nextContent: string) => {
      actions
        .setHostsContent(id, nextContent)
        .then(() => agent.broadcast(events.hosts_content_changed, id))
        .catch((e) => console.error(e))
    },
    { wait: 1000 },
  )

  /** Toggle contenteditable between 'plaintext-only' and 'false' (Chromium/Electron only). */
  const setEditorReadOnly = (readOnly: boolean) => {
    const editor = ref_editor.current
    if (!editor) return

    editor.setAttribute('contenteditable', readOnly ? 'false' : 'plaintext-only')
    editor.setAttribute('aria-readonly', readOnly ? 'true' : 'false')
  }

  /** Scroll the current selection/cursor into view after programmatic focus changes. */
  const scrollSelectionIntoView = () => {
    const editor = ref_editor.current
    if (!editor) return

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    const startNode = range.startContainer
    const target =
      startNode.nodeType === Node.TEXT_NODE
        ? startNode.parentElement
        : (startNode as Element | null)

    ;(target ?? editor).scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    })
  }

  /** Restore a character-offset selection in the editor (used by find/show-source). */
  const setSelection = (params: IFindShowSourceParam) => {
    const jar = ref_jar.current
    const editor = ref_editor.current
    if (!jar || !editor) return

    const editorContent = jar.toString()
    const start = Math.max(0, Math.min(params.start, editorContent.length))
    const end = Math.max(0, Math.min(params.end, editorContent.length))
    jar.restore({
      start,
      end,
      dir: '->',
    })
    editor.focus()
    window.requestAnimationFrame(scrollSelectionIntoView)
  }

  /** Fetch and display the hosts content. Applies any pending find selection after loading. */
  const loadContent = async (targetHostsId = hosts_id) => {
    const jar = ref_jar.current
    if (!jar) return

    const nextContent = normalizeLineEndings(
      targetHostsId === '0'
        ? await actions.getSystemHosts()
        : await actions.getHostsContent(targetHostsId),
    )

    if (ref_hosts_id.current !== targetHostsId) return

    setContent(nextContent)
    jar.updateCode(nextContent, false)

    const pendingFind = ref_pending_find.current
    if (pendingFind && pendingFind.item_id === targetHostsId) {
      setSelection(pendingFind)
      clearPendingFind()
    }
  }

  const getCurrentSelection = (): Position => {
    const jar = ref_jar.current
    const editor = ref_editor.current
    const fallbackOffset = jar?.toString().length ?? 0
    if (!jar || !editor) {
      return {
        start: fallbackOffset,
        end: fallbackOffset,
        dir: '->',
      }
    }

    try {
      return jar.save()
    } catch {
      return {
        start: fallbackOffset,
        end: fallbackOffset,
        dir: '->',
      }
    }
  }

  const onChange = (nextContent: string) => {
    const normalizedContent = normalizeLineEndings(nextContent)
    setContent(normalizedContent)
    toSave(hosts_id, normalizedContent)
  }

  /** Push a programmatic edit into CodeJar: update content, restore selection, and record undo history. */
  const applyEditorChange = (nextContent: string, nextSelection: Position) => {
    const jar = ref_jar.current
    const editor = ref_editor.current
    if (!jar || !editor) return

    editor.focus()
    jar.recordHistory()
    jar.updateCode(nextContent, false)
    jar.restore(nextSelection)
    editor.focus()
    jar.recordHistory()
    onChange(nextContent)
  }

  const toggleComment = () => {
    if (ref_is_read_only.current) return

    const jar = ref_jar.current
    if (!jar) return

    const selection = getCurrentSelection()
    const next = toggleCommentBySelection(jar.toString(), selection.start, selection.end, true)
    if (!next.changed) return

    applyEditorChange(next.content, {
      start: next.selectionStart,
      end: next.selectionEnd,
      dir: '->',
    })
  }

  /** Handle a click on the line-number gutter to toggle comment on that line. */
  const onGutterClick = (lineIndex: number) => {
    if (ref_is_read_only.current) return

    const jar = ref_jar.current
    if (!jar) return

    const selection = getCurrentSelection()
    const next = toggleCommentByLine(jar.toString(), lineIndex, selection.start, selection.end)
    if (!next.changed) return

    applyEditorChange(next.content, {
      start: next.selectionStart,
      end: next.selectionEnd,
      dir: '->',
    })
  }

  useEffect(() => {
    const mount = ref_mount.current
    if (!mount) return

    mount.replaceChildren()

    const editor = document.createElement('div')
    editor.className = styles.surface
    editor.tabIndex = 0
    mount.appendChild(editor)

    const jar = CodeJar(
      editor,
      withLineNumbers(highlightHosts, {
        width: '25px',
        backgroundColor: 'var(--swh-editor-gutter-bg)',
        color: 'var(--swh-editor-line-number-color)',
      }),
    )
    ref_editor.current = editor
    ref_jar.current = jar
    setEditorReadOnly(is_read_only)

    const onEditorUpdate = (nextContent: string) => {
      onChange(nextContent)
    }

    // Detect clicks on the line-number gutter and convert the click Y position
    // into a zero-based line index, accounting for scroll offset of the wrapper.
    const onMountClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const gutter = target?.closest('.codejar-linenumbers')
      if (!gutter) return

      const lineHeight = parseFloat(window.getComputedStyle(editor).lineHeight) || 24
      const scrollContainer = gutter.closest('.codejar-wrap') ?? editor
      const relativeY =
        event.clientY - gutter.getBoundingClientRect().top + scrollContainer.scrollTop
      const lineCount = Math.max(1, jar.toString().split('\n').length)
      const lineIndex = Math.max(0, Math.min(lineCount - 1, Math.floor(relativeY / lineHeight)))

      event.preventDefault()
      onGutterClick(lineIndex)
    }

    jar.onUpdate(onEditorUpdate)
    jar.updateCode('', false)
    mount.addEventListener('click', onMountClick)
    loadContent(hosts_id).catch((e) => console.error(e))

    return () => {
      mount.removeEventListener('click', onMountClick)
      jar.destroy()
      mount.replaceChildren()
      ref_jar.current = null
      ref_editor.current = null
    }
  }, [hosts_id])

  useEffect(() => {
    setEditorReadOnly(is_read_only)
  }, [is_read_only])

  useOnBroadcast(
    events.hosts_refreshed,
    (h: IHostsListObject) => {
      if (hosts_id !== '0' && h.id !== hosts_id) return
      loadContent().catch((e) => console.error(e))
    },
    [hosts_id],
  )

  useOnBroadcast(
    events.hosts_refreshed_by_id,
    (id: string) => {
      if (hosts_id !== '0' && hosts_id !== id) return
      loadContent().catch((e) => console.error(e))
    },
    [hosts_id],
  )

  useOnBroadcast(
    events.set_hosts_on_status,
    () => {
      if (hosts_id === '0') {
        loadContent().catch((e) => console.error(e))
      }
    },
    [hosts_id],
  )

  useOnBroadcast(
    events.system_hosts_updated,
    () => {
      if (hosts_id === '0') {
        loadContent().catch((e) => console.error(e))
      }
    },
    [hosts_id],
  )

  useOnBroadcast(events.toggle_comment, toggleComment, [hosts_id])

  useOnBroadcast(
    events.show_source,
    (params: IFindShowSourceParam) => {
      if (params.item_id !== hosts_id || !ref_jar.current) {
        clearPendingFind()
        ref_pending_find.current = params
        ref_pending_find_timer.current = window.setTimeout(clearPendingFind, 3000)
        return
      }

      clearPendingFind()
      setSelection(params)
    },
    [hosts_id],
  )

  return (
    <div className={styles.root}>
      <div className={clsx(styles.editor, is_read_only && styles.read_only)}>
        <div ref={ref_mount} className={styles.mount} />
      </div>

      <StatusBar
        line_count={content.split('\n').length}
        bytes={content.length}
        read_only={is_read_only}
      />
    </div>
  )
}

export default HostsEditor
