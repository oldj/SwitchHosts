/**
 * SwitchButton
 * @author: oldj
 * @homepage: https://oldj.net
 */

import clsx from 'clsx'
import React, { useEffect, useState } from 'react'
import styles from './SwitchButton.module.scss'

interface Props {
  on: boolean
  onChange?: (on: boolean) => void
  disabled?: boolean
}

const SwitchButton = (props: Props) => {
  const { on, onChange, disabled } = props
  const [is_on, setIsOn] = useState(on)
  const [is_disabled, setIsDisabled] = useState(disabled)

  const onClick = () => {
    if (disabled) return

    let new_status = !is_on
    setIsOn(new_status)
    if (typeof onChange === 'function') {
      onChange(new_status)
    }
  }

  useEffect(() => {
    setIsOn(on)
    setIsDisabled(disabled)
  }, [on, disabled])

  return (
    <div
      className={clsx(styles.root, is_on && styles.on, is_disabled && styles.disabled)}
      onClick={onClick}
    >
      <div className={styles.handler} />
    </div>
  )
}

export default SwitchButton
