/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import {
  Box,
  Button,
  HStack,
  Image,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalOverlay,
  VStack,
} from '@chakra-ui/react'
import { default as Link } from '@renderer/components/BrowserLink'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import acknowledgements from '@root/common/acknowledgements'
import logo from '@root/common/assets/logo@512w.png'
import { homepage_url, source_url } from '@root/common/constants'
import version from '@root/version.json'
import React, { useState } from 'react'
import styles from './index.less'

const About = () => {
  const [ is_open, setIsOpen ] = useState(false)
  const { lang } = useModel('useI18n')

  const onClose = () => setIsOpen(false)

  const version_str = version.slice(0, 3).join('.') + ` (${version[3]})`

  useOnBroadcast('show_about', () => setIsOpen(true))

  return (
    <Modal isOpen={is_open} onClose={onClose}>
      <ModalOverlay/>
      <ModalContent>
        <ModalBody fontSize="12px" className={styles.root}>
          <VStack spacing={1}>
            <Box pt={8} pb={3}>
              <Image
                src={logo}
                w="64px"
                h="64px"
              />
            </Box>
            <Box fontWeight="bold" fontSize="16px">{lang._app_name}</Box>
            <Box fontSize="80%" opacity={0.5}>v{version_str}</Box>
            <HStack>
              <Link href={homepage_url}>{lang.homepage}</Link>
              <Link href={source_url}>{lang.source_code}</Link>
            </HStack>

            <Box pt={8} fontWeight="bold">{lang.acknowledgement}</Box>
            <Box className={styles.names}>
              {acknowledgements.map((o, idx) => (
                <Link key={idx} href={o.link}>{o.name}</Link>
              ))}
            </Box>
          </VStack>
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
