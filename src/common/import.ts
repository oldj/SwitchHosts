import type { IHostsListObject } from './data'

export interface ImportPreview {
  id: string
  name: string
  list: IHostsListObject[]
  contents: Record<string, string>
  existing_list: IHostsListObject[]
  same_title: string[]
  same_content: string[]
}

export function importNodes(list: IHostsListObject[]): IHostsListObject[] {
  return list.flatMap((node) => [node, ...importNodes(node.children || [])])
}

// Selection stores leaves (including empty folders). Parent checkbox states
// are derived so partial selections never accidentally import entire folders.
export function importLeaves(node: IHostsListObject): string[] {
  return node.type === 'folder' && node.children?.length
    ? node.children.flatMap(importLeaves)
    : [node.id]
}

export function importSelectionState(node: IHostsListObject, selected: Set<string>) {
  const leaves = importLeaves(node)
  const count = leaves.filter((id) => selected.has(id)).length
  return { checked: count === leaves.length, indeterminate: count > 0 && count < leaves.length }
}

export function changeImportSelection(
  list: IHostsListObject[],
  selected: Set<string>,
  node: IHostsListObject,
  checked: boolean,
) {
  const next = new Set(selected)
  const nodes = importNodes(list)
  const byId = new Map(nodes.map((item) => [item.id, item]))
  const visited = new Set<string>()
  const add = (item: IHostsListObject) => {
    if (visited.has(item.id)) return
    visited.add(item.id)
    importLeaves(item).forEach((id) => next.add(id))
    if (item.type === 'folder') item.children?.forEach(add)
    if (item.type === 'group')
      item.include?.forEach((id) => {
        const ref = byId.get(id)
        if (ref) add(ref)
      })
  }
  let removedGroups = false
  if (checked) add(node)
  else {
    importLeaves(node).forEach((id) => next.delete(id))
    // Deselect dependants transitively rather than silently reselecting the
    // subtree the user just excluded. The UI explains this adjustment.
    let changed = true
    while (changed) {
      changed = false
      for (const item of nodes) {
        if (item.type !== 'group' || !next.has(item.id)) continue
        if (
          item.include?.some(
            (id) => !byId.has(id) || !importSelectionState(byId.get(id)!, next).checked,
          )
        ) {
          next.delete(item.id)
          changed = true
          removedGroups = true
        }
      }
    }
  }
  return { selected: next, removedGroups }
}

export function importSelectedIds(list: IHostsListObject[], selected: Set<string>): string[] {
  return importNodes(list)
    .filter((node) => importSelectionState(node, selected).checked)
    .map((n) => n.id)
}

export function importCounts(list: IHostsListObject[], selected?: Set<string>) {
  let configurations = 0,
    folders = 0
  for (const node of importNodes(list)) {
    if (selected && !importLeaves(node).some((id) => selected.has(id))) continue
    if (node.type === 'folder') folders++
    else configurations++
  }
  return { configurations, folders }
}

export function importedTree(list: IHostsListObject[], selected: Set<string>): IHostsListObject[] {
  return list.flatMap((node) => {
    if (!importLeaves(node).some((id) => selected.has(id))) return []
    return [
      {
        ...node,
        children: node.type === 'folder' ? importedTree(node.children || [], selected) : undefined,
      },
    ]
  })
}
