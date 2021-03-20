/**
 * set
 * @author: oldj
 * @homepage: https://oldj.net
 */

import * as path from 'path'
import { DataTypeSet, DataTypeSetItem, IBasicOptions } from '../../typings'
import { clone } from '../../utils/clone'
import IO from '../io'

interface Options extends IBasicOptions {
}

export default class LatSet {
  private _data: DataTypeSet | null = null
  private _io: IO
  private _path: string
  name: string

  constructor(name: string, root_dir: string, options: Options) {
    this._path = path.join(root_dir, name + '.json')
    this.name = name
    this._io = new IO({
      data_type: 'set',
      data_path: this._path,
      debug: options.debug,
      dump_delay: options.dump_delay,
    })
  }

  private async ensure(): Promise<DataTypeSet> {
    if (this._data === null) {
      this._data = await this._io.load<DataTypeSet>()
    }

    return this._data
  }

  private dump() {
    if (this._data === null) return
    this._io.dump(Array.from(this._data))
      .catch(e => console.error(e))
  }

  async add(value: DataTypeSetItem) {
    this._data = await this.ensure()
    this._data.add(value)
    this.dump()
  }

  async delete(value: DataTypeSetItem) {
    this._data = await this.ensure()
    this._data.delete(value)
    this.dump()
  }

  async has(value: DataTypeSetItem): Promise<boolean> {
    this._data = await this.ensure()
    return this._data.has(value)
  }

  async all(): Promise<DataTypeSetItem[]> {
    this._data = await this.ensure()
    return Array.from(this._data)
  }

  async clear() {
    this._data = new Set()
    this.dump()
  }

  @clone
  async set(data: any[]) {
    let s = new Set<DataTypeSetItem>()
    data.map(i => s.add(i))
    this._data = s
    this.dump()
  }

  async remove() {
    this._data = new Set()
    await this._io.remove()
  }

  async update(data: DataTypeSetItem[]) {
    this._data = new Set(data)
    this.dump()
  }
}
