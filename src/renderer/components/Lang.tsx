/**
 * Lang
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { LocaleName } from '@common/i18n'
import React from 'react'
import useI18n from '@renderer/models/useI18n'

interface Props {
  locale: LocaleName
  children: string | React.ReactElement | React.ReactElement[]
}

const Lang = (props: Props): React.ReactElement | null => {
  const { locale } = useI18n()

  if (locale !== props.locale) {
    return null
  }

  return <>{props.children}</>
}

export default Lang
