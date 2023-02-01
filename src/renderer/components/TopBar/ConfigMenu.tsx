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
import { feedback_url, homepage_url } from '@root/common/constants'
import events from '@root/common/events'
import useHostsData from '@root/renderer/models/useHostsData'
import useI18n from '@root/renderer/models/useI18n'
import React, { useState } from 'react'
import {
  BiCog,
  BiExit,
  BiExport,
  BiHomeCircle,
  BiImport,
  BiInfoCircle,
  BiMessageDetail,
  BiRefresh,
  BiSliderAlt,
  BiWrench,
} from 'react-icons/bi'
import styles from './ConfigMenu.less'

const ConfigMenu = () => {
  const { lang } = useI18n()
  const { loadHostsData, setCurrentHosts } = useHostsData()
  const [show_import_from_url, setShowImportFromUrl] = useState(false)
  const toast = useToast()

  return (
    <>
      <Menu>
        <MenuButton as={Button} variant="ghost" width="35px" px="10.5px">
          <BiCog />
        </MenuButton>
        <MenuList
          borderColor="var(--swh-border-color-0)"
          className={styles.menu_list}
          maxH={'calc(100vh - 80px)'}
          overflowY={'scroll'}
        >
          <MenuItem icon={<BiInfoCircle />} onClick={() => agent.broadcast(events.show_about)}>
            {lang.about}
          </MenuItem>

          <MenuDivider />

          <MenuItem
            icon={<BiRefresh />}
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
          <MenuItem icon={<BiMessageDetail />} onClick={() => actions.openUrl(feedback_url)}>
            {lang.feedback}
          </MenuItem>
          <MenuItem icon={<BiHomeCircle />} onClick={() => actions.openUrl(homepage_url)}>
            {lang.homepage}
          </MenuItem>

          <MenuDivider />

          <MenuItem
            icon={<BiExport />}
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
            icon={<BiImport />}
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
            icon={<BiImport />}
            onClick={async () => {
              setShowImportFromUrl(true)
            }}
          >
            {lang.import_from_url}
          </MenuItem>

          <MenuDivider />

          <MenuItem icon={<BiSliderAlt />} onClick={() => agent.broadcast(events.show_preferences)}>
            {lang.preferences}
          </MenuItem>
          <MenuItem icon={<BiWrench />} onClick={() => actions.cmdToggleDevTools()}>
            {lang.toggle_developer_tools}
          </MenuItem>

          <MenuDivider />

          <MenuItem icon={<BiExit />} onClick={() => actions.quit()}>
            {lang.quit}
          </MenuItem>
        </MenuList>
      </Menu>
      <ImportFromUrl is_show={show_import_from_url} setIsShow={setShowImportFromUrl} />
    </>
  )
}

export default ConfigMenu
