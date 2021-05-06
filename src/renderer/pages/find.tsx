/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { agent } from '@renderer/core/agent'
import React, { useEffect } from 'react'
import styles from './find.less'

interface Props {

}

const find = (props: Props) => {
  const { lang, setLocale } = useModel('useI18n')
  const { configs } = useModel('useConfigs')

  const init = async () => {
    if (!configs) return

    setLocale(configs.locale)

    let theme = configs.theme
    let cls = document.body.className
    document.body.className = cls.replace(/\btheme-\w+/ig, '')
    document.body.classList.add(`platform-${agent.platform}`, `theme-${theme}`)
  }

  useEffect(() => {
    if (!configs) return
    init().catch(e => console.error(e))
  }, [configs])

  useEffect(() => {
    console.log(lang.find_and_replace)
    document.title = lang.find_and_replace
  }, [lang])

  return (
    <div className={styles.root}>
      find
    </div>
  )
}

export default find
