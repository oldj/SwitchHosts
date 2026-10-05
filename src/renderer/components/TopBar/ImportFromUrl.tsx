/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { Button, Group, Modal, TextInput } from '@mantine/core'
import { actions } from '@renderer/core/agent'
import {
  showLoadingNotification,
  updateErrorNotification,
  hideAppNotification,
} from '@renderer/core/notify'
import type { ImportPreview } from '@common/import'
import { importErrorMessage } from './ImportPreview'
import useI18n from '@renderer/models/useI18n'
import React, { useState } from 'react'
import styles from './ImportFromUrl.module.scss'

interface Props {
  isShow: boolean
  setIsShow: (show: boolean) => void
  onPreview: (preview: ImportPreview) => void
}

function parseImportUrl(input: string): string | null {
  try {
    const url = new URL(input.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

const ImportFromUrl = (props: Props) => {
  const { isShow: opened, setIsShow, onPreview } = props
  const { lang } = useI18n()
  const [loading, setLoading] = useState(false)
  const pending = React.useRef(false)
  const [url, setUrl] = useState('')
  const importUrl = parseImportUrl(url)
  const iptRef = React.useRef<HTMLInputElement>(null)

  const onCancel = () => {
    if (pending.current) return
    setIsShow(false)
    setUrl('')
  }

  const onOk = async () => {
    if (pending.current || !importUrl) return
    pending.current = true
    setLoading(true)
    const notificationId = showLoadingNotification({
      title: lang.import_from_url,
      message: lang.loading,
    })
    try {
      const data = await actions.importDataFromUrl(importUrl)
      if (!data || typeof data !== 'object' || !Array.isArray(data.list)) throw data
      hideAppNotification(notificationId)
      setIsShow(false)
      setUrl('')
      onPreview(data)
    } catch (error) {
      updateErrorNotification(notificationId, {
        title: lang.import_from_url,
        message: importErrorMessage(error, lang),
      })
    } finally {
      pending.current = false
      setLoading(false)
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      centered
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
      withCloseButton={!loading}
      padding={0}
      title={lang.import}
      styles={{ header: { padding: 'var(--mantine-spacing-md)' } }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: 'var(--mantine-spacing-md)', paddingTop: 0, paddingBottom: 24 }}>
          <div className={styles.label}>{lang.import_from_url}</div>
          <TextInput
            ref={iptRef}
            value={url}
            disabled={loading}
            onChange={(e) => setUrl(e.target.value)}
            autoFocus={true}
            data-autofocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') onOk()
            }}
            placeholder={'http:// or https://'}
          />
        </div>
        <Group
          justify="flex-end"
          gap="12px"
          style={{
            borderTop: '1px solid var(--swh-border-color-1)',
            padding: 'var(--mantine-spacing-md)',
          }}
        >
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            {lang.btn_cancel}
          </Button>
          <Button onClick={onOk} loading={loading} disabled={!importUrl}>
            {lang.btn_ok}
          </Button>
        </Group>
      </div>
    </Modal>
  )
}

export default ImportFromUrl
