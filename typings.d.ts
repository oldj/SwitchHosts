declare module '*.css'
declare module '*.scss'
declare module '*.png'
declare module '*.svg' {
  const url: string
  export default url
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
