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

export interface IDictsDumpJSON {
  [key: string]: DataTypeDict;
}

export type DataTypeList = any[]

export interface IListsDumpJSON {
  [key: string]: DataTypeList;
}

export type DataTypeSetItem = string | number | boolean | null
export type DataTypeSet = Set<DataTypeSetItem>

export interface ISetsDumpJSON {
  [key: string]: DataTypeSetItem[];
}

export interface DataTypeDocument {
  _id: string;

  [key: string]: any;
}

export interface ICollectionsDumpJSON {
  [key: string]: {
    meta?: {
      [key: string]: any;
    };
    data: DataTypeDocument[];
  };
}

export interface IDbDataJSON {
  dict?: IDictsDumpJSON;
  list?: IListsDumpJSON;
  set?: ISetsDumpJSON;
  collection?: ICollectionsDumpJSON;
}
