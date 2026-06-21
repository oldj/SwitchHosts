/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import {
  createTheme,
  Drawer,
  MantineColorsTuple,
  MantineProvider,
  Modal,
  SegmentedControl,
  Select,
  Tooltip,
} from '@mantine/core'
import '@mantine/core/styles.css'
import { Notifications } from '@mantine/notifications'
import '@mantine/notifications/styles.css'
import PageWrapper from '@renderer/common/PageWrapper'
import useConfigs from '@renderer/models/useConfigs'
import useResolvedTheme from '@renderer/models/useResolvedTheme'
import IndexPage from '@renderer/pages'
import FindPage from '@renderer/pages/find'
import TrayPage from '@renderer/pages/tray'
import { createRoot } from 'react-dom/client'
import { createHashRouter, RouterProvider } from 'react-router'
import './styles/global.scss'

const router = createHashRouter([
  {
    path: '/',
    element: <IndexPage />,
  },
  {
    path: '/find',
    element: <FindPage />,
  },
  {
    path: '/tray',
    element: <TrayPage />,
  },
])

const swhColor: MantineColorsTuple = [
  '#ffebee',
  '#fbd7db',
  '#eeaeb5',
  '#e1838c',
  '#d75e6a',
  '#d04351',
  '#cf3949',
  '#b72b3a',
  '#a42333',
  '#91182a',
]

const theme = createTheme({
  colors: {
    swhColor,
  },
  fontSizes: {
    xs: '0.765625rem',
    sm: '0.875rem',
    md: '0.875rem',
    lg: '0.984375rem',
    xl: '1.09375rem',
  },
  primaryColor: 'swhColor',
  components: {
    Tooltip: Tooltip.extend({
      defaultProps: {
        withArrow: true,
      },
    }),
    Drawer: Drawer.extend({
      defaultProps: {
        offset: 8,
        radius: 'md',
      },
    }),
    Select: Select.extend({
      defaultProps: {
        checkIconPosition: 'right',
        comboboxProps: { shadow: 'md' },
      },
    }),
    SegmentedControl: SegmentedControl.extend({
      styles: {
        label: {
          fontWeight: 400,
        },
      },
    }),
    // Mantine renders modal titles at regular weight; make them semibold so
    // the title stands out from the body text.
    Modal: Modal.extend({
      styles: {
        title: {
          fontWeight: 600,
        },
      },
    }),
  },
})

const container = document.getElementById('root')
if (container == null) throw new Error('container is null')

const AppRoot = () => {
  const { configs } = useConfigs()
  const resolvedTheme = useResolvedTheme(configs?.theme)

  return (
    <MantineProvider theme={theme} forceColorScheme={resolvedTheme}>
      <Notifications position="top-center" />
      <PageWrapper>
        <RouterProvider router={router} />
      </PageWrapper>
    </MantineProvider>
  )
}

const root = createRoot(container)
root.render(<AppRoot />)
