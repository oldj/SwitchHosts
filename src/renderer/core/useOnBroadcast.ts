import { agent } from '@renderer/core/agent'
import { useEffect } from 'react'

type EventHandler = (...args: any[]) => void

const useOnBroadcast = (event: string, handler: EventHandler, deps: any[] = []) => {
  // Native unlisten is asynchronous. Disable the old callback immediately so
  // a single toggle cannot reach both subscriptions during an effect refresh.
  useEffect(() => {
    let active = true
    const off = agent.on(event, (...args) => {
      if (active) return handler(...args)
    })
    return () => {
      active = false
      off()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

export default useOnBroadcast
