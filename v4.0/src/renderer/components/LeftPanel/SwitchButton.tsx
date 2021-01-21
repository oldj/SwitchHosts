/**
 * SwitchButton
 * @author: oldj
 * @homepage: https://oldj.net
 */

import React, { useState } from 'react'
import clsx from 'clsx'
import styles from './SwitchButton.less'

interface Props {
  on: boolean;
  onChange?: (on: boolean) => void;
  disabled?: boolean;
}

const SwitchButton = (props: Props) => {
  const { on, onChange, disabled } = props
  const [is_on, setIsOn] = useState(on)

  const onClick = () => {
    if (disabled) return

    let new_status = !is_on
    setIsOn(new_status)
    if (typeof onChange === 'function') {
      onChange(new_status)
    }
  }

  return (
    <div
      className={clsx(styles.root, is_on && styles.on, disabled && styles.disabled)}
      onClick={onClick}
    >
      <div className={styles.handler}/>
    </div>
  )
}

export default SwitchButton
