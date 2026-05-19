/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import logo from '@/assets/logo@512w.png'
import version from '@/version.json'
import acknowledgements from '@common/acknowledgements'
import { homepageUrl, sourceUrl } from '@common/constants'
import { Center, Flex, Image, ScrollArea, Stack } from '@mantine/core'
import { default as Link } from '@renderer/components/BrowserLink'
import useI18n from '@renderer/models/useI18n'
import styles from './AboutContent.module.scss'

const AboutContent = () => {
  const { lang } = useI18n()
  const versionStr = version

  return (
    <Stack gap="4px" align="stretch">
      <Center pb="12px">
        <Image className={styles.logo} src={logo} />
      </Center>
      <Center style={{ fontWeight: 'bold', fontSize: '16px' }}>{lang._app_name}</Center>
      <Center style={{ fontSize: '80%', opacity: 0.5 }}>v{versionStr}</Center>
      <Flex gap={8} justify="center" wrap="wrap">
        <Link href={homepageUrl}>{lang.homepage}</Link>
        <Link href={sourceUrl}>{lang.source_code}</Link>
      </Flex>

      <Center style={{ paddingTop: 32, fontWeight: 'bold' }}>{lang.acknowledgement}</Center>
      <ScrollArea className={styles.names} scrollbars="y" type="hover">
        <Flex wrap="wrap" gap="4px 16px">
          {acknowledgements.map((o, idx) => (
            <Link key={idx} href={o.link}>
              {o.name}
            </Link>
          ))}
        </Flex>
      </ScrollArea>
    </Stack>
  )
}

export default AboutContent
