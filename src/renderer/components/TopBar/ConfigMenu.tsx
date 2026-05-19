/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { feedbackUrl, homepageUrl } from '@common/constants'
import events from '@common/events'
import type { AppCheckUpdateResult } from '@common/update'
import { ActionIcon, Menu, type MenuProps, ScrollArea, Tooltip } from '@mantine/core'
import ImportFromUrl from '@renderer/components/TopBar/ImportFromUrl'
import { actions, agent } from '@renderer/core/agent'
import {
  getFriendlyUpdateErrorMessage,
  getErrorMessage,
  hideAppNotification,
  showErrorNotification,
  showLoadingNotification,
  showSuccessNotification,
  updateErrorNotification,
  updateSuccessNotification,
} from '@renderer/core/notify'
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
                const notificationId = showLoadingNotification({
                  title: lang.check_update,
                  message: lang.loading,
                })

                try {
                  const result = (await actions.checkUpdate()) as AppCheckUpdateResult
                  if (!result.has_update) {
                    updateSuccessNotification(notificationId, {
                      title: lang.check_update,
                      message: lang.is_latest_version_inform,
                    })
                  } else {
                    hideAppNotification(notificationId)
                  }
                } catch (error) {
                  updateErrorNotification(notificationId, {
                    title: lang.check_update,
                    message: getFriendlyUpdateErrorMessage(error, lang),
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
                try {
                  const r = await actions.exportData()
                  if (r === null) {
                    return
                  } else if (r === false) {
                    showErrorNotification({
                      title: lang.export,
                      message: lang.fail,
                    })
                  } else if (typeof r === 'string') {
                    showSuccessNotification({
                      title: lang.export,
                      message: lang.export_done,
                    })

                    try {
                      await actions.showItemInFolder(r)
                    } catch (error) {
                      console.error(error)
                    }
                  }
                } catch (error) {
                  showErrorNotification({
                    title: lang.export,
                    message: getErrorMessage(error, lang.fail),
                  })
                }
              }}
            >
              {lang.export}
            </Menu.Item>
            <Menu.Item
              leftSection={<IconDownload size={iconSize} stroke={strokeWidth} />}
              onClick={async () => {
                const notificationId = showLoadingNotification({
                  title: lang.import,
                  message: lang.loading,
                })

                try {
                  const r = await actions.importData()
                  if (r === null) {
                    hideAppNotification(notificationId)
                    return
                  } else if (r === true) {
                    await loadHostsData()
                    setCurrentHosts(null)
                    updateSuccessNotification(notificationId, {
                      title: lang.import,
                      message: lang.import_done,
                    })
                  } else {
                    let description = lang.import_fail
                    if (typeof r === 'string') {
                      description += ` [${r}]`
                    }

                    updateErrorNotification(notificationId, {
                      title: lang.import,
                      message: description,
                    })
                  }
                } catch (error) {
                  updateErrorNotification(notificationId, {
                    title: lang.import,
                    message: getErrorMessage(error, lang.import_fail),
                  })
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
