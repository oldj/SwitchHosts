/**
 * PageWrapper.tsx
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ColorScheme, ColorSchemeProvider, MantineProvider } from '@mantine/core'
import { NotificationsProvider } from '@mantine/notifications'
import Loading from '@renderer/components/Loading'
import React, { Suspense, useState } from 'react'

interface IProps {
  children?: React.ReactNode
}

function PageWrapper(props: IProps) {
  const { children } = props
  const [color_scheme, setColorScheme] = useState<ColorScheme>('light')
  const toggleColorScheme = (value?: ColorScheme) =>
    setColorScheme(value || (color_scheme === 'dark' ? 'light' : 'dark'))

  return (
    <ColorSchemeProvider colorScheme={color_scheme} toggleColorScheme={toggleColorScheme}>
      <MantineProvider
        theme={{
          colorScheme: color_scheme,
          fontSizes: {
            xs: 10,
            sm: 12,
            md: 14,
            lg: 16,
            xl: 18,
          },
          radius: {
            xs: 1,
            sm: 2,
            md: 3,
            lg: 6,
            xl: 8,
          },
        }}
        withGlobalStyles
        withNormalizeCSS
      >
        <NotificationsProvider>
          <Suspense fallback={<Loading />}>{children}</Suspense>
        </NotificationsProvider>
      </MantineProvider>
    </ColorSchemeProvider>
  )
}

export default PageWrapper
