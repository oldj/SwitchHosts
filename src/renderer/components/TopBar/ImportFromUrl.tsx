/**
 * SudoPasswordInput
 * @author: oldj
 * @homepage: https://oldj.net
 */

import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalOverlay,
  ToastId,
  useToast,
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
  const toast = useToast()
  const toast_ref = useRef<ToastId>()

  const onCancel = () => {
    setIsShow(false)
    setUrl('')
  }

  const onOk = async () => {
    setIsShow(false)
    console.log(`url: ${url}`)
    toast_ref.current = toast({
      description: 'loading...',
      duration: null,
      isClosable: true,
    })

    let t0 = new Date().getTime()

    if (url) {
      let r = await actions.importDataFromUrl(url)
      console.log(r)

      if (r === true) {
        // import success
        toast({
          status: 'success',
          description: lang.import_done,
          isClosable: true,
        })
        await loadHostsData()
        setCurrentHosts(null)
      } else {
        let description = lang.import_fail
        if (typeof r === 'string') {
          description += ` [${r}]`
        }

        toast({
          status: 'error',
          description,
          isClosable: true,
        })
      }
    }

    let t1 = new Date().getTime()
    setTimeout(
      () => {
        if (toast_ref.current) {
          toast.close(toast_ref.current)
        }
      },
      t1 - t0 > 1000 ? 0 : 1000,
    )
    setUrl('')
  }

  if (!is_show) return null

  return (
    <Modal initialFocusRef={ipt_ref} isOpen={is_show} onClose={onCancel}>
      <ModalOverlay />
      <ModalContent>
        <ModalCloseButton />
        <ModalBody pb={6}>
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
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={onCancel} mr={3}>
            {lang.btn_cancel}
          </Button>
          <Button
            colorScheme="blue"
            onClick={onOk}
            isDisabled={!url || !url.match(/^https?:\/\/\w+/i)}
          >
            {lang.btn_ok}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export default ImportFromUrl
