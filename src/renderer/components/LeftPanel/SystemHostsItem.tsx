/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import ItemIcon from '@renderer/components/ItemIcon'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import clsx from 'clsx'
import styles from './SystemHostsItem.module.scss'

const SystemHostsItem = () => {
  const { i18n } = useI18n()
  const { currentHosts, setCurrentHosts } = useHostsData()

  const isSelected = !currentHosts

  const showSystemHosts = () => {
    setCurrentHosts(null)
  }

  return (
    <div className={clsx(styles.root, isSelected && styles.selected)} onClick={showSystemHosts}>
      <span className={styles.icon}>
        <ItemIcon type="system" />
      </span>
      <span>{i18n.lang.system_hosts}</span>
    </div>
  )
}

export default SystemHostsItem
