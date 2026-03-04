/**
 * ConfigMenu
 * @author: oldj
 * @homepage: https://oldj.net
 */

import {
  Button,
  Menu,
  HStack,
  Portal,
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

const MenuItem = Menu.Item as unknown as React.FC<
  React.PropsWithChildren<{
    value: string
    onClick?: () => void | Promise<void>
  }>
>
const MenuTrigger = Menu.Trigger as unknown as React.FC<React.PropsWithChildren<{ asChild?: boolean }>>
const MenuPositioner = Menu.Positioner as unknown as React.FC<React.PropsWithChildren>
const MenuContent = Menu.Content as unknown as React.FC<React.PropsWithChildren<any>>

const ConfigMenu = () => {
  const { lang } = useI18n()
  const { loadHostsData, setCurrentHosts } = useHostsData()
  const [show_import_from_url, setShowImportFromUrl] = useState(false)

  return (
    <>
      <Menu.Root>
        <MenuTrigger asChild>
          <Button variant="ghost" width="35px" px="10.5px">
            <IconSettings size={16} />
          </Button>
        </MenuTrigger>
        <Portal>
          <MenuPositioner>
            <MenuContent
              borderColor="var(--swh-border-color-0)"
              className={styles.menu_list}
              maxH={'calc(100vh - 80px)'}
              overflowY={'scroll'}
            >
              <MenuItem value="about" onClick={() => agent.broadcast(events.show_about)}>
                <HStack>
                  <IconInfoCircle size={16} />
                  <span>{lang.about}</span>
                </HStack>
              </MenuItem>

              <Menu.Separator />

              <MenuItem
                value="check-update"
            onClick={async () => {
              let r = await actions.checkUpdate()
              if (r === false) {
                console.log(lang.is_latest_version_inform)
              } else if (r === null) {
                console.error(lang.check_update_failed)
              }
            }}
              >
                <HStack>
                  <IconRefresh size={16} />
                  <span>{lang.check_update}</span>
                </HStack>
              </MenuItem>
              <MenuItem value="feedback" onClick={() => actions.openUrl(feedback_url)}>
                <HStack>
                  <IconMessage2 size={16} />
                  <span>{lang.feedback}</span>
                </HStack>
              </MenuItem>
              <MenuItem value="homepage" onClick={() => actions.openUrl(homepage_url)}>
                <HStack>
                  <IconHome size={16} />
                  <span>{lang.homepage}</span>
                </HStack>
              </MenuItem>

              <Menu.Separator />

              <MenuItem
                value="export"
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
                <HStack>
                  <IconUpload size={16} />
                  <span>{lang.export}</span>
                </HStack>
              </MenuItem>
              <MenuItem
                value="import"
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
                <HStack>
                  <IconDownload size={16} />
                  <span>{lang.import}</span>
                </HStack>
              </MenuItem>
              <MenuItem
                value="import-url"
            onClick={async () => {
              setShowImportFromUrl(true)
            }}
              >
                <HStack>
                  <IconCloudDownload size={16} />
                  <span>{lang.import_from_url}</span>
                </HStack>
              </MenuItem>

              <Menu.Separator />

              <MenuItem value="prefs" onClick={() => agent.broadcast(events.show_preferences)}>
                <HStack>
                  <IconAdjustments size={16} />
                  <span>{lang.preferences}</span>
                </HStack>
              </MenuItem>
              <MenuItem value="devtools" onClick={() => actions.cmdToggleDevTools()}>
                <HStack>
                  <IconCode size={16} />
                  <span>{lang.toggle_developer_tools}</span>
                </HStack>
              </MenuItem>

              <Menu.Separator />

              <MenuItem value="quit" onClick={() => actions.quit()}>
                <HStack>
                  <IconLogout size={16} />
                  <span>{lang.quit}</span>
                </HStack>
              </MenuItem>
            </MenuContent>
          </MenuPositioner>
        </Portal>
      </Menu.Root>
      <ImportFromUrl is_show={show_import_from_url} setIsShow={setShowImportFromUrl} />
    </>
  )
}

export default ConfigMenu
