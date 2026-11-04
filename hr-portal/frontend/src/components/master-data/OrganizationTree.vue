<template>
  <UiTable
    :columns="columns"
    :rows="rows"
    :row-key="rowKeyOf"
    aria-label="组织架构"
  >
    <template #cell="{ row, column }">
      <div
        v-if="column.key === 'name'"
        class="org-table__name"
        :style="{ paddingLeft: `calc(var(--ui-table-cell-padding-inline) + ${(row.depth - 1) * 1} * var(--ui-tree-indent))` }"
      >
        <button
          v-if="row.children?.length"
          class="org-table__expand"
          type="button"
          :aria-label="`${isExpanded(row) ? '收起' : '展开'}${row.name}`"
          @click="toggleExpand(row)"
        >
          <svg :class="{ 'is-collapsed': !isExpanded(row) }" width="12" height="12" viewBox="0 0 24 24" fill="none" data-icon="ExpandDownFilled" aria-hidden="true">
            <path d="M11.22 18.46a1 1 0 0 0 1.56 0l8.305-10.334a1 1 0 0 0-.78-1.626H3.696a1 1 0 0 0-.78 1.626L11.22 18.46Z" fill="currentColor" />
          </svg>
        </button>
        <span v-else class="org-table__expand org-table__expand--placeholder" aria-hidden="true"></span>
        <span class="org-table__label" :title="row.name">{{ row.name }}</span>
        <el-tag v-if="!row.is_active" type="info" size="small" class="org-table__inactive">停用</el-tag>
      </div>
      <span v-else-if="column.key === 'action'" class="org-table__action-placeholder">--</span>
      <template v-else>{{ (row as Row)[column.key as keyof Row] ?? '--' }}</template>
    </template>
  </UiTable>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TreeNode } from '@/api/data'
import UiTable, { type UiTableColumn } from '@/components/ui/UiTable.vue'

type Row = Omit<TreeNode, 'children'> & {
  depth: number
  children?: Row[]
  manager?: string
  hrbp?: string
  employee_count?: number
  updated_by?: string
  updated_at?: string
  __searchMatch?: boolean
  __hasSearchDescendant?: boolean
}

const props = withDefaults(defineProps<{ nodes: TreeNode[]; searching?: boolean }>(), { searching: false })

const expandedKeys = ref<Set<string>>(new Set())

const columns: UiTableColumn[] = [
  { key: 'name', label: '名称', width: 220, fixed: 'left' },
  { key: 'manager', label: '部门负责人', minWidth: 150 },
  { key: 'hrbp', label: '部门 HRBP', minWidth: 150 },
  { key: 'employee_count', label: '人数', minWidth: 100 },
  { key: 'updated_by', label: '更新人', minWidth: 150 },
  { key: 'updated_at', label: '更新时间', minWidth: 150 },
  { key: 'action', label: '操作', width: 194, fixed: 'right' },
]

const rowKeyOf = (row: Row) => String(row.id)

function assignDepth(nodes: TreeNode[], depth: number): Row[] {
  return nodes.map(node => ({
    ...node,
    depth,
    children: node.children?.length ? assignDepth(node.children, depth + 1) : undefined,
  }))
}

const rows = computed<Row[]>(() => {
  const visible: Row[] = []
  const walk = (list: Row[], expanded: Set<string>) => {
    for (const node of list) {
      visible.push(node)
      if (node.children?.length && expanded.has(String(node.id))) walk(node.children, expanded)
    }
  }
  walk(assignDepth(props.nodes, 1), expandedKeys.value)
  return visible
})

function collectAncestors(nodes: Row[]): Set<string> {
  const keys = new Set<string>()
  nodes.forEach(node => {
    if (node.children?.length) keys.add(String(node.id))
  })
  return keys
}

function searchKeys(nodes: Row[]): Set<string> {
  const keys = new Set<string>()
  const walk = (list: Row[], ancestors: string[] = []) => {
    for (const node of list) {
      const chain = node.__searchMatch ? ancestors : []
      chain.forEach(key => keys.add(key))
      if (node.__hasSearchDescendant && node.children?.length) {
        keys.add(String(node.id))
        walk(node.children, [...ancestors, String(node.id)])
      }
    }
  }
  walk(nodes)
  return keys
}

function refreshExpanded() {
  expandedKeys.value = props.searching ? searchKeys(assignDepth(props.nodes, 1)) : collectAncestors(assignDepth(props.nodes, 1))
}

watch([() => props.nodes, () => props.searching], refreshExpanded, { immediate: true, deep: true })

function isExpanded(row: Row): boolean {
  return expandedKeys.value.has(String(row.id))
}

function toggleExpand(row: Row) {
  const key = String(row.id)
  const next = new Set(expandedKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedKeys.value = next
}
</script>

<style scoped>
/* 规格 token 见 tokens.css --ui-tree-*（REA 实测：展开钮 18×18 r4、图标 12、每级缩进 14、行内容高 26） */
.org-table__name { display: flex; align-items: center; gap: var(--ui-tree-expand-gap); min-width: 0; height: var(--ui-tree-name-height); box-sizing: border-box; }
.org-table__expand { display: grid; place-items: center; width: var(--ui-tree-expand-size); height: var(--ui-tree-expand-size); flex: 0 0 var(--ui-tree-expand-size); padding: 0; border: 0; border-radius: var(--ui-tree-expand-radius); background: transparent; color: var(--ui-tree-expand-color); cursor: pointer; }
.org-table__expand:hover { background: var(--ui-tree-expand-hover-background); }
.org-table__expand svg { width: var(--ui-tree-expand-icon-size); height: var(--ui-tree-expand-icon-size); transition: transform var(--motion-duration-standard) var(--motion-easing-standard); }
.org-table__expand svg.is-collapsed { transform: rotate(-90deg); }
.org-table__expand--placeholder { pointer-events: none; }
.org-table__label { overflow: hidden; min-width: 0; flex: 1; color: var(--color-text-primary); font: inherit; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.org-table__inactive { margin-left: var(--ui-tree-tag-gap); }
.org-table__action-placeholder { color: var(--color-text-placeholder); }
</style>
