export type HostsWhereType = 'local' | 'remote' | 'group' | 'folder';

export type HostsListObjectType = {
  id: string;
  title: string;
  on: boolean;
  where: HostsWhereType;

  // remote
  url: string;
  last_refresh?: string;
  refresh_interval?: number;

  // group
  include: string[];

  // folder
  folder_mode: 0 | 1 | 2; // 0: 默认; 1: 单选; 2: 多选
  folder_open?: boolean;
  children?: HostsListObjectType[];

  [key: string]: any;
}

export type HostsContentObjectType = {
  id: string;
  content: string;

  [key: string]: any;
}

export type HostsDataType = {
  list: HostsListObjectType[];
  version: [number, number, number, number];
}
