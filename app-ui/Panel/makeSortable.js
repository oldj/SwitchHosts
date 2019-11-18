/**
 * sort
 * @author: oldj
 * @homepage: https://oldj.net
 */

import Sortable from 'sortablejs'
import lodash from 'lodash'
import styles from './List.less'
import Agent from '../Agent'

export default function (el) {
  let source_id
  let target_id
  let where_to

  function getId (el, is_child = false) {
    if (!el || el.tagName !== 'DIV') {
      return [null, is_child]
    }

    if (!el.className.includes('list-item')) {
      return getId(el.parentNode, true)
    }

    return [el.getAttribute('data-id'), is_child]
  }

  Sortable.create(el, {
    group: 'list-sorting',
    sort: true,
    ghostClass: styles['sort-bg'],
    animation: 150,
    onStart: (e) => {
      //console.log(e)
      source_id = getId(e.item)[0]
      Agent.emit('drag_start')
    },
    onMove: lodash.debounce((e) => {
      //console.log(e.related, e.willInsertAfter)
      let is_child
      [target_id, is_child] = getId(e.related)
      if (is_child) {
        where_to = 'in'
      } else {
        where_to = e.willInsertAfter ? 'after' : 'before'
      }
      Agent.emit('drag_move', target_id, where_to)

      return false
    }, 200),
    onEnd: (e) => {
      //console.log(e.newIndex)
      console.log(source_id, target_id, where_to)
      //onSort: () => {
      //  this.getCurrentListFromDOM()
      //  Agent.emit('drag_end')
      Agent.emit('drag_done', {source_id, target_id, where_to})
    }
  })
}
