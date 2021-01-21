export type HostsObjectType = {
  id: string;
  title: string;
  content: string;
  on: boolean;
  where: 'local' | 'remote';
  folder_mode: number;
  url?: string;
  last_refresh?: string;
  refresh_interval?: number;
  include?: string[];
  children?: HostsObjectType[];
  [key: string]: any;
}

export type HostsDataType = {
  list?: HostsObjectType[];
  version?: [number, number, number, number];
}
