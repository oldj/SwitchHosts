import { useModel } from '@@/plugin-model/useModel'
import { actions } from '@renderer/agent'
import Lang from '@renderer/components/Lang'
import version from '@root/version.json'
import React, { useEffect } from 'react'
import styles from './index.less'

export default () => {
  const { i18n, setLocale } = useModel('useI18n')

  useEffect(() => {
    setLocale('zh')

    actions.ping(3000)
      .then(value => console.log(value))
  }, [])

  return (
    <div>
      <h1 className={styles.title}>Page index</h1>
      <div>{i18n.lang.test}</div>
      <Lang locale='zh'>汉字</Lang>
      <Lang locale='en'>English</Lang>
      <div>Version: {version.join('.')}</div>
    </div>
  )
}
