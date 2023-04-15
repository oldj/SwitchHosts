/**
 * SystemHostsItem
 * @author: oldj
 * @homepage: https://oldj.net
 */

import ItemIcon from '@renderer/components/ItemIcon'
import clsx from 'clsx'
import React from 'react'
import styles from './SystemHostsItem.module.scss'
import useI18n from '@renderer/models/useI18n'
import useHostsData from '@renderer/models/useHostsData'

const SystemHostsItem = () => {
  const { i18n } = useI18n()
  const { current_hosts, setCurrentHosts } = useHostsData()

  const is_selected = !current_hosts

  const showSystemHosts = () => {
    setCurrentHosts(null)
  }

  return (
    <div className={clsx(styles.root, is_selected && styles.selected)} onClick={showSystemHosts}>
      <span className={styles.icon}>
        <ItemIcon type="system" />
      </span>
      <span>{i18n.lang.system_hosts}</span>
    </div>
  )
}

export default SystemHostsItem
