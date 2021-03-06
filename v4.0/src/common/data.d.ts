import { ITreeNodeData } from '@renderer/components/Tree/Node'

export type HostsWhereType = 'local' | 'remote' | 'group' | 'folder';

export interface IHostsListObject {
  id: string;
  title?: string;
  on?: boolean;
  where?: HostsWhereType;

  // remote
  url?: string;
  last_refresh?: string;
  refresh_interval?: number;

  // group
  include?: string[];

  // folder
  folder_mode?: 0 | 1 | 2; // 0: 默认; 1: 单选; 2: 多选
  folder_open?: boolean;
  children?: IHostsListObject[];

  is_sys?: boolean;

  [key: string]: any;
}

export interface IHostsContentObject {
  id: string;
  content: string;

  [key: string]: any;
}

export interface ITrashcanObject {
  data: IHostsListObject;
  add_time_ms: number;
}

export interface ITrashcanListObject extends ITrashcanObject, ITreeNodeData {
  id: string;
  children?: ITrashcanListObject[];
  is_root?: boolean;
  where?: HostsWhereType | 'trashcan';

  [key: string]: any;
}

export interface IHostsBasicData {
  list: IHostsListObject[];
  trashcan: ITrashcanObject[];
  version: [number, number, number, number];
}

export interface IOperationResult {
  success: boolean;
  message?: string;
  data?: any;
  code?: string | number;
}
