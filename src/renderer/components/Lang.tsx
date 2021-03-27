/**
 * Lang
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { LocaleName } from '@root/common/i18n'
import React from 'react'

interface Props {
  locale: LocaleName;
  children: string | React.ReactElement | React.ReactElement[];
}

const Lang = (props: Props): React.ReactElement | null => {
  const { locale } = useModel('useI18n')

  if (locale !== props.locale) {
    return null
  }

  return <>{props.children}</>
}

export default Lang
