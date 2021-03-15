/**
 * SystemHostsItem
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import ItemIcon from '@renderer/components/ItemIcon'
import clsx from 'clsx'
import React from 'react'
import styles from './SystemHostsItem.less'

interface Props {

}

const SystemHostsItem = (props: Props) => {
  const { i18n } = useModel('useI18n')
  const { current_hosts, setCurrentHosts } = useModel('useCurrentHosts')

  const is_selected = !current_hosts

  const showSystemHosts = () => {
    setCurrentHosts(null)
  }

  return (
    <div
      className={clsx(styles.root, is_selected && styles.selected)}
      onClick={showSystemHosts}
    >
      <span className={styles.icon}><ItemIcon type="system"/></span>
      <span>{i18n.lang.system_hosts}</span>
    </div>
  )
}

export default SystemHostsItem
