/**
 * AboutContent
 * @author: oldj
 * @homepage: https://oldj.net
 */

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
      <div className={styles.top}>
        <img className={styles.logo} src={logo} alt="" />
      </div>
      <div className={styles.app_name}>{lang._app_name}</div>
      <div className={styles.version}>v{version_str}</div>
      <div className={styles.links}>
        <Link href={homepage_url}>{lang.homepage}</Link>
        <Link href={source_url}>{lang.source_code}</Link>
      </div>

      <h2>{lang.acknowledgement}</h2>
      <div className={styles.names}>
        {acknowledgements.map((o, idx) => (
          <Link key={idx} href={o.link}>
            {o.name}
          </Link>
        ))}
      </div>
    </div>
  )
}

export default AboutContent
