/**
 * Node
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ITreeNodeData, NodeIdType } from '@common/tree'
import clsx from 'clsx'
import lodash from 'lodash'
import React, { useRef } from 'react'
import { isChildOf, isSelfOrChild } from './fn'
import styles from './style.module.scss'
import { DropWhereType, MultipleSelectType } from './Tree'

declare global {
  interface Window {
    _t_dragover_id?: string
    _t_dragover_ts: number
  }
}

export type NodeUpdate = (data: Partial<ITreeNodeData>) => void

interface INodeProps {
  tree: ITreeNodeData[]
  data: ITreeNodeData
  nodeClassName?: string
  nodeDropInClassName?: string
  nodeSelectedClassName?: string
  nodeCollapseArrowClassName?: string
  drag_source_id: NodeIdType | null
  drop_target_id: NodeIdType | null
  drag_target_where: DropWhereType | null
  onDragStart: (id: NodeIdType) => void
  onDragEnd: () => void
  setDropTargetId: (id: NodeIdType | null) => void
  setDropWhere: (where: DropWhereType | null) => void
  selected_ids: NodeIdType[]
  onSelect: (id: NodeIdType, multiple_type?: MultipleSelectType) => void
  level: number
  is_dragging: boolean
  render?: (data: ITreeNodeData, update: NodeUpdate) => React.ReactElement | null
  draggingNodeRender?: (data: ITreeNodeData, source_ids: string[]) => React.ReactElement
  collapseArrow?: string | React.ReactElement
  onChange: (id: NodeIdType, data: Partial<ITreeNodeData>) => void
  indent_px?: number
  nodeAttr?: (node: ITreeNodeData) => Partial<ITreeNodeData>
  has_no_child: boolean
  no_child_no_indent?: boolean
  allowed_multiple_selection?: boolean
}

const Node = (props: INodeProps) => {
  const {
    data,
    setDropTargetId,
    setDropWhere,
    drag_source_id,
    drop_target_id,
    drag_target_where,
    level,
    is_dragging,
    render,
    draggingNodeRender,
    indent_px,
    selected_ids,
    onSelect,
    onChange,
    nodeAttr,
    nodeClassName,
    nodeCollapseArrowClassName,
  } = props

  const el_node = useRef<HTMLDivElement>(null)
  const el_dragging = useRef<HTMLDivElement>(null)

  const attr = nodeAttr ? nodeAttr(data) : data

  const getTargetId = (el: HTMLElement | null): string | undefined => {
    if (!el) return
    let id = el.getAttribute('data-id')
    return id || getTargetId(el.parentNode as HTMLElement)
  }

  const makeDraggingElement = (ne: DragEvent) => {
    let el = el_dragging.current
    if (!el) return

    el.style.display = 'block'
    ne.dataTransfer?.setDragImage(el, -4, -4)
  }

  const onDragStart = (e: React.DragEvent) => {
    let ne = e.nativeEvent
    if (ne.dataTransfer) {
      ne.dataTransfer.dropEffect = 'move'
      ne.dataTransfer.effectAllowed = 'move'
      // ne.dataTransfer.setData('text', data.id)
      // makeDraggingElement(ne)

      if (draggingNodeRender) {
        makeDraggingElement(ne)
      }
    }

    props.onDragStart(data.id)
  }

  // const onDragEnter = (e: React.DragEvent) => {
  //   console.log(`enter: ` + data.id)
  // }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!is_dragging || !drag_source_id) return

    let el_target = e.target as HTMLElement
    if (!el_target) return

    if (data.id === drag_source_id) return
    if (isChildOf(props.tree, data.id, drag_source_id)) return

    setDropTargetId(data.id)

    let now = new Date().getTime()
    if (window._t_dragover_id !== data.id) {
      window._t_dragover_id = data.id
      window._t_dragover_ts = now
    }
    if (data.children?.length && data.is_collapsed && now - window._t_dragover_ts > 1000) {
      props.onChange(data.id, { is_collapsed: false })
    }

    // where
    let ne = e.nativeEvent
    let h = el_target.offsetHeight
    let y = ne.offsetY
    let where: DropWhereType | null = null
    let h_2 = h >> 1
    let h_4 = h >> 2
    let h_threshold = attr.can_drop_in === false ? h_2 : h_4
    if (y <= h_threshold) {
      if (attr.can_drop_before === false) {
        setDropWhere(null)
        return
      }
      where = 'before'
    } else if (y >= h - h_threshold) {
      if (attr.can_drop_after === false) {
        setDropWhere(null)
        return
      }
      where = 'after'
    } else {
      if (attr.can_drop_in === false) {
        setDropWhere(null)
        return
      }
      where = 'in'
    }
    setDropWhere(where)
  }

  // const onDragLeave = (e: React.DragEvent) => {
  //   console.log(`leave: ` + data.id)
  // }

  const onDragEnd = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // console.log('onDragEnd.')
    props.onDragEnd()

    window._t_dragover_id = ''

    el_dragging.current && (el_dragging.current.style.display = 'none')
  }

  const onUpdate = (kv: Partial<ITreeNodeData>) => {
    onChange(data.id, kv)
  }

  const is_drag_source = drag_source_id === data.id
  const is_drop_target = drop_target_id === data.id
  const is_selected = selected_ids.includes(data.id)
  const is_parent_is_drag_source = drag_source_id
    ? isChildOf(props.tree, data.id, drag_source_id)
    : false
  const has_children = Array.isArray(data.children) && data.children.length > 0

  return (
    <>
      <div
        ref={el_node}
        className={clsx(
          styles.node,
          is_dragging && styles.is_dragging,
          (is_drag_source || is_parent_is_drag_source) && styles.is_source,
          is_drop_target && drag_target_where === 'before' && styles.drop_before,
          is_drop_target &&
            drag_target_where === 'in' &&
            (props.nodeDropInClassName || styles.drop_in),
          is_drop_target && drag_target_where === 'after' && styles.drop_after,
          is_selected && (props.nodeSelectedClassName || styles.selected),
          nodeClassName,
        )}
        data-selected={is_selected ? '1' : '0'}
        data-id={data.id}
        draggable={attr.can_drag !== false}
        onDragStart={onDragStart}
        // onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        // onDragLeave={onDragLeave}
        onDragEnd={onDragEnd}
        onDrop={onDragEnd}
        onClick={(e) => {
          if (attr.can_select === false) {
            return
          }
          let multiple_type: MultipleSelectType = 0
          if (e.shiftKey) {
            multiple_type = 2
          } else if (e.metaKey) {
            multiple_type = 1
          }
          onSelect(data.id, multiple_type)
        }}
        style={{
          paddingLeft: level * (indent_px || 20) + 4,
        }}
      >
        <div
          className={clsx(
            styles.content,
            props.has_no_child && props.no_child_no_indent && styles.no_children,
          )}
        >
          <div className={styles.ln_header} data-role="tree-node-header">
            {has_children ? (
              <div
                className={clsx(
                  styles.arrow,
                  nodeCollapseArrowClassName,
                  data.is_collapsed && styles.collapsed,
                )}
                data-collapsed={!!data.is_collapsed}
                onClick={() => {
                  props.onChange(data.id, { is_collapsed: !data.is_collapsed })
                }}
              >
                {props.collapseArrow ? props.collapseArrow : '>'}
              </div>
            ) : null}
          </div>
          <div className={styles.ln_body} data-role="tree-node-body">
            {render ? render(data, onUpdate) : data.title || `node#${data.id}`}
          </div>
        </div>
      </div>
      {draggingNodeRender && (
        <div ref={el_dragging} className={styles.for_dragging}>
          {draggingNodeRender(data, selected_ids.includes(data.id) ? selected_ids : [data.id])}
        </div>
      )}
      {has_children && data.children && !data.is_collapsed
        ? data.children.map((node) => (
            <Node {...props} key={node.id} data={node} level={level + 1} />
          ))
        : null}
    </>
  )
}

function diff<T>(a: T[], b: T[]): T[] {
  return [...a.filter((i) => !b.includes(i)), ...b.filter((i) => !a.includes(i))]
}

function isEqual(prevProps: INodeProps, nextProps: INodeProps): boolean {
  let { data, selected_ids, allowed_multiple_selection } = nextProps

  if (!lodash.isEqual(prevProps.data, data)) {
    return false
  }

  // select
  let prev_selected_ids = prevProps.selected_ids

  let diff_ids = diff<NodeIdType>(prev_selected_ids, selected_ids)
  if (diff_ids.length > 0) {
    if (allowed_multiple_selection) {
      return false
    } else {
      for (let id of diff_ids) {
        if (isSelfOrChild(data, id)) {
          return false
        }
      }
    }
  }

  // drag
  if (prevProps.is_dragging !== nextProps.is_dragging) {
    return false
  }

  let { drag_source_id, drop_target_id } = nextProps
  if (
    isSelfOrChild(data, drag_source_id) ||
    isSelfOrChild(data, drop_target_id) ||
    isSelfOrChild(data, prevProps.drag_source_id) ||
    isSelfOrChild(data, prevProps.drop_target_id)
  ) {
    return false
  }

  return true
}

export default React.memo(Node, isEqual)
