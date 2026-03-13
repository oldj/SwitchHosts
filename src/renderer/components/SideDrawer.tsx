import type { DrawerProps } from '@mantine/core'
import { Box, Drawer } from '@mantine/core'
import type { CSSProperties, ReactNode } from 'react'

interface SideDrawerProps extends Omit<DrawerProps, 'children' | 'position' | 'styles'> {
  children: ReactNode
  footer?: ReactNode
  scrollAreaStyle?: CSSProperties
}

const SideDrawer = ({ children, footer, scrollAreaStyle, ...props }: SideDrawerProps) => {
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
      <Box
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: '0 var(--mantine-spacing-md)',
          ...scrollAreaStyle,
        }}
      >
        {children}
      </Box>
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
