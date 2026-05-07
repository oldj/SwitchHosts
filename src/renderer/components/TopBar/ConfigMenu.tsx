/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { feedbackUrl, homepageUrl } from '@common/constants'
import events from '@common/events'
import { ActionIcon, Menu, type MenuProps, ScrollArea, Tooltip } from '@mantine/core'
import ImportFromUrl from '@renderer/components/TopBar/ImportFromUrl'
import { actions, agent } from '@renderer/core/agent'
import { getErrorMessage, showErrorNotification, showSuccessNotification } from '@renderer/core/notify'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import {
  IconAdjustments,
  IconCloudDownload,
  IconDownload,
  IconHome,
  IconInfoCircle,
  IconLogout,
  IconMessage2,
  IconRefresh,
  IconSettings,
  IconUpload,
} from '@tabler/icons-react'
import { useState } from 'react'
import styles from './ConfigMenu.module.scss'

interface IProps {
  iconSize?: number
  size?: number
  menuPosition?: MenuProps['position']
  tooltip?: string
}

const ConfigMenu = (props: IProps) => {
  const { iconSize = 16, size, menuPosition, tooltip } = props
  const { lang } = useI18n()
  const { loadHostsData, setCurrentHosts } = useHostsData()
  const [showImportFromUrl, setShowImportFromUrl] = useState(false)
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)

  const strokeWidth = 1.5

  const trigger = (
    <ActionIcon variant="subtle" color="gray" size={size} aria-label={tooltip}>
      <IconSettings size={iconSize} stroke={strokeWidth} />
    </ActionIcon>
  )

  return (
    <>
      <Menu shadow="md" withinPortal position={menuPosition}>
        <Menu.Target>
          {tooltip ? (
            <Tooltip label={tooltip} position="right">
              {trigger}
            </Tooltip>
          ) : (
            trigger
          )}
        </Menu.Target>
        <Menu.Dropdown className={styles.menu_list}>
          <ScrollArea.Autosize mah="calc(100vh - 80px)" scrollbars="y" type="hover">
            <Menu.Item
              leftSection={<IconInfoCircle size={iconSize} stroke={strokeWidth} />}
              onClick={() => agent.broadcast(events.show_about)}
            >
              {lang.about}
            </Menu.Item>

            <Menu.Divider />

            <Menu.Item
              leftSection={<IconRefresh size={iconSize} stroke={strokeWidth} />}
              disabled={isCheckingUpdate}
              onClick={async () => {
                if (isCheckingUpdate) {
                  return
                }

                setIsCheckingUpdate(true)
                try {
                  const hasUpdate = await actions.checkUpdate()
                  if (!hasUpdate) {
                    showSuccessNotification({
                      title: lang.check_update,
                      message: lang.is_latest_version_inform,
                    })
                  }
                } catch (error) {
                  showErrorNotification({
                    title: lang.check_update,
                    message: getErrorMessage(error, lang.check_update_failed),
                  })
                } finally {
                  setIsCheckingUpdate(false)
                }
              }}
            >
              {lang.check_update}
            </Menu.Item>
            <Menu.Item
              leftSection={<IconMessage2 size={iconSize} stroke={strokeWidth} />}
              onClick={() => actions.openUrl(feedbackUrl)}
            >
              {lang.feedback}
            </Menu.Item>
            <Menu.Item
              leftSection={<IconHome size={iconSize} stroke={strokeWidth} />}
              onClick={() => actions.openUrl(homepageUrl)}
            >
              {lang.homepage}
            </Menu.Item>

            <Menu.Divider />

            <Menu.Item
              leftSection={<IconUpload size={iconSize} stroke={strokeWidth} />}
              onClick={async () => {
                const r = await actions.exportData()
                if (r === null) {
                  return
                } else if (r === false) {
                  console.error(lang.import_fail)
                } else {
                  console.log(lang.export_done)
                }
              }}
            >
              {lang.export}
            </Menu.Item>
            <Menu.Item
              leftSection={<IconDownload size={iconSize} stroke={strokeWidth} />}
              onClick={async () => {
                const r = await actions.importData()
                if (r === null) {
                  return
                } else if (r === true) {
                  console.log(lang.import_done)
                  await loadHostsData()
                  setCurrentHosts(null)
                } else {
                  let description = lang.import_fail
                  if (typeof r === 'string') {
                    description += ` [${r}]`
                  }

                  console.error(description)
                }
              }}
            >
              {lang.import}
            </Menu.Item>
            <Menu.Item
              leftSection={<IconCloudDownload size={iconSize} stroke={strokeWidth} />}
              onClick={async () => {
                setShowImportFromUrl(true)
              }}
            >
              {lang.import_from_url}
            </Menu.Item>

            <Menu.Divider />

            <Menu.Item
              leftSection={<IconAdjustments size={iconSize} stroke={strokeWidth} />}
              onClick={() => agent.broadcast(events.show_preferences)}
            >
              {lang.preferences}
            </Menu.Item>
            <Menu.Divider />

            <Menu.Item
              leftSection={<IconLogout size={iconSize} stroke={strokeWidth} />}
              onClick={() => actions.quit()}
            >
              {lang.quit}
            </Menu.Item>
          </ScrollArea.Autosize>
        </Menu.Dropdown>
      </Menu>
      <ImportFromUrl isShow={showImportFromUrl} setIsShow={setShowImportFromUrl} />
    </>
  )
}

export default ConfigMenu
