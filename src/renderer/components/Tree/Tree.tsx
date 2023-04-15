/**
 * Tree
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ITreeNodeData, NodeIdType } from '@common/tree'
import clsx from 'clsx'
import lodash from 'lodash'
import React, { useEffect, useState } from 'react'
import { canBeSelected, flatten, getNodeById, selectTo, treeMoveNode } from './fn'
import Node, { NodeUpdate } from './Node'
import styles from './style.module.scss'

export type DropWhereType = 'before' | 'in' | 'after'
export type MultipleSelectType = 0 | 1 | 2

interface ITreeProps {
  data: ITreeNodeData[]
  className?: string
  nodeClassName?: string
  nodeSelectedClassName?: string
  nodeDropInClassName?: string
  nodeCollapseArrowClassName?: string
  nodeRender?: (node: ITreeNodeData, update: NodeUpdate) => React.ReactElement | null
  nodeAttr?: (node: ITreeNodeData) => Partial<ITreeNodeData>
  draggingNodeRender?: (node: ITreeNodeData, source_ids: string[]) => React.ReactElement
  collapseArrow?: string | React.ReactElement
  onChange?: (tree: ITreeNodeData[]) => void
  indent_px?: number
  selected_ids: NodeIdType[]
  onSelect?: (ids: NodeIdType[]) => void
  no_child_no_indent?: boolean
  allowed_multiple_selection?: boolean
}

const Tree = (props: ITreeProps) => {
  const { data, className, onChange, allowed_multiple_selection } = props
  const [tree, setTree] = useState<ITreeNodeData[]>([])
  const [is_dragging, setIsDragging] = useState(false)
  const [drag_source_id, setDragSourceId] = useState<NodeIdType | null>(null)
  const [drop_target_id, setDropTargetId] = useState<NodeIdType | null>(null)
  const [selected_ids, setSelectedIds] = useState<NodeIdType[]>(props.selected_ids || [])
  const [drop_where, setDropWhere] = useState<DropWhereType | null>(null)

  useEffect(() => {
    setTree(lodash.cloneDeep(data))
  }, [data])

  useEffect(() => {
    if (props.selected_ids && props.selected_ids.join(',') !== selected_ids.join(',')) {
      setSelectedIds(props.selected_ids)
    }
  }, [props.selected_ids])

  const onDragStart = (id: NodeIdType) => {
    // console.log('onDragStart...')
    setIsDragging(true)
    setDragSourceId(id)
    setDropTargetId(null)
    setDropWhere(null)
  }

  const onDragEnd = () => {
    // console.log(`onDragEnd, ${is_dragging}`)
    if (!is_dragging) return

    if (drag_source_id && drop_target_id && drop_where) {
      // console.log(`onDragEnd: ${source_id} -> ${target_id} | ${drop_where}`)
      let source_ids: string[]
      if (selected_ids.includes(drag_source_id)) {
        source_ids = selected_ids
      } else {
        source_ids = [drag_source_id]
      }
      let tree2 = treeMoveNode(tree, source_ids, drop_target_id, drop_where)
      if (tree2) {
        setTree(tree2)
        onTreeChange(tree2)
      }
    }

    setIsDragging(false)
    setDragSourceId(null)
    setDropTargetId(null)
    setDropWhere(null)
  }

  const onTreeChange = (tree: ITreeNodeData[]) => {
    // console.log('onTreeChange...')
    onChange && onChange(tree)
  }

  const onNodeChange = (id: NodeIdType, data: Partial<ITreeNodeData>) => {
    let tree2 = lodash.cloneDeep(tree)
    let node = getNodeById(tree2, id)
    if (!node) return

    Object.assign(node, data)
    setTree(tree2)
    onTreeChange(tree2)
  }

  const onSelectOne = (id: NodeIdType, multiple_type: MultipleSelectType = 0) => {
    // console.log('multiple_type:', multiple_type, 'ids:', selected_ids, 'id:', id)
    const { onSelect } = props
    let new_selected_ids: NodeIdType[] = []

    if (!allowed_multiple_selection) {
      multiple_type = 0
    }

    if (multiple_type === 0) {
      new_selected_ids = [id]
    } else if (multiple_type === 1) {
      // 按住 cmd/ctrl 多选
      if (!canBeSelected(tree, selected_ids, id)) {
        return
      }
      if (selected_ids.includes(id)) {
        new_selected_ids = selected_ids.filter((i) => i !== id)
      } else {
        new_selected_ids = [...selected_ids, id]
      }
    } else if (multiple_type === 2) {
      // 按住 shift 多选
      new_selected_ids = selectTo(tree, selected_ids, id)
    }

    setSelectedIds(new_selected_ids)
    onSelect && onSelect(new_selected_ids)
  }

  const has_no_child = flatten(tree).length === tree.length

  return (
    <div className={clsx(styles.root, className)} onDrop={onDragEnd}>
      {tree.map((node) => {
        return (
          <Node
            key={node.id}
            tree={tree}
            data={node}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            setDropTargetId={setDropTargetId}
            setDropWhere={setDropWhere}
            drag_source_id={drag_source_id}
            drop_target_id={drop_target_id}
            drag_target_where={drop_where}
            is_dragging={is_dragging}
            level={0}
            render={props.nodeRender}
            draggingNodeRender={props.draggingNodeRender}
            collapseArrow={props.collapseArrow}
            onChange={onNodeChange}
            indent_px={props.indent_px}
            selected_ids={selected_ids}
            onSelect={onSelectOne}
            nodeAttr={props.nodeAttr}
            nodeClassName={props.nodeClassName}
            nodeDropInClassName={props.nodeDropInClassName}
            nodeSelectedClassName={props.nodeSelectedClassName}
            nodeCollapseArrowClassName={props.nodeCollapseArrowClassName}
            has_no_child={has_no_child}
            no_child_no_indent={props.no_child_no_indent}
            allowed_multiple_selection={allowed_multiple_selection}
          />
        )
      })}
    </div>
  )
}

export default Tree
