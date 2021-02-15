/**
 * db
 * @author: oldj
 * @homepage: https://oldj.net
 */

import Dict from '@main/utils/db/core/type/dict'
import List from '@main/utils/db/core/type/list'
import LatSet from '@main/utils/db/core/type/set'
import Collection from '@main/utils/db/core/type/collection'
import { IBasicOptions } from '@main/utils/db/typings'
import * as path from 'path'
import settings from '@main/utils/db/settings'

interface IDBOptions extends IBasicOptions {
}

export default class LatDb {
  dir: string
  options: IDBOptions
  dict: { [key: string]: Dict }
  list: { [key: string]: List }
  set: { [key: string]: LatSet }
  collection: { [key: string]: Collection }
  private _dict: { [key: string]: Dict } = {}
  private _list: { [key: string]: List } = {}
  private _set: { [key: string]: LatSet } = {}
  private _collection: { [key: string]: Collection } = {}

  constructor(root_dir: string, options?: Partial<IDBOptions>) {
    // if (!fs.existsSync(path) || !fs.statSync(path).isDirectory()) {
    //   throw new Error(`'${path}' is not a directory.`)
    // }

    this.dir = root_dir
    this.options = { ...this.getDefaultOptions(), ...options }

    this.dict = new Proxy({}, {
      get: (target: {}, key: PropertyKey, receiver: any): Dict => {
        let name: string = key.toString()
        if (!this._dict.hasOwnProperty(name)) {
          this._dict[name] = new Dict(name, path.join(this.dir, 'dict'), this.options)
        }

        return this._dict[name]
      },
    })

    this.list = new Proxy({}, {
      get: (target: {}, key: PropertyKey, receiver: any): List => {
        let name: string = key.toString()
        if (!this._list.hasOwnProperty(name)) {
          this._list[name] = new List(name, path.join(this.dir, 'list'), this.options)
        }

        return this._list[name]
      },
    })

    this.set = new Proxy({}, {
      get: (target: {}, key: PropertyKey, receiver: any): LatSet => {
        let name: string = key.toString()
        if (!this._set.hasOwnProperty(name)) {
          this._set[name] = new LatSet(name, path.join(this.dir, 'set'), this.options)
        }

        return this._set[name]
      },
    })

    this.collection = new Proxy({}, {
      get: (target: {}, key: PropertyKey, receiver: any): Collection => {
        let name: string = key.toString()
        if (!this._collection.hasOwnProperty(name)) {
          this._collection[name] = new Collection(this, name)
        }

        return this._collection[name]
      },
    })
  }

  private getDefaultOptions(): IDBOptions {
    const options: IDBOptions = {
      debug: false,
      dump_delay: settings.io_dump_delay,
      ignore_error: true,
    }

    return options
  }
}
