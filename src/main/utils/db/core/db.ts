/**
 * db
 * @author: oldj
 * @homepage: https://oldj.net
 */

import getKeys, { IKeys } from './keys'
import * as path from 'path'
import settings from '../settings'
import { DataTypeDocument, IBasicOptions, IDbDataJSON } from '../typings'
import Collection from './type/collection'
import Dict from './type/dict'
import List from './type/list'
import LatSet from './type/set'

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

  async keys(): Promise<IKeys> {
    return await getKeys(this.dir)
  }

  async toJSON(): Promise<IDbDataJSON> {
    let keys = await this.keys()
    let data: IDbDataJSON = {}

    // dict
    data.dict = {}
    if (keys.dict) {
      for (let name of keys.dict) {
        data.dict[name] = await this.dict[name].all()
      }
    }

    // list
    data.list = {}
    if (keys.list) {
      for (let name of keys.list) {
        data.list[name] = await this.list[name].all()
      }
    }

    // set
    data.set = {}
    if (keys.set) {
      for (let name of keys.set) {
        data.set[name] = await this.set[name].all()
      }
    }

    // collection
    data.collection = {}
    if (keys.collection) {
      for (let name of keys.collection) {
        data.collection[name] = {
          meta: await this.collection[name]._getMeta(),
          data: await this.collection[name].all<DataTypeDocument>(),
        }
      }
    }

    return data
  }

  async loadJSON(data: IDbDataJSON) {
    // dict
    if (data.dict) {
      for (let name of Object.keys(data.dict)) {
        await this.dict[name].update(data.dict[name])
      }
    }

    // list
    if (data.list) {
      for (let name of Object.keys(data.list)) {
        await this.list[name].update(data.list[name])
      }
    }

    // set
    if (data.set) {
      for (let name of Object.keys(data.set)) {
        await this.set[name].update(data.set[name])
      }
    }

    // collection
    if (data.collection) {
      for (let name of Object.keys(data.collection)) {
        await this.collection[name].remove()
        for (let doc of data.collection[name].data) {
          await this.collection[name]._insert(doc)
        }
        if (data.collection[name].meta) {
          await this.collection[name]._setMeta(data.collection[name].meta)
        }
      }
    }
  }
}
