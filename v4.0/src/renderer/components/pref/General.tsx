/**
 * General
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { FormControl, FormHelperText, FormLabel } from '@chakra-ui/react'
import { ConfigsType } from '@root/common/default_configs'
import React from 'react'

interface IProps {
  data: ConfigsType;
  onChange: (kv: Partial<ConfigsType>) => void;
}

const General = (props: IProps) => {
  return (
    <>
      <FormControl id="email">
        <FormLabel>Email address</FormLabel>
        <FormHelperText>We'll never share your email.</FormHelperText>
      </FormControl>
    </>
  )
}

export default General
