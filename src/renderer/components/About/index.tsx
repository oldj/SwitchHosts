/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import events from '@common/events'
import { Modal } from '@mantine/core'
import AboutContent from '@renderer/components/About/AboutContent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { useState } from 'react'

const About = () => {
  const [opened, setOpened] = useState(false)

  const onClose = () => setOpened(false)

  useOnBroadcast(events.show_about, () => setOpened(true))

  return (
    <Modal opened={opened} onClose={onClose} centered>
      <AboutContent />
    </Modal>
  )
}

export default About
