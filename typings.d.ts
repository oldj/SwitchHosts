declare module '*.css'
declare module '*.scss'
declare module '*.png'
declare module '*.svg' {
  export function ReactComponent(props: React.SVGProps<SVGSVGElement>): React.ReactElement

  const url: string
  export default url
}

declare module '*.json' {
  const value: any
  export default value
}
