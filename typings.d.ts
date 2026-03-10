declare module '*.css'
declare module '*.scss'
declare module '*.png'
declare module '*.svg' {
  const url: string
  export default url
}

declare module '@tabler/icons-react' {
  import type {
    ForwardRefExoticComponent,
    RefAttributes,
    SVGProps,
  } from 'react'

  export interface IconProps extends Partial<Omit<SVGProps<SVGSVGElement>, 'stroke'>> {
    size?: string | number
    stroke?: string | number
    title?: string
  }

  export type TablerIcon = ForwardRefExoticComponent<
    IconProps & RefAttributes<SVGSVGElement>
  >

  export const IconAdjustments: TablerIcon
  export const IconCloudDownload: TablerIcon
  export const IconCode: TablerIcon
  export const IconDeviceDesktop: TablerIcon
  export const IconDownload: TablerIcon
  export const IconFileText: TablerIcon
  export const IconFileTime: TablerIcon
  export const IconFolder: TablerIcon
  export const IconHelpCircle: TablerIcon
  export const IconHistory: TablerIcon
  export const IconHome: TablerIcon
  export const IconInfoCircle: TablerIcon
  export const IconLayoutSidebarLeftCollapse: TablerIcon
  export const IconLayoutSidebarLeftExpand: TablerIcon
  export const IconLogout: TablerIcon
  export const IconMessage2: TablerIcon
  export const IconPlus: TablerIcon
  export const IconRefresh: TablerIcon
  export const IconSettings: TablerIcon
  export const IconStack2: TablerIcon
  export const IconTrash: TablerIcon
  export const IconUpload: TablerIcon
  export const IconWorld: TablerIcon
  export const IconX: TablerIcon
}

declare namespace React {
  interface ReactSVG {
    [elementName: string]: SVGProps<SVGElement>
  }
}

declare module '*.json' {
  const value: any
  export default value
}
