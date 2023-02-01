/**
 * AboutContent
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { Box, HStack, Image, VStack } from '@chakra-ui/react'
import { default as Link } from '@renderer/components/BrowserLink'
import logo from '@/assets/logo@512w.png'
import acknowledgements from '@common/acknowledgements'
import { homepage_url, source_url } from '@common/constants'
import useI18n from '@renderer/models/useI18n'
import version from '@/version.json'
import React from 'react'
import styles from './AboutContent.module.scss'

const AboutContent = () => {
  const { lang } = useI18n()
  const version_str = version.slice(0, 3).join('.') + ` (${version[3]})`

  return (
    <div className={styles.root}>
      <VStack spacing={1}>
        <Box pt={8} pb={3}>
          <Image className={styles.logo} src={logo} />
        </Box>
        <Box fontWeight="bold" fontSize="16px">
          {lang._app_name}
        </Box>
        <Box fontSize="80%" opacity={0.5}>
          v{version_str}
        </Box>
        <HStack>
          <Link href={homepage_url}>{lang.homepage}</Link>
          <Link href={source_url}>{lang.source_code}</Link>
        </HStack>

        <Box pt={8} fontWeight="bold">
          {lang.acknowledgement}
        </Box>
        <Box className={styles.names}>
          {acknowledgements.map((o, idx) => (
            <Link key={idx} href={o.link}>
              {o.name}
            </Link>
          ))}
        </Box>
      </VStack>
    </div>
  )
}

export default AboutContent
