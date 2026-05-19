/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ITreeNodeData, NodeIdType } from '@common/tree'
import clsx from 'clsx'
import lodash from 'lodash'
import React, { useEffect, useRef, useState } from 'react'
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
  dragSourceId: NodeIdType | null
  dropTargetId: NodeIdType | null
  dragTargetWhere: DropWhereType | null
  onDragStart: (id: NodeIdType) => void
  onDragEnd: () => void
  setDropTargetId: (id: NodeIdType | null) => void
  setDropWhere: (where: DropWhereType | null) => void
  selectedIds: NodeIdType[]
  onSelect: (id: NodeIdType, multipleType?: MultipleSelectType) => void
  level: number
  isDragging: boolean
  render?: (data: ITreeNodeData, update: NodeUpdate) => React.ReactElement | null
  draggingNodeRender?: (data: ITreeNodeData, sourceIds: string[]) => React.ReactElement
  collapseArrow?: string | React.ReactElement
  onChange: (id: NodeIdType, data: Partial<ITreeNodeData>) => void
  indentPx?: number
  nodeAttr?: (node: ITreeNodeData) => Partial<ITreeNodeData>
  hasNoChild: boolean
  noChildNoIndent?: boolean
  allowedMultipleSelection?: boolean
}

const Node = (props: INodeProps) => {
  const {
    data,
    setDropTargetId,
    setDropWhere,
    dragSourceId,
    dropTargetId,
    dragTargetWhere,
    level,
    isDragging,
    render,
    draggingNodeRender,
    indentPx,
    selectedIds,
    onSelect,
    onChange,
    nodeAttr,
    nodeClassName,
    nodeCollapseArrowClassName,
  } = props

  const elNode = useRef<HTMLDivElement>(null)
  const elDragging = useRef<HTMLDivElement>(null)

  // JS-tracked hover instead of CSS :hover because WebKit leaves
  // :hover stuck on rows the cursor passed over during a drag — the
  // state doesn't even clear when React replaces the DOM.
  const [isHovered, setIsHovered] = useState(false)

  // Clear hover at every isDragging boundary so a row that was
  // under the cursor when drag began doesn't stay highlighted, and
  // any state accumulated mid-drag is dropped on dragend.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stuck hover at every drag boundary (WebKit bug)
    setIsHovered(false)
  }, [isDragging])

  const attr = nodeAttr ? nodeAttr(data) : data

  const makeDraggingElement = (ne: DragEvent) => {
    const el = elDragging.current
    if (!el) return

    el.style.display = 'block'
    ne.dataTransfer?.setDragImage(el, -4, -4)
  }

  const onDragStart = (e: React.DragEvent) => {
    const ne = e.nativeEvent
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

    if (!isDragging || !dragSourceId) return

    const elTarget = e.target as HTMLElement
    if (!elTarget) return

    if (data.id === dragSourceId) return
    if (isChildOf(props.tree, data.id, dragSourceId)) return

    setDropTargetId(data.id)

    const now = new Date().getTime()
    if (window._t_dragover_id !== data.id) {
      window._t_dragover_id = data.id
      window._t_dragover_ts = now
    }
    if (data.children?.length && data.is_collapsed && now - window._t_dragover_ts > 1000) {
      props.onChange(data.id, { is_collapsed: false })
    }

    // where
    const ne = e.nativeEvent
    const h = elTarget.offsetHeight
    const y = ne.offsetY
    let where: DropWhereType
    const h2 = h >> 1
    const h4 = h >> 2
    const hThreshold = attr.can_drop_in === false ? h2 : h4
    if (y <= hThreshold) {
      if (attr.can_drop_before === false) {
        setDropWhere(null)
        return
      }
      where = 'before'
    } else if (y >= h - hThreshold) {
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

    if (elDragging.current) elDragging.current.style.display = 'none'
  }

  const onUpdate = (kv: Partial<ITreeNodeData>) => {
    onChange(data.id, kv)
  }

  const isDragSource = dragSourceId === data.id
  const isDropTarget = dropTargetId === data.id
  const isSelected = selectedIds.includes(data.id)
  const isParentIsDragSource = dragSourceId
    ? isChildOf(props.tree, data.id, dragSourceId)
    : false
  const hasChildren = Array.isArray(data.children) && data.children.length > 0

  return (
    <>
      <div
        ref={elNode}
        className={clsx(
          styles.node,
          isDragging && styles.isDragging,
          (isDragSource || isParentIsDragSource) && styles.is_source,
          isDropTarget && dragTargetWhere === 'before' && styles.drop_before,
          isDropTarget &&
            dragTargetWhere === 'in' &&
            (props.nodeDropInClassName || styles.drop_in),
          isDropTarget && dragTargetWhere === 'after' && styles.drop_after,
          isSelected && (props.nodeSelectedClassName || styles.selected),
          nodeClassName,
        )}
        data-selected={isSelected ? '1' : '0'}
        data-hovered={isHovered ? '1' : '0'}
        data-id={data.id}
        draggable={attr.can_drag !== false}
        onMouseEnter={() => {
          if (!isDragging) setIsHovered(true)
        }}
        onMouseLeave={() => setIsHovered(false)}
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
          let multipleType: MultipleSelectType = 0
          if (e.shiftKey) {
            multipleType = 2
          } else if (e.metaKey) {
            multipleType = 1
          }
          onSelect(data.id, multipleType)
        }}
        style={{
          paddingLeft: level * (indentPx || 20) + 4,
        }}
      >
        <div
          className={clsx(
            styles.content,
            props.hasNoChild && props.noChildNoIndent && styles.no_children,
          )}
        >
          <div className={styles.ln_header} data-role="tree-node-header">
            {hasChildren ? (
              <div
                className={clsx(
                  styles.arrow,
                  nodeCollapseArrowClassName,
                  data.is_collapsed && styles.collapsed,
                )}
                data-collapsed={!!data.is_collapsed}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
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
        <div ref={elDragging} className={styles.for_dragging}>
          {draggingNodeRender(data, selectedIds.includes(data.id) ? selectedIds : [data.id])}
        </div>
      )}
      {hasChildren && data.children && !data.is_collapsed
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
  const { data, selectedIds, allowedMultipleSelection } = nextProps

  if (!lodash.isEqual(prevProps.data, data)) {
    return false
  }

  // select
  const prevSelectedIds = prevProps.selectedIds

  const diffIds = diff<NodeIdType>(prevSelectedIds, selectedIds)
  if (diffIds.length > 0) {
    if (allowedMultipleSelection) {
      return false
    } else {
      for (const id of diffIds) {
        if (isSelfOrChild(data, id)) {
          return false
        }
      }
    }
  }

  // drag
  if (prevProps.isDragging !== nextProps.isDragging) {
    return false
  }

  const { dragSourceId, dropTargetId } = nextProps
  if (
    isSelfOrChild(data, dragSourceId) ||
    isSelfOrChild(data, dropTargetId) ||
    isSelfOrChild(data, prevProps.dragSourceId) ||
    isSelfOrChild(data, prevProps.dropTargetId)
  ) {
    return false
  }

  return true
}

export default React.memo(Node, isEqual)
