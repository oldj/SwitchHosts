/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ITreeNodeData, NodeIdType } from '@common/tree'
import clsx from 'clsx'
import lodash from 'lodash'
import React, { useCallback, useEffect, useRef, useState } from 'react'
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
  draggingNodeRender?: (node: ITreeNodeData, sourceIds: string[]) => React.ReactElement
  collapseArrow?: string | React.ReactElement
  onChange?: (tree: ITreeNodeData[]) => void
  indentPx?: number
  selectedIds: NodeIdType[]
  onSelect?: (ids: NodeIdType[]) => void
  noChildNoIndent?: boolean
  allowedMultipleSelection?: boolean
}

const Tree = (props: ITreeProps) => {
  const { data, className, onChange, allowedMultipleSelection } = props
  const [tree, setTree] = useState<ITreeNodeData[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [dragSourceId, setDragSourceId] = useState<NodeIdType | null>(null)
  const [dropTargetId, setDropTargetId] = useState<NodeIdType | null>(null)
  const [selectedIds, setSelectedIds] = useState<NodeIdType[]>(props.selectedIds || [])
  const [dropWhere, setDropWhere] = useState<DropWhereType | null>(null)

  // Stable refs so onNodeChange (memoized with []) always reads the
  // latest tree and onChange, avoiding the React.memo stale-closure
  // bug where a node whose data didn't change keeps an old handler
  // whose captured tree lacks collapse states from sibling operations.
  const treeRef = useRef(tree)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    treeRef.current = tree
    onChangeRef.current = onChange
  })

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- local working copy; mutated mid-drag and reset when source data changes
    setTree(lodash.cloneDeep(data))
  }, [data])

  useEffect(() => {
    if (props.selectedIds && props.selectedIds.join(',') !== selectedIds.join(',')) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync external selection into local state
      setSelectedIds(props.selectedIds)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.selectedIds])

  const onDragStart = (id: NodeIdType) => {
    // console.log('onDragStart...')
    setIsDragging(true)
    setDragSourceId(id)
    setDropTargetId(null)
    setDropWhere(null)
  }

  const onDragEnd = () => {
    // console.log(`onDragEnd, ${isDragging}`)
    if (!isDragging) return

    if (dragSourceId && dropTargetId && dropWhere) {
      // console.log(`onDragEnd: ${source_id} -> ${target_id} | ${dropWhere}`)
      let sourceIds: string[]
      if (selectedIds.includes(dragSourceId)) {
        sourceIds = selectedIds
      } else {
        sourceIds = [dragSourceId]
      }
      const tree2 = treeMoveNode(tree, sourceIds, dropTargetId, dropWhere)
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
    if (onChange) onChange(tree)
  }

  const onNodeChange = useCallback((id: NodeIdType, data: Partial<ITreeNodeData>) => {
    const tree2 = lodash.cloneDeep(treeRef.current)
    const node = getNodeById(tree2, id)
    if (!node) return

    Object.assign(node, data)
    setTree(tree2)
    onChangeRef.current?.(tree2)
  }, [])

  const onSelectOne = (id: NodeIdType, multipleType: MultipleSelectType = 0) => {
    // console.log('multipleType:', multipleType, 'ids:', selectedIds, 'id:', id)
    const { onSelect } = props
    let newSelectedIds: NodeIdType[] = []

    if (!allowedMultipleSelection) {
      multipleType = 0
    }

    if (multipleType === 0) {
      newSelectedIds = [id]
    } else if (multipleType === 1) {
      // 按住 cmd/ctrl 多选
      if (!canBeSelected(tree, selectedIds, id)) {
        return
      }
      if (selectedIds.includes(id)) {
        newSelectedIds = selectedIds.filter((i) => i !== id)
      } else {
        newSelectedIds = [...selectedIds, id]
      }
    } else if (multipleType === 2) {
      // 按住 shift 多选
      newSelectedIds = selectTo(tree, selectedIds, id)
    }

    setSelectedIds(newSelectedIds)
    if (onSelect) onSelect(newSelectedIds)
  }

  const hasNoChild = flatten(tree).length === tree.length

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
            dragSourceId={dragSourceId}
            dropTargetId={dropTargetId}
            dragTargetWhere={dropWhere}
            isDragging={isDragging}
            level={0}
            render={props.nodeRender}
            draggingNodeRender={props.draggingNodeRender}
            collapseArrow={props.collapseArrow}
            onChange={onNodeChange}
            indentPx={props.indentPx}
            selectedIds={selectedIds}
            onSelect={onSelectOne}
            nodeAttr={props.nodeAttr}
            nodeClassName={props.nodeClassName}
            nodeDropInClassName={props.nodeDropInClassName}
            nodeSelectedClassName={props.nodeSelectedClassName}
            nodeCollapseArrowClassName={props.nodeCollapseArrowClassName}
            hasNoChild={hasNoChild}
            noChildNoIndent={props.noChildNoIndent}
            allowedMultipleSelection={allowedMultipleSelection}
          />
        )
      })}
    </div>
  )
}

export default Tree
