/**
 * collection
 * @author: oldj
 * @homepage: https://oldj.net
 */

import * as fs from 'fs'
import lodash from 'lodash'
import * as path from 'path'
import { DataTypeDocument } from '../../typings'
import { asInt } from '../../utils/asType'
import { clone } from '../../utils/clone'
import LatDb from '../db'
import Dict from './dict'
import List from './list'

type FilterPredicate = (item: any) => boolean

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

    // let ts = ((new Date()).getTime() % 1000).toString().padStart(3, '0')
    // return `${index}${ts}`

    return index.toString()
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

  async insert<T>(doc: T): Promise<T & { _id: string }> {
    let _id = await this.makeId()
    let doc2 = { ...doc, _id }
    await this._insert(doc2)
    return doc2
  }

  /**
   * 类似 insert 方法，但不同的是如果传入的 doc 包含 _id 参数，侧会尝试更新对应的文档
   * 如果不存在 _id 参数，或者 _id 对应的文档不存在，则新建
   * 这个方法一般用在 db.loadJSON() 等场景
   */
  async _insert(doc: DataTypeDocument) {
    let _id = doc._id
    await this._ids.push(_id)
    let d = this.getDoc(_id)
    await d.update(doc)
  }

  async all<T>(keys: string | string[] = '*'): Promise<T[]> {
    let data = await Promise.all((await this._ids.all()).map(async _id => {
      let d = this.getDoc(_id)
      let doc: T = await d.toJSON<T>()

      if (Array.isArray(keys)) {
        doc = lodash.pick(doc, keys) as T
      }

      return doc
    }))

    return data as T[]
  }

  async index<T>(index: number, keys: string | string[] = '*'): Promise<T | undefined> {
    let _id = await this._ids.index(index)
    if (!_id) return

    return await this.find<T>(i => i._id === _id, keys)
  }

  async find<T>(predicate: FilterPredicate, keys: string | string[] = '*'): Promise<T | undefined> {
    let _ids = await this._ids.all()

    for (let _id of _ids) {
      let d = this.getDoc(_id)
      let doc: T = await d.toJSON<T>()

      if (predicate(doc)) {
        if (Array.isArray(keys)) {
          doc = lodash.pick(doc, keys) as T
        }

        return doc
      }
    }
  }

  async filter<T>(predicate: FilterPredicate, keys: string | string[] = '*'): Promise<T[]> {
    let _ids = await this._ids.all()
    let list: T[] = []

    for (let _id of _ids) {
      let d = this.getDoc(_id)
      let doc: T = await d.toJSON<T>()

      if (predicate(doc)) {
        if (Array.isArray(keys)) {
          doc = lodash.pick(doc, keys) as T
        }

        list.push(doc)
      }
    }

    return list
  }

  async update<T>(predicate: FilterPredicate, data: T): Promise<T[]> {
    let items = await this.filter<DataTypeDocument>(predicate)
    let out: T[] = []

    for (let item of items) {
      let { _id } = item
      let d = this.getDoc(_id)
      let doc: T = await d.toJSON<T>()

      doc = {
        ...doc,
        ...data,
        _id,
      }

      let i = await d.update<T>(doc)
      out.push(i)
    }

    return out
  }

  async delete(predicate: FilterPredicate) {
    while (true) {
      let item = await this.find<DataTypeDocument>(predicate)
      if (!item) break

      let index = await this._ids.indexOf(item._id)
      if (index === -1) continue

      await this._ids.splice(index, 1)
      let d = this.getDoc(item._id)
      await d.remove()
      delete this._docs[item._id]
    }
  }

  async remove() {
    // remove current collection
    await this._meta.remove()
    await this._ids.remove()
    this._docs = {}
    await fs.promises.rmdir(this._path, { recursive: true })
  }

  @clone
  async _getMeta() {
    return await this._meta.all()
  }

  @clone
  async _setMeta(data: any) {
    let keys = Object.keys(data)
    for (let k of keys) {
      await this._meta.set(k, data[k])
    }
  }
}
