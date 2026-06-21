/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { Button, Group, Modal, TextInput } from '@mantine/core'
import { actions } from '@renderer/core/agent'
import {
  getErrorMessage,
  showLoadingNotification,
  updateErrorNotification,
  updateSuccessNotification,
} from '@renderer/core/notify'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import React, { useState } from 'react'
import styles from './ImportFromUrl.module.scss'

interface Props {
  isShow: boolean
  setIsShow: (show: boolean) => void
}

const ImportFromUrl = (props: Props) => {
  const { isShow: opened, setIsShow } = props
  const { lang } = useI18n()
  const { loadHostsData, setCurrentHosts } = useHostsData()
  const [url, setUrl] = useState('')
  const iptRef = React.useRef<HTMLInputElement>(null)

  const onCancel = () => {
    setIsShow(false)
    setUrl('')
  }

  const onOk = async () => {
    setIsShow(false)

    if (url) {
      const notificationId = showLoadingNotification({
        title: lang.import_from_url,
        message: lang.loading,
      })

      try {
        const r = await actions.importDataFromUrl(url)

        if (r === true) {
          await loadHostsData()
          setCurrentHosts(null)
          updateSuccessNotification(notificationId, {
            title: lang.import_from_url,
            message: lang.import_done,
          })
        } else {
          let description = lang.import_fail
          if (typeof r === 'string') {
            description += ` [${r}]`
          }

          updateErrorNotification(notificationId, {
            title: lang.import_from_url,
            message: description,
          })
        }
      } catch (error) {
        updateErrorNotification(notificationId, {
          title: lang.import_from_url,
          message: getErrorMessage(error, lang.import_fail),
        })
      }
    }
    setUrl('')
  }

  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      centered
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
          <Button variant="outline" onClick={onCancel}>
            {lang.btn_cancel}
          </Button>
          <Button onClick={onOk} disabled={!url || !url.match(/^https?:\/\/\w+/i)}>
            {lang.btn_ok}
          </Button>
        </Group>
      </div>
    </Modal>
  )
}

export default ImportFromUrl
