/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import PageWrapper from '@renderer/common/PageWrapper'
import useConfigs from '@renderer/models/useConfigs'
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

const container = document.getElementById('root')
if (container == null) throw new Error('container is null')

const AppRoot = () => {
  const { configs } = useConfigs()

  return (
    <MantineProvider forceColorScheme={configs?.theme === 'dark' ? 'dark' : 'light'}>
      <PageWrapper>
        <RouterProvider router={router} />
      </PageWrapper>
    </MantineProvider>
  )
}

const root = createRoot(container)
root.render(<AppRoot />)
