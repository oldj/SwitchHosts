/**
 * collection
 * @author: oldj
 * @homepage: https://oldj.net
 */

import LatDb from '@main/utils/db/core/db'
import { DataTypeDocument } from '@main/utils/db/typings'
import { asInt } from '@main/utils/db/utils/asType'
import * as fs from 'fs'
import lodash from 'lodash'
import * as path from 'path'
import Dict from './dict'
import List from './list'

type FilterFunction = (item: any) => boolean

interface Options {

}

export default class Collection {
  name: string
  private _db: LatDb
  private _path: string
  private _path_data: string
  private options: Options = {}
  private _meta: Dict
  private _ids: List
  private _docs: { [key: string]: Dict } = {}

  constructor(db: LatDb, name: string) {
    this._db = db
    this.name = name
    this._path = path.join(db.dir, 'collection', name)
    this._path_data = path.join(this._path, 'data')

    this._meta = new Dict('meta', this._path, db.options)
    this._ids = new List('ids', this._path, db.options)
  }

  updateConfig(options: Partial<Options>) {
    this.options = {
      ...this.options,
      ...options,
    }
  }

  private async makeId(): Promise<string> {
    let index = asInt(await this._meta.get('index'), 0)
    if (index < 0) index = 0
    index++
    await this._meta.set('index', index)

    let ts = ((new Date()).getTime() % 1000).toString().padStart(3, '0')

    return `${index}${ts}`
  }

  private getDoc(_id: string): Dict {
    if (!this._docs[_id]) {
      this._docs[_id] = new Dict(_id, this._path_data, this._db.options)
    }

    return this._docs[_id]
  }

  async count(): Promise<number> {
    return (await this._ids.all()).length
  }

  async insert<T>(doc: Partial<DataTypeDocument> & T): Promise<DataTypeDocument> {
    let _id = await this.makeId()
    await this._ids.push(_id)
    doc = { ...doc, _id }

    let d = new Dict(_id, this._path_data, this._db.options)
    await d.update(doc)

    this._docs[_id] = d

    return doc as DataTypeDocument
  }

  async all<T>(keys: string | string[] = '*'): Promise<(DataTypeDocument & T) | Partial<DataTypeDocument & T>[]> {
    return await Promise.all((await this._ids.all()).map(async _id => {
      let d = this.getDoc(_id)
      let doc: (DataTypeDocument & T) | Partial<DataTypeDocument & T> = await d.toJSON<DataTypeDocument & T>()

      if (Array.isArray(keys)) {
        doc = lodash.pick(doc, keys) as Partial<DataTypeDocument & T>
      }

      return doc
    }))
  }

  async index<T>(index: number, keys: string | string[] = '*'): Promise<Partial<DataTypeDocument & T> | undefined> {
    let _id = await this._ids.index(index)
    if (!_id) return

    return await this.find<T>(i => i._id === _id, keys)
  }

  async find<T>(predicate: FilterFunction, keys: string | string[] = '*'): Promise<Partial<DataTypeDocument & T> | undefined> {
    let _ids = await this._ids.all()

    for (let _id of _ids) {
      let d = this.getDoc(_id)
      let doc: Partial<DataTypeDocument & T> = await d.toJSON<DataTypeDocument & T>()

      if (predicate(doc)) {
        if (Array.isArray(keys)) {
          doc = lodash.pick(doc, keys) as Partial<DataTypeDocument & T>
        }

        return doc
      }
    }
  }

  async filter<T>(predicate: FilterFunction, keys: string | string[] = '*'): Promise<Partial<DataTypeDocument & T>[]> {
    let _ids = await this._ids.all()
    let list: Partial<DataTypeDocument & T>[] = []

    for (let _id of _ids) {
      let d = this.getDoc(_id)
      let doc: Partial<DataTypeDocument & T> = await d.toJSON<DataTypeDocument & T>()

      if (predicate(doc)) {
        if (Array.isArray(keys)) {
          doc = lodash.pick(doc, keys) as Partial<DataTypeDocument & T>
        }

        list.push(doc)
      }
    }

    return list
  }

  async update<T>(_id: string, data: Partial<DataTypeDocument & T>): Promise<DataTypeDocument & T> {
    let d = this.getDoc(_id)
    let doc: DataTypeDocument & T = await d.toJSON<DataTypeDocument & T>()

    doc = {
      ...doc,
      ...data,
      _id,
    }

    return await d.update<DataTypeDocument & T>(doc)
  }

  async delete(_id: string) {
    let index = await this._ids.indexOf(_id)
    if (index === -1) return
    await this._ids.splice(index, 1)
    let d = this.getDoc(_id)
    await d.remove()
    delete this._docs[_id]
  }

  async remove() {
    await this._meta.remove()
    await this._ids.remove()
    this._docs = {}
    await fs.promises.rmdir(this._path, { recursive: true })
  }
}
