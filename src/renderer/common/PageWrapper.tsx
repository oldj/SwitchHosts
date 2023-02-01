/**
 * PageWrapper.tsx
 * @author: oldj
 * @homepage: https://oldj.net
 */

import Loading from '@renderer/components/Loading'
import React, { Suspense } from 'react'

interface IProps {
  children?: React.ReactNode
}

function PageWrapper(props: IProps) {
  const { children } = props

  return <Suspense fallback={<Loading />}>{children}</Suspense>
}

export default PageWrapper
