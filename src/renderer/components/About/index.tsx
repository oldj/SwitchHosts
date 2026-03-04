/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { Button, Dialog, Portal } from '@chakra-ui/react'
import AboutContent from '@renderer/components/About/AboutContent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import events from '@common/events'
import React, { useState } from 'react'
import styles from './index.module.scss'
import useI18n from '@renderer/models/useI18n'

const About = () => {
  const [is_open, setIsOpen] = useState(false)
  const { lang } = useI18n()
  const DialogPositioner = Dialog.Positioner as unknown as React.FC<React.PropsWithChildren>
  const DialogContent = Dialog.Content as unknown as React.FC<React.PropsWithChildren>

  const onClose = () => setIsOpen(false)

  useOnBroadcast(events.show_about, () => setIsOpen(true))

  return (
    <Dialog.Root open={is_open} onOpenChange={(e: { open: boolean }) => setIsOpen(e.open)}>
      <Portal>
        <Dialog.Backdrop />
        <DialogPositioner>
          <DialogContent>
            <Dialog.Body className={styles.root}>
          <AboutContent />
            </Dialog.Body>

            <Dialog.Footer className={styles.footer}>
              <Button variant="outline" onClick={onClose}>
                {lang.close}
              </Button>
            </Dialog.Footer>
          </DialogContent>
        </DialogPositioner>
      </Portal>
    </Dialog.Root>
  )
}

export default About
