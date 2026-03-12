/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { feedback_url, homepage_url } from '@common/constants'
import events from '@common/events'
import { ActionIcon, Menu } from '@mantine/core'
import ImportFromUrl from '@renderer/components/TopBar/ImportFromUrl'
import { actions, agent } from '@renderer/core/agent'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import {
  IconAdjustments,
  IconCloudDownload,
  IconCode,
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
}

const ConfigMenu = (props: IProps) => {
  const { iconSize = 16 } = props
  const { lang } = useI18n()
  const { loadHostsData, setCurrentHosts } = useHostsData()
  const [show_import_from_url, setShowImportFromUrl] = useState(false)

  const strokeWidth = 1.5

  return (
    <>
      <Menu shadow="md" withinPortal>
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray">
            <IconSettings size={iconSize} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown className={styles.menu_list}>
          <Menu.Item
            leftSection={<IconInfoCircle size={iconSize} stroke={strokeWidth} />}
            onClick={() => agent.broadcast(events.show_about)}
          >
            {lang.about}
          </Menu.Item>

          <Menu.Divider />

          <Menu.Item
            leftSection={<IconRefresh size={iconSize} stroke={strokeWidth} />}
            onClick={async () => {
              let r = await actions.checkUpdate()
              if (r === false) {
                console.log(lang.is_latest_version_inform)
              } else if (r === null) {
                console.error(lang.check_update_failed)
              }
            }}
          >
            {lang.check_update}
          </Menu.Item>
          <Menu.Item
            leftSection={<IconMessage2 size={iconSize} stroke={strokeWidth} />}
            onClick={() => actions.openUrl(feedback_url)}
          >
            {lang.feedback}
          </Menu.Item>
          <Menu.Item
            leftSection={<IconHome size={iconSize} stroke={strokeWidth} />}
            onClick={() => actions.openUrl(homepage_url)}
          >
            {lang.homepage}
          </Menu.Item>

          <Menu.Divider />

          <Menu.Item
            leftSection={<IconUpload size={iconSize} stroke={strokeWidth} />}
            onClick={async () => {
              let r = await actions.exportData()
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
              let r = await actions.importData()
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
          <Menu.Item
            leftSection={<IconCode size={iconSize} stroke={strokeWidth} />}
            onClick={() => actions.cmdToggleDevTools()}
          >
            {lang.toggle_developer_tools}
          </Menu.Item>

          <Menu.Divider />

          <Menu.Item
            leftSection={<IconLogout size={iconSize} stroke={strokeWidth} />}
            onClick={() => actions.quit()}
          >
            {lang.quit}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <ImportFromUrl is_show={show_import_from_url} setIsShow={setShowImportFromUrl} />
    </>
  )
}

export default ConfigMenu
