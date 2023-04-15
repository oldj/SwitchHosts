/**
 * BrowserLink
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { actions, agent } from '@renderer/core/agent'
import events from '@common/events'
import React from 'react'

interface Props {
  href: string
  children: React.ReactElement | string

  [key: string]: any
}

const BrowserLink = (props: Props) => {
  const { href } = props

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault()
    agent.broadcast(events.browser_link, href)
    actions.openUrl(href).catch((e) => console.error(e))
  }

  return (
    <a href={href} onClick={onClick}>
      {props.children}
    </a>
  )
}

export default BrowserLink
