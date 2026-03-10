/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import logo from '@/assets/logo@512w.png'
import version from '@/version.json'
import acknowledgements from '@common/acknowledgements'
import { homepage_url, source_url } from '@common/constants'
import { Box, Center, Flex, Image, Stack } from '@mantine/core'
import { default as Link } from '@renderer/components/BrowserLink'
import useI18n from '@renderer/models/useI18n'
import styles from './AboutContent.module.scss'

const AboutContent = () => {
  const { lang } = useI18n()
  const version_str = version.slice(0, 3).join('.') + ` (${version[3]})`

  return (
    <Stack gap="4px" align="stretch">
      <Center pb="12px">
        <Image className={styles.logo} src={logo} />
      </Center>
      <Center style={{ fontWeight: 'bold', fontSize: '16px' }}>{lang._app_name}</Center>
      <Center style={{ fontSize: '80%', opacity: 0.5 }}>v{version_str}</Center>
      <Flex gap={8} justify="center" wrap="wrap">
        <Link href={homepage_url}>{lang.homepage}</Link>
        <Link href={source_url}>{lang.source_code}</Link>
      </Flex>

      <Center style={{ paddingTop: 32, fontWeight: 'bold' }}>{lang.acknowledgement}</Center>
      <Box className={styles.names}>
        {acknowledgements.map((o, idx) => (
          <Link key={idx} href={o.link}>
            {o.name}
          </Link>
        ))}
      </Box>
    </Stack>
  )
}

export default AboutContent
