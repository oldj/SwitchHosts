/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { Button, Group, Modal, TextInput } from '@mantine/core'
import { actions } from '@renderer/core/agent'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import React, { useState } from 'react'
import styles from './ImportFromUrl.module.scss'

interface Props {
  is_show: boolean
  setIsShow: (show: boolean) => void
}

const ImportFromUrl = (props: Props) => {
  const { is_show: opened, setIsShow } = props
  const { lang } = useI18n()
  const { loadHostsData, setCurrentHosts } = useHostsData()
  const [url, setUrl] = useState('')
  const ipt_ref = React.useRef<HTMLInputElement>(null)

  const onCancel = () => {
    setIsShow(false)
    setUrl('')
  }

  const onOk = async () => {
    setIsShow(false)
    console.log(`url: ${url}`)

    if (url) {
      let r = await actions.importDataFromUrl(url)
      console.log(r)

      if (r === true) {
        // import success
        console.log(lang.import_done)
        await loadHostsData()
        setCurrentHosts(null)
      } else {
        let description = lang.import_fail
        if (typeof r === 'string') {
          description += ` [${r}]`
        }

        console.error(description)
      }
    }
    setUrl('')
  }

  return (
    <Modal opened={opened} onClose={onCancel} centered padding={0} withCloseButton={false}>
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Modal.CloseButton />
        <div style={{ padding: 'var(--mantine-spacing-md)', paddingBottom: 24 }}>
          <div className={styles.label}>{lang.import_from_url}</div>
          <TextInput
            ref={ipt_ref}
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
          <Button color="blue" onClick={onOk} disabled={!url || !url.match(/^https?:\/\/\w+/i)}>
            {lang.btn_ok}
          </Button>
        </Group>
      </div>
    </Modal>
  )
}

export default ImportFromUrl
