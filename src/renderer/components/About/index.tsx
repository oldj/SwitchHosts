/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalOverlay } from '@chakra-ui/react'
import AboutContent from '@renderer/components/About/AboutContent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import events from '@common/events'
import React, { useState } from 'react'
import styles from './index.module.scss'
import useI18n from '@renderer/models/useI18n'

const About = () => {
  const [is_open, setIsOpen] = useState(false)
  const { lang } = useI18n()

  const onClose = () => setIsOpen(false)

  useOnBroadcast(events.show_about, () => setIsOpen(true))

  return (
    <Modal isOpen={is_open} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalBody className={styles.root}>
          <AboutContent />
        </ModalBody>

        <ModalFooter className={styles.footer}>
          <Button variant="outline" onClick={onClose}>
            {lang.close}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export default About
