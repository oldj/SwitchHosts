/**
 * ConfigMenu
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ActionIcon, Menu } from '@mantine/core'
import { showNotification } from '@mantine/notifications'
import ImportFromUrl from '@renderer/components/TopBar/ImportFromUrl'
import { actions, agent } from '@renderer/core/agent'
import { feedback_url, homepage_url } from '@common/constants'
import events from '@common/events'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import React, { useState } from 'react'
import styles from './ConfigMenu.module.scss'
import {
  IconAdjustmentsHorizontal,
  IconDownload,
  IconHome,
  IconInfoCircle,
  IconLogout,
  IconMessage,
  IconRefresh,
  IconSettings,
  IconTool,
  IconUpload,
} from '@tabler/icons-react'

const ConfigMenu = () => {
  const { lang } = useI18n()
  const { loadHostsData, setCurrentHosts } = useHostsData()
  const [show_import_from_url, setShowImportFromUrl] = useState(false)

  return (
    <>
      <Menu shadow="md" width={200}>
        <Menu.Target>
          <ActionIcon variant="subtle">
            <IconSettings size={20} stroke={1.5} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown className={styles.menu_list}>
          <Menu.Item
            icon={<IconInfoCircle size={16} />}
            onClick={() => agent.broadcast(events.show_about)}
          >
            {lang.about}
          </Menu.Item>

          <Menu.Divider />

          <Menu.Item
            icon={<IconRefresh size={16} />}
            onClick={async () => {
              let r = await actions.checkUpdate()
              if (r === false) {
                showNotification({
                  message: lang.is_latest_version_inform,
                  // status: 'info',
                  autoClose: 3000,
                })
              } else if (r === null) {
                showNotification({
                  message: lang.check_update_failed,
                  // status: 'error',
                  color: 'red',
                  autoClose: 3000,
                })
              }
            }}
          >
            {lang.check_update}
          </Menu.Item>
          <Menu.Item icon={<IconMessage size={16} />} onClick={() => actions.openUrl(feedback_url)}>
            {lang.feedback}
          </Menu.Item>
          <Menu.Item icon={<IconHome size={16} />} onClick={() => actions.openUrl(homepage_url)}>
            {lang.homepage}
          </Menu.Item>

          <Menu.Divider />

          <Menu.Item
            icon={<IconUpload size={16} />}
            onClick={async () => {
              let r = await actions.exportData()
              if (r === null) {
                return
              } else if (r === false) {
                showNotification({
                  color: 'red',
                  // status: 'error',
                  message: lang.import_fail,
                })
              } else {
                showNotification({
                  // status: 'success',
                  color: 'green',
                  message: lang.export_done,
                })
              }
            }}
          >
            {lang.export}
          </Menu.Item>
          <Menu.Item
            icon={<IconDownload size={16} />}
            onClick={async () => {
              let r = await actions.importData()
              if (r === null) {
                return
              } else if (r === true) {
                showNotification({
                  // status: 'success',
                  color: 'green',
                  message: lang.import_done,
                })
                await loadHostsData()
                setCurrentHosts(null)
              } else {
                let message = lang.import_fail
                if (typeof r === 'string') {
                  message += ` [${r}]`
                }

                showNotification({
                  // status: 'error',
                  color: 'red',
                  message,
                })
              }
            }}
          >
            {lang.import}
          </Menu.Item>
          <Menu.Item
            icon={<IconDownload size={16} />}
            onClick={async () => {
              setShowImportFromUrl(true)
            }}
          >
            {lang.import_from_url}
          </Menu.Item>

          <Menu.Divider />

          <Menu.Item
            icon={<IconAdjustmentsHorizontal size={16} />}
            onClick={() => agent.broadcast(events.show_preferences)}
          >
            {lang.preferences}
          </Menu.Item>
          <Menu.Item icon={<IconTool size={16} />} onClick={() => actions.cmdToggleDevTools()}>
            {lang.toggle_developer_tools}
          </Menu.Item>

          <Menu.Divider />

          <Menu.Item icon={<IconLogout size={16} />} onClick={() => actions.quit()}>
            {lang.quit}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <ImportFromUrl is_show={show_import_from_url} setIsShow={setShowImportFromUrl} />
    </>
  )
}

export default ConfigMenu
