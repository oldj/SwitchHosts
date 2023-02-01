/**
 * IconButton.tsx
 * @author: oldj
 * @homepage: https://oldj.net
 */

import clsx from 'clsx'
import React, { useEffect, useState } from 'react'
import styles from './IconButton.module.scss'

interface IProps {
  className?: string
  icon?: React.ReactNode
  onClick?: () => void
  children?: React.ReactNode
}

function IconButton(props: IProps) {
  const { className, icon, onClick, children } = props
  return (
    <button
      className={clsx(styles.root, className)}
      onClick={() => {
        if (onClick) {
          onClick()
        }
      }}
      data-role={'icon-button'}
    >
      {icon}
      {children}
    </button>
  )
}

export default IconButton
