import { EventHandler } from '@main/preload'
import { agent } from '@renderer/agent'
import { useEffect } from 'react'

const useOn = (event: string, handler: EventHandler) => {
  // agent.on will return an off function for clean up
  useEffect(() => agent.on(event, handler), [])
}

export default useOn
