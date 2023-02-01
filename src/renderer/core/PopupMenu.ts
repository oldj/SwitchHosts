/**
 * ContextMenu
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { agent } from '@renderer/core/agent'
import { IMenuItemOption } from '@common/types'

let _idx: number = 0

type OffFunction = () => void

export class PopupMenu {
  private _id: string
  private _items: IMenuItemOption[]
  private _offs: any[] = []

  constructor(menu_items: IMenuItemOption[]) {
    this._id = `popup_menu_${Math.floor(Math.random() * 1e8)}`
    this._items = menu_items
  }

  show() {
    // console.log('show')
    this.onHide()

    let items = this._items.map((i) => {
      let d = { ...i }

      if (typeof d.click === 'function') {
        const r = Math.floor(Math.random() * 1e8)
        const evt = `popup_menu_item_${_idx++}_${r}`
        let off = agent.once(evt, d.click)
        this._offs.push(off)
        d._click_evt = evt
        delete d.click
      }

      return d
    })

    agent.popupMenu({
      menu_id: this._id,
      items,
    })
    ;((offs: OffFunction[]) => {
      agent.once(`popup_menu_close:${this._id}`, () => {
        // console.log(`on popup_menu_close:${this._id}`)
        setTimeout(() => {
          offs.map((o) => o())
        }, 100)
      })
    })(this._offs)
  }

  private onHide() {
    // console.log('hide...')
    this._offs.map((o) => o())
    this._offs = []
  }
}
