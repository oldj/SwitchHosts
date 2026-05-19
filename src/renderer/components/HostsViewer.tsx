/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import StatusBar from '@renderer/components/StatusBar'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import clsx from 'clsx'
import { useEffect, useRef } from 'react'
import { buildExtensions } from './Editor/hosts_cm'
import styles from './HostsViewer.module.scss'

interface Props {
  content: string
}

const HostsViewer = (props: Props) => {
  const { content } = props
  const refMount = useRef<HTMLDivElement>(null)
  const refView = useRef<EditorView | null>(null)

  useEffect(() => {
    const mount = refMount.current
    if (!mount) return

    const built = buildExtensions({
      initialReadOnly: true,
      onDocChange: () => {},
      onGutterClick: () => {},
    })
    const view = new EditorView({
      state: EditorState.create({ doc: content, extensions: built.extensions }),
      parent: mount,
    })
    refView.current = view

    return () => {
      view.destroy()
      refView.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = refView.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === content) return
    view.dispatch({ changes: { from: 0, to: current.length, insert: content } })
  }, [content])

  return (
    <div className={styles.root}>
      <div className={clsx(styles.editor, styles.read_only)}>
        <div ref={refMount} className={styles.mount} />
      </div>
      <StatusBar
        lineCount={content.split('\n').length}
        bytes={content.length}
        readOnly={true}
      />
    </div>
  )
}

export default HostsViewer
