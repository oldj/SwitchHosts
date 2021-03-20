/**
 * list
 * @author: oldj
 * @homepage: https://oldj.net
 */

import * as path from 'path'
import { DataTypeList, IBasicOptions } from '../../typings'
import { clone } from '../../utils/clone'
import IO from '../io'

interface Options extends IBasicOptions {
}

type FilterPredicate = (item: any) => boolean
type MapFunction = (item: any) => any

export default class List {
  private _data: DataTypeList | null = null
  private _io: IO
  private _path: string
  name: string

  constructor(name: string, root_dir: string, options: Options) {
    this._path = path.join(root_dir, name + '.json')
    this.name = name
    this._io = new IO({
      data_type: 'list',
      data_path: this._path,
      debug: options.debug,
      dump_delay: options.dump_delay,
    })
  }

  private async ensure(): Promise<DataTypeList> {
    if (this._data === null) {
      this._data = await this._io.load<DataTypeList>()
    }

    return this._data
  }

  private dump() {
    if (this._data === null) return
    this._io.dump([...this._data])
      .catch(e => console.error(e))
  }

  @clone
  async rpush(value: any) {
    this._data = await this.ensure()
    this._data.push(value)
    this.dump()
  }

  @clone
  async rpop(): Promise<any> {
    this._data = await this.ensure()
    let v = this._data.pop()
    this.dump()

    return v
  }

  @clone
  async rextend(...values: any[]) {
    this._data = await this.ensure()
    this._data = [...this._data, ...values]
    this.dump()
  }

  @clone
  async lpush(value: any) {
    this._data = await this.ensure()
    this._data.unshift(value)
    this.dump()
  }

  @clone
  async lpop(): Promise<any> {
    this._data = await this.ensure()
    let v = this._data.shift()
    this.dump()

    return v
  }

  @clone
  async lextend(...values: any[]) {
    this._data = await this.ensure()
    this._data = [...values, ...this._data]
    this.dump()
  }

  async push(value: any) {
    await this.rpush(value)
  }

  async pop(): Promise<any> {
    return await this.rpop()
  }

  async extend(...values: any[]) {
    await this.rextend(...values)
  }

  @clone
  async all(): Promise<any[]> {
    return await this.ensure()
  }

  @clone
  async find(predicate: FilterPredicate): Promise<any | undefined> {
    this._data = await this.ensure()
    return this._data.find(predicate)
  }

  @clone
  async filter(predicate: FilterPredicate): Promise<any[]> {
    this._data = await this.ensure()
    return this._data.filter(predicate)
  }

  @clone
  async map(predicate: MapFunction): Promise<any[]> {
    this._data = await this.ensure()
    return this._data.map(predicate)
  }

  @clone
  async index(index: number): Promise<any | undefined> {
    this._data = await this.ensure()

    if (index < 0) {
      let idx = Math.abs(index)
      let length = this._data.length
      if (length < idx) {
        return undefined
      }

      index = length - idx
    }

    return this._data[index]
  }

  async indexOf(predicate: string | number | boolean | null | FilterPredicate): Promise<number> {
    this._data = await this.ensure()

    if (typeof predicate === 'function') {
      for (let i = 0; i < this._data.length; i++) {
        if (predicate(this._data[i])) {
          return i
        }
      }
      return -1
    } else {
      return this._data.indexOf(predicate)
    }
  }

  @clone
  async slice(start: number, end?: number): Promise<any[]> {
    this._data = await this.ensure()
    let args = [start]
    if (typeof end === 'number') {
      args.push(end)
    }
    return this._data.slice(...args)
  }

  @clone
  async splice(start: number, delete_count: number, ...insert_items: any[]): Promise<any[]> {
    this._data = await this.ensure()
    let v = this._data.splice(start, delete_count, ...insert_items)
    this.dump()
    return v
  }

  @clone
  async delete(predicate: FilterPredicate): Promise<any[]> {
    this._data = await this.filter(i => !predicate(i))
    this.dump()

    return this._data
  }

  @clone
  async set(data: any[]) {
    this._data = data
    this.dump()
  }

  async clear() {
    this._data = []
    this.dump()
  }

  async remove() {
    this._data = []
    await this._io.remove()
  }

  async update(data: any[]) {
    this._data = data
    this.dump()
  }
}
