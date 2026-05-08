import { Text, type TextProps } from '@mantine/core'
import type { PropsWithChildren } from 'react'

export const checkboxDescriptionStyles = {
  description: {
    fontSize: 'var(--mantine-font-size-md)',
    lineHeight: 'var(--mantine-line-height-md)',
  },
}

type DescriptionTextProps = PropsWithChildren<TextProps>

const DescriptionText = (props: DescriptionTextProps) => <Text {...props} c="dimmed" size="md" />

export default DescriptionText
