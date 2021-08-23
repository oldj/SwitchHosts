import { ITreeNodeData } from './tree'

export type HostsType = 'local' | 'remote' | 'group' | 'folder'
export type FolderModeType = 0 | 1 | 2 // 0: 默认; 1: 单选; 2: 多选

export interface IHostsListObject {
  id: string
  title?: string
  on?: boolean
  type?: HostsType

  // remote
  url?: string
  last_refresh?: string
  last_refresh_ms?: number
  refresh_interval?: number // 单位：秒

  // group
  include?: string[]

  // folder
  folder_mode?: FolderModeType
  folder_open?: boolean
  children?: IHostsListObject[]

  is_sys?: boolean

  [key: string]: any
}

export interface IHostsContentObject {
  id: string
  content: string

  [key: string]: any
}

export interface ITrashcanObject {
  data: IHostsListObject
  add_time_ms: number
  parent_id: string | null
}

export interface ITrashcanListObject extends ITrashcanObject, ITreeNodeData {
  id: string
  children?: ITrashcanListObject[]
  is_root?: boolean
  type?: HostsType | 'trashcan'

  [key: string]: any
}

export interface IHostsHistoryObject {
  id: string
  content: string
  add_time_ms: number
  label?: string
}

export type VersionType = [number, number, number, number]

export interface IHostsBasicData {
  list: IHostsListObject[]
  trashcan: ITrashcanObject[]
  version: VersionType
}

export interface IOperationResult {
  success: boolean
  message?: string
  data?: any
  code?: string | number
}

export interface ICommandRunResult {
  _id?: string
  success: boolean
  stdout: string
  stderr: string
  add_time_ms: number
}
