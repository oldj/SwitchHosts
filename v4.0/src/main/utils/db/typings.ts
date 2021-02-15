/**
 * typings.d.ts
 * @author: oldj
 * @homepage: https://oldj.net
 */

export interface IBasicOptions {
  debug: boolean;
  dump_delay: number;
  ignore_error: boolean;

  [key: string]: any;
}

export interface DataTypeDict {
  [key: string]: any;
}

export type DataTypeList = any[]

export type DataTypeSetItem = string | number | boolean | null
export type DataTypeSet = Set<DataTypeSetItem>

export interface DataTypeDocument {
  _id: string;

  [key: string]: any;
}
