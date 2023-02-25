/**
 * @file: ImportFromUrl.tsx
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { Button, Input, Modal, Group } from '@mantine/core'
import { hideNotification, showNotification } from '@mantine/notifications'
import { actions } from '@renderer/core/agent'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import React, { useRef, useState } from 'react'
import styles from './ImportFromUrl.module.scss'

interface Props {
  is_show: boolean
  setIsShow: (show: boolean) => void
}

const ImportFromUrl = (props: Props) => {
  const { is_show, setIsShow } = props
  const { lang } = useI18n()
  const { loadHostsData, setCurrentHosts } = useHostsData()
  const [url, setUrl] = useState('')
  const ipt_ref = React.useRef<HTMLInputElement>(null)
  const toast_ref = useRef<string>('')

  const onCancel = () => {
    setIsShow(false)
    setUrl('')
  }

  const onOk = async () => {
    setIsShow(false)
    console.log(`url: ${url}`)
    const id = Math.random().toString(36)
    toast_ref.current = id
    showNotification({
      id,
      message: 'loading...',
      autoClose: false,
    })

    let t0 = new Date().getTime()

    if (url) {
      let r = await actions.importDataFromUrl(url)
      console.log(r)

      if (r === true) {
        // import success
        showNotification({
          // status: 'success',
          color: 'green',
          message: lang.import_done,
        })
        await loadHostsData()
        setCurrentHosts(null)
      } else {
        let message = lang.import_fail
        if (typeof r === 'string') {
          message += ` [${r}]`
        }

        showNotification({
          // status: 'error',
          color: 'red',
          message,
        })
      }
    }

    let t1 = new Date().getTime()
    setTimeout(
      () => {
        if (toast_ref.current) {
          hideNotification(toast_ref.current)
        }
      },
      t1 - t0 > 1000 ? 0 : 1000,
    )
    setUrl('')
  }

  if (!is_show) return null

  return (
    <Modal opened={is_show} onClose={onCancel} title={lang.import_from_url}>
      <Input
        ref={ipt_ref}
        data-autofocus
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        autoFocus={true}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onOk()
          }
        }}
        placeholder={'http:// or https://'}
      />
      <Group position={'center'} pt={20}>
        <Button variant="outline" onClick={onCancel} mr={3}>
          {lang.btn_cancel}
        </Button>
        <Button onClick={onOk} disabled={!url || !url.match(/^https?:\/\/\w+/i)}>
          {lang.btn_ok}
        </Button>
      </Group>
    </Modal>
  )
}

export default ImportFromUrl
