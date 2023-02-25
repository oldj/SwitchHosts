/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import AboutContent from '@renderer/components/About/AboutContent'
import { Modal, Button, Group } from '@mantine/core'
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
    <Modal centered opened={is_open} onClose={onClose}>
      <AboutContent />
    </Modal>
  )
}

export default About
