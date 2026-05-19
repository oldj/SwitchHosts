import type { DrawerProps } from '@mantine/core'
import { Box, Drawer, ScrollArea } from '@mantine/core'
import type { CSSProperties, ReactNode } from 'react'

interface SideDrawerProps extends Omit<DrawerProps, 'children' | 'position' | 'styles'> {
  children: ReactNode
  footer?: ReactNode
  scrollable?: boolean
  scrollAreaStyle?: CSSProperties
}

const SideDrawer = ({
  children,
  footer,
  scrollable = true,
  scrollAreaStyle,
  ...props
}: SideDrawerProps) => {
  return (
    <Drawer
      position="right"
      styles={{
        content: {
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        },
        body: {
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          minHeight: 0,
          padding: 0,
        },
      }}
      {...props}
    >
      {scrollable ? (
        <ScrollArea
          scrollbars="y"
          type="hover"
          style={{
            flex: 1,
            minHeight: 0,
          }}
          styles={{
            viewport: {
              padding: '0 var(--mantine-spacing-md)',
              ...scrollAreaStyle,
            },
          }}
        >
          {children}
        </ScrollArea>
      ) : (
        <Box
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            padding: '0 var(--mantine-spacing-md)',
            ...scrollAreaStyle,
          }}
        >
          {children}
        </Box>
      )}
      {footer ? (
        <Box
          style={{
            // borderTop: '1px solid var(--swh-border-color-1)',
            padding: 'var(--mantine-spacing-md)',
          }}
        >
          {footer}
        </Box>
      ) : null}
    </Drawer>
  )
}

export default SideDrawer
