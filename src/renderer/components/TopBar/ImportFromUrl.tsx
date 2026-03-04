/**
 * SudoPasswordInput
 * @author: oldj
 * @homepage: https://oldj.net
 */

import {
  Button,
  Dialog,
  Input,
  Portal,
} from '@chakra-ui/react'
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
  const toast_ref = useRef<string | undefined>(undefined)
  const DialogPositioner = Dialog.Positioner as unknown as React.FC<React.PropsWithChildren>
  const DialogContent = Dialog.Content as unknown as React.FC<React.PropsWithChildren>

  const onCancel = () => {
    setIsShow(false)
    setUrl('')
  }

  const onOk = async () => {
    setIsShow(false)
    console.log(`url: ${url}`)
    toast_ref.current = `${Date.now()}`

    let t0 = new Date().getTime()

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

    let t1 = new Date().getTime()
    setTimeout(
      () => {
        if (toast_ref.current) {
          toast_ref.current = undefined
        }
      },
      t1 - t0 > 1000 ? 0 : 1000,
    )
    setUrl('')
  }

  if (!is_show) return null

  return (
    <Dialog.Root open={is_show} onOpenChange={(e: { open: boolean }) => setIsShow(e.open)}>
      <Portal>
        <Dialog.Backdrop />
        <DialogPositioner>
          <DialogContent>
            <Dialog.CloseTrigger />
            <Dialog.Body pb={6}>
          <div className={styles.label}>{lang.import_from_url}</div>
          <Input
            ref={ipt_ref}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoFocus={true}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onOk()
            }}
            placeholder={'http:// or https://'}
          />
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="outline" onClick={onCancel} mr={3}>
                {lang.btn_cancel}
              </Button>
              <Button
                colorPalette="blue"
                onClick={onOk}
                disabled={!url || !url.match(/^https?:\/\/\w+/i)}
              >
                {lang.btn_ok}
              </Button>
            </Dialog.Footer>
          </DialogContent>
        </DialogPositioner>
      </Portal>
    </Dialog.Root>
  )
}

export default ImportFromUrl
