/**
 * theme
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { extendTheme } from '@chakra-ui/react'

const config = {
  initialColorMode: 'light',
  useSystemColorMode: false,
}

const colors = {}

// @ts-ignore
const theme = extendTheme({ config, colors })
export default theme
