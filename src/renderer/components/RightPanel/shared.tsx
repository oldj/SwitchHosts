import { Text } from '@mantine/core'
import clsx from 'clsx'
import React from 'react'
import styles from './index.module.scss'

export const countRules = (content: string): number =>
  content.split(/\r?\n/).filter((l) => {
    const t = l.trim()
    return t.length > 0 && !t.startsWith('#')
  }).length

export const InfoRow: React.FC<{
  label: string
  value: React.ReactNode
  mono?: boolean
}> = ({ label, value, mono }) => (
  <div className={styles.row}>
    <Text className={styles.row_label}>{label}</Text>
    <Text className={clsx(styles.row_value, mono && styles.mono)}>
      {value}
    </Text>
  </div>
)
