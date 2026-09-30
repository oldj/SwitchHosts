/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import clsx from 'clsx'
import styles from './SwitchButton.module.scss'

interface Props {
  on: boolean
  onChange?: (on: boolean) => void
  disabled?: boolean
  unknown?: boolean
  unknownLabel?: string
  ariaLabel?: string
}

const SwitchButton = (props: Props) => {
  const { on, onChange, disabled, ariaLabel } = props

  const onClick = (e?: React.MouseEvent<HTMLDivElement>) => {
    e?.stopPropagation()

    if (disabled) return

    if (typeof onChange === 'function') {
      onChange(!on)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return

    e.preventDefault()
    e.stopPropagation()
    onClick()
  }

  if (props.unknown)
    return (
      <span role="status" aria-label={props.unknownLabel} title={props.unknownLabel}>
        ?
      </span>
    )

  return (
    <div
      className={clsx(styles.root, on && styles.on, disabled && styles.disabled)}
      role="switch"
      aria-label={ariaLabel}
      aria-checked={on}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <div className={styles.handler} />
    </div>
  )
}

export default SwitchButton
