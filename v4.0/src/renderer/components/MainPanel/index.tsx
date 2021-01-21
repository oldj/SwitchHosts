/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import React from 'react'
import styles from './index.less'

interface Props {

}

const MainPanel = (props: Props) => {
  return (
    <div className={styles.root}>
      <div className={styles.topbar}>
        <div className={styles.left}>
          <span>Left buttons</span>
        </div>
        <div className={styles.right}>
          <span>Right buttons</span>
        </div>
      </div>

      <div className={styles.main}>
        main
      </div>
    </div>
  )
}

export default MainPanel
