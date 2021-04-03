/**
 * ConfigMenu
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { Button, Menu, MenuButton, MenuDivider, MenuItem, MenuList, useToast } from '@chakra-ui/react'
import { actions, agent } from '@renderer/core/agent'
import { feedback_url, homepage_url } from '@root/common/constants'
import React from 'react'
import { BiCog, BiExit, BiHomeCircle, BiInfoCircle, BiMessageDetail, BiRefresh, BiSliderAlt } from 'react-icons/bi'

interface Props {

}

const ConfigMenu = (props: Props) => {
  const { lang } = useModel('useI18n')
  const toast = useToast()

  return (
    <Menu>
      <MenuButton
        as={Button}
        variant="ghost"
        width="35px"
      >
        <BiCog/>
      </MenuButton>
      <MenuList borderColor="var(--swh-border-color-0)">
        <MenuItem
          icon={<BiInfoCircle/>}
          onClick={() => agent.broadcast('show_about')}
        >
          {lang.about}
        </MenuItem>

        <MenuDivider/>

        <MenuItem
          icon={<BiRefresh/>}
          onClick={async () => {
            let r = await actions.checkUpdate()
            if (r === false) {
              toast({
                description: lang.is_latest_version_inform,
                status: 'info',
                duration: 3000,
                isClosable: true,
              })
            }
          }}
        >
          {lang.check_update}
        </MenuItem>
        <MenuItem
          icon={<BiMessageDetail/>}
          onClick={() => actions.openUrl(feedback_url)}
        >
          {lang.feedback}
        </MenuItem>
        <MenuItem
          icon={<BiHomeCircle/>}
          onClick={() => actions.openUrl(homepage_url)}
        >
          {lang.homepage}
        </MenuItem>

        <MenuDivider/>

        <MenuItem
          icon={<BiSliderAlt/>}
          onClick={() => agent.broadcast('show_preferences')}
        >
          {lang.preferences}
        </MenuItem>
        <MenuItem
          icon={<BiExit/>}
          onClick={() => actions.quit()}
        >
          {lang.quit}
        </MenuItem>
      </MenuList>
    </Menu>
  )
}

export default ConfigMenu
