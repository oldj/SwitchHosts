/**
 * app
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ChakraProvider, ColorModeScript } from '@chakra-ui/react'
import React from 'react'
import theme from './theme'

export function rootContainer(container: React.ReactElement) {
  // return React.createElement(ChakraProvider, null, container)
  return (
    <ChakraProvider>
      <ColorModeScript initialColorMode={theme.config.initialColorMode} />
      {container}
    </ChakraProvider>
  )
}
