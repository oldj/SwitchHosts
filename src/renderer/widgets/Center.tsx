/**
 * Center.tsx
 * @author: oldj
 * @homepage: https://oldj.net
 */

import React, { useEffect, useState } from 'react'
import styles from './Center.module.scss'

interface IProps {
  w?: string | number
  h?: string | number
  children?: React.ReactNode
}

function Center(props: IProps) {
  const { w, h, children } = props
  const css: React.CSSProperties = {}
  if (typeof w === 'number' || typeof w === 'string') {
    css.width = w
  }
  if (typeof h === 'number' || typeof h === 'string') {
    css.height = h
  }

  return (
    <div className={styles.root} style={css}>
      {children}
    </div>
  )
}

export default Center
