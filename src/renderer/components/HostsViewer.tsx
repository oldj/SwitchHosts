/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import StatusBar from '@renderer/components/StatusBar'
import useI18n from '@renderer/models/useI18n'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import clsx from 'clsx'
import { useEffect, useRef } from 'react'
import { boundaryLabels, buildExtensions } from './Editor/hosts_cm'
import styles from './HostsViewer.module.scss'

interface Props {
  content: string
  showStatusBar?: boolean
}

const HostsViewer = (props: Props) => {
  const { content, showStatusBar = true } = props
  const { lang } = useI18n()
  const labelsCompartment = useRef(new Compartment())

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
      state: EditorState.create({
        doc: content,
        extensions: [
          ...built.extensions,
          labelsCompartment.current.of(
            boundaryLabels.of({
              start: lang.hosts_managed_start,
              end: lang.hosts_managed_end,
            }),
          ),
        ],
      }),
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

  useEffect(() => {
    refView.current?.dispatch({
      effects: labelsCompartment.current.reconfigure(
        boundaryLabels.of({
          start: lang.hosts_managed_start,
          end: lang.hosts_managed_end,
        }),
      ),
    })
  }, [lang])

  return (
    <div className={styles.root}>
      <div className={clsx(styles.editor, styles.read_only, !showStatusBar && styles.fullHeight)}>
        <div ref={refMount} className={styles.mount} />
      </div>
      {showStatusBar && (
        <StatusBar lineCount={content.split('\n').length} bytes={content.length} readOnly={true} />
      )}
    </div>
  )
}

export default HostsViewer
