<template>
  <div class="org-table">
    <table class="org-table__grid">
      <thead>
        <tr>
          <th class="org-table__cell org-table__cell--header org-table__name-col">名称</th>
          <th class="org-table__cell org-table__cell--header">部门负责人</th>
          <th class="org-table__cell org-table__cell--header">部门 HRBP</th>
          <th class="org-table__cell org-table__cell--header">人数</th>
          <th class="org-table__cell org-table__cell--header">更新人</th>
          <th class="org-table__cell org-table__cell--header">更新时间</th>
          <th class="org-table__cell org-table__cell--header org-table__action-col">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id" class="org-table__row">
          <td class="org-table__cell org-table__name-col">
            <div class="org-table__name" :style="{ paddingLeft: `${8 + (row.depth - 1) * 18}px` }">
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
          </td>
          <td class="org-table__cell">{{ row.manager || '--' }}</td>
          <td class="org-table__cell">{{ row.hrbp || '--' }}</td>
          <td class="org-table__cell">{{ row.employee_count ?? '--' }}</td>
          <td class="org-table__cell">{{ row.updated_by || '--' }}</td>
          <td class="org-table__cell">{{ row.updated_at || '--' }}</td>
          <td class="org-table__cell org-table__action-col"><span class="org-table__action-placeholder">--</span></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TreeNode } from '@/api/data'

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
  expandedKeys.value = props.searching ? searchKeys(rows.value) : collectAncestors(rows.value)
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
.org-table { width: 100%; min-width: 0; flex: 1 1; min-height: 0; overflow: auto; }
.org-table__grid { width: 100%; min-width: 1114px; table-layout: fixed; border-collapse: separate; border-spacing: 0; font: 400 14px/22px var(--font-sans); color: #1f2329; }
.org-table__name-col { width: 220px; min-width: 220px; max-width: 220px; position: sticky; left: 0; z-index: 2; background: #fff; }
.org-table__action-col { width: 194px; min-width: 194px; max-width: 194px; position: sticky; right: 0; z-index: 2; background: #fff; }
.org-table__cell--header:not(.org-table__name-col):not(.org-table__action-col) { min-width: 150px; }
.org-table__cell--header:nth-child(4) { min-width: 100px; }
.org-table__cell { box-sizing: border-box; height: 51px; padding: 12px; border-bottom: 1px solid rgba(31, 35, 41, 0.15); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.org-table__name-col, .org-table__action-col { overflow: visible; }
.org-table__name-col::after, .org-table__action-col::after { content: ''; position: absolute; top: 0; bottom: 0; width: 1px; background: #dee0e3; }
.org-table__name-col::after { right: -1px; }
.org-table__action-col::after { left: -1px; }
.org-table__row:hover > td { background: #eff0f1; }
.org-table__row:hover > td.org-table__name-col, .org-table__row:hover > td.org-table__action-col { background: #eff0f1; }
.org-table__cell--header { position: sticky; top: 0; z-index: 3; overflow: visible; background: #f2f3f5; color: #646a73; font-weight: 400; }
.org-table__cell--header.org-table__name-col, .org-table__cell--header.org-table__action-col { z-index: 4; background: #f2f3f5; }
.org-table__name { display: flex; align-items: center; gap: 4px; min-width: 0; height: 51px; box-sizing: border-box; }
.org-table__expand { display: grid; place-items: center; width: 18px; height: 18px; flex: 0 0 18px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: #646a73; cursor: pointer; }
.org-table__expand:hover { background: rgba(31, 35, 41, 0.08); }
.org-table__expand svg { transition: transform 0.2s cubic-bezier(0.34, 0.69, 0.1, 1); }
.org-table__expand svg.is-collapsed { transform: rotate(-90deg); }
.org-table__expand--placeholder { pointer-events: none; }
.org-table__label { overflow: hidden; min-width: 0; flex: 1; color: #1f2329; font: inherit; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.org-table__inactive { margin-left: 8px; }
.org-table__action-placeholder { color: #8f959e; }
</style>
