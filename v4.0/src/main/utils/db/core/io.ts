/**
 * io
 * @author: oldj
 * @homepage: https://oldj.net
 */

import * as fs from 'fs'
import * as path from 'path'
import { DataTypeDict, DataTypeList, DataTypeSet } from '../typings'
import { ensureDir } from '../utils/fs2'
import wait from '../utils/wait'

type DataType = 'dict' | 'list' | 'set' | 'collection'

interface IIOOptions {
  debug?: boolean;
  data_path: string;
  data_type: DataType;
  dump_delay: number;
  formative?: boolean;
}

export default class IO {
  private options: IIOOptions
  private data_path: string
  private data_type: DataType
  private _dump_delay: number// dump 节流间隔，单位为 ms
  private _last_dump_ts: number = 0
  private _t_dump: any
  private _is_dir_ensured: boolean = false
  private _dump_status: number = 0 // 0: 不需要 dump; 1: 等待或正在 dump

  constructor(options: IIOOptions) {
    this.options = { ...options }
    this.data_path = options.data_path
    this.data_type = options.data_type
    this._dump_delay = options.dump_delay
  }

  private async load_file(fn: string) {
    let d: any
    try {
      let content: string = await fs.promises.readFile(fn, 'utf-8')
      d = JSON.parse(content)
    } catch (e) {
      console.error(e)
    }

    return d
  }

  private async load_dict(): Promise<DataTypeDict> {
    let data: DataTypeDict = {}

    if (!fs.existsSync(this.data_path)) {
      return data
    }

    let d: any = await this.load_file(this.data_path)
    if (typeof d === 'object') {
      data = { ...d }
    }
    // console.log(data)

    return data
  }

  private async load_list(): Promise<DataTypeList> {
    let data: DataTypeList = []

    if (!fs.existsSync(this.data_path)) {
      return data
    }

    let d: any = await this.load_file(this.data_path)
    if (Array.isArray(d)) {
      data = [...d]
    }

    return data
  }

  private async load_set(): Promise<DataTypeSet> {
    let data: DataTypeSet = new Set()

    if (!fs.existsSync(this.data_path)) {
      return data
    }

    let d: any = await this.load_file(this.data_path)
    if (Array.isArray(d)) {
      d.map(v => data.add(v))
    }

    return data
  }

  async load<T>(): Promise<T> {
    let data: any

    if (!this._is_dir_ensured) {
      let dir_path = path.dirname(this.data_path)
      await ensureDir(dir_path)
      this._is_dir_ensured = true
    }

    switch (this.data_type) {
      case 'dict':
        data = await this.load_dict()
        break
      case 'list':
        data = await this.load_list()
        break
      case 'set':
        data = await this.load_set()
        break
    }

    return data
  }

  private async dump_file(data: any, fn: string) {
    if (this.data_type === 'set') {
      data = Array.from(data)
    }

    try {
      let out = this.options.formative ?
        JSON.stringify(data, null, 2) :
        JSON.stringify(data)
      await ensureDir(path.dirname(fn))
      await fs.promises.writeFile(fn, out, 'utf-8')
      if (this.options.debug) {
        console.log(`io.dump_file: -> ${fn}`)
      }
    } catch (e) {
      console.error(e)
    }
  }

  async dump(data: any) {
    this._dump_status = 1
    clearTimeout(this._t_dump)

    let ts = (new Date()).getTime()

    if (ts - this._last_dump_ts < this._dump_delay) {
      this._t_dump = setTimeout(() => this.dump(data), this._dump_delay)
      return
    }

    this._last_dump_ts = ts

    await this.dump_file(data, this.data_path)
    await wait(50)
    this._dump_status = 0
  }

  getDumpStatus() {
    return this._dump_status
  }

  async remove() {
    let fn = this.data_path
    if (!fn || !fs.existsSync(fn)) return

    await fs.promises.unlink(fn)
  }
}
