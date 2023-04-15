/**
 * ConfigMenu
 * @author: oldj
 * @homepage: https://oldj.net
 */

import {
  Button,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuList,
  useToast,
} from '@chakra-ui/react'
import ImportFromUrl from '@renderer/components/TopBar/ImportFromUrl'
import { actions, agent } from '@renderer/core/agent'
import { feedback_url, homepage_url } from '@common/constants'
import events from '@common/events'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import React, { useState } from 'react'
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
import styles from './ConfigMenu.module.scss'

const ConfigMenu = () => {
  const { lang } = useI18n()
  const { loadHostsData, setCurrentHosts } = useHostsData()
  const [show_import_from_url, setShowImportFromUrl] = useState(false)
  const toast = useToast()

  return (
    <>
      <Menu>
        <MenuButton as={Button} variant="ghost" width="35px" px="10.5px">
          <IconSettings size={16} />
        </MenuButton>
        <MenuList
          borderColor="var(--swh-border-color-0)"
          className={styles.menu_list}
          maxH={'calc(100vh - 80px)'}
          overflowY={'scroll'}
        >
          <MenuItem
            icon={<IconInfoCircle size={16} />}
            onClick={() => agent.broadcast(events.show_about)}
          >
            {lang.about}
          </MenuItem>

          <MenuDivider />

          <MenuItem
            icon={<IconRefresh size={16} />}
            onClick={async () => {
              let r = await actions.checkUpdate()
              if (r === false) {
                toast({
                  description: lang.is_latest_version_inform,
                  status: 'info',
                  duration: 3000,
                  isClosable: true,
                })
              } else if (r === null) {
                toast({
                  description: lang.check_update_failed,
                  status: 'error',
                  duration: 3000,
                  isClosable: true,
                })
              }
            }}
          >
            {lang.check_update}
          </MenuItem>
          <MenuItem icon={<IconMessage2 size={16} />} onClick={() => actions.openUrl(feedback_url)}>
            {lang.feedback}
          </MenuItem>
          <MenuItem icon={<IconHome size={16} />} onClick={() => actions.openUrl(homepage_url)}>
            {lang.homepage}
          </MenuItem>

          <MenuDivider />

          <MenuItem
            icon={<IconUpload size={16} />}
            onClick={async () => {
              let r = await actions.exportData()
              if (r === null) {
                return
              } else if (r === false) {
                toast({
                  status: 'error',
                  description: lang.import_fail,
                  isClosable: true,
                })
              } else {
                toast({
                  status: 'success',
                  description: lang.export_done,
                  isClosable: true,
                })
              }
            }}
          >
            {lang.export}
          </MenuItem>
          <MenuItem
            icon={<IconDownload size={16} />}
            onClick={async () => {
              let r = await actions.importData()
              if (r === null) {
                return
              } else if (r === true) {
                toast({
                  status: 'success',
                  description: lang.import_done,
                  isClosable: true,
                })
                await loadHostsData()
                setCurrentHosts(null)
              } else {
                let description = lang.import_fail
                if (typeof r === 'string') {
                  description += ` [${r}]`
                }

                toast({
                  status: 'error',
                  description,
                  isClosable: true,
                })
              }
            }}
          >
            {lang.import}
          </MenuItem>
          <MenuItem
            icon={<IconCloudDownload size={16} />}
            onClick={async () => {
              setShowImportFromUrl(true)
            }}
          >
            {lang.import_from_url}
          </MenuItem>

          <MenuDivider />

          <MenuItem
            icon={<IconAdjustments size={16} />}
            onClick={() => agent.broadcast(events.show_preferences)}
          >
            {lang.preferences}
          </MenuItem>
          <MenuItem icon={<IconCode size={16} />} onClick={() => actions.cmdToggleDevTools()}>
            {lang.toggle_developer_tools}
          </MenuItem>

          <MenuDivider />

          <MenuItem icon={<IconLogout size={16} />} onClick={() => actions.quit()}>
            {lang.quit}
          </MenuItem>
        </MenuList>
      </Menu>
      <ImportFromUrl is_show={show_import_from_url} setIsShow={setShowImportFromUrl} />
    </>
  )
}

export default ConfigMenu
