/**
 * app
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ChakraProvider } from '@chakra-ui/react'
import React from 'react'

export function rootContainer(container: React.ReactElement) {
  return React.createElement(ChakraProvider, null, container)
}
