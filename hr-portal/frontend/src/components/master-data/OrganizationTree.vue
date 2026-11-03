<template>
  <div class="org-table">
    <el-table
      ref="tableRef"
      :data="rows"
      row-key="id"
      :tree-props="{ children: 'children' }"
      :expand-row-keys="expandedKeys"
      empty-text="暂无组织"
      class="org-table__grid"
      @expand-change="onExpandChange"
    >
      <el-table-column prop="name" label="名称" :width="220" fixed="left" class-name="org-table__name-col">
        <template #default="{ row }">
          <div class="org-table__name" :style="{ paddingLeft: `${8 + (row.depth - 1) * 18}px` }">
            <button
              v-if="row.children?.length"
              class="org-table__expand"
              type="button"
              :aria-label="`${expandedKeys.includes(String(row.id)) ? '收起' : '展开'}${row.name}`"
              @click.stop="toggleExpand(row)"
            >
              <svg :class="{ 'is-collapsed': !expandedKeys.includes(String(row.id)) }" width="12" height="12" viewBox="0 0 24 24" fill="none" data-icon="ExpandDownFilled" aria-hidden="true">
                <path d="M11.22 18.46a1 1 0 0 0 1.56 0l8.305-10.334a1 1 0 0 0-.78-1.626H3.696a1 1 0 0 0-.78 1.626L11.22 18.46Z" fill="currentColor" />
              </svg>
            </button>
            <span v-else class="org-table__expand org-table__expand--placeholder" aria-hidden="true"></span>
            <span class="org-table__label" :title="row.name">{{ row.name }}</span>
            <el-tag v-if="!row.is_active" type="info" size="small" class="org-table__inactive">停用</el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="manager" label="部门负责人" width="150" class-name="org-table__cell">
        <template #default="{ row }">
          <span class="org-table__text">{{ row.manager || '--' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="hrbp" label="部门 HRBP" width="150" class-name="org-table__cell">
        <template #default="{ row }">
          <span class="org-table__text">{{ row.hrbp || '--' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="employee_count" label="人数" width="100" class-name="org-table__cell">
        <template #default="{ row }">
          <span class="org-table__text">{{ row.employee_count ?? '--' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="updated_by" label="更新人" width="150" class-name="org-table__cell">
        <template #default="{ row }">
          <span class="org-table__text">{{ row.updated_by || '--' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="updated_at" label="更新时间" width="150" class-name="org-table__cell">
        <template #default="{ row }">
          <span class="org-table__text">{{ row.updated_at || '--' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" :width="194" fixed="right" class-name="org-table__action-col">
        <template #default>
          <span class="org-table__action-placeholder">--</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElTable, ElTableColumn, type TableInstance } from 'element-plus'
import type { TreeNode } from '@/api/data'

type Row = Omit<TreeNode, 'children'> & { depth: number; children?: Row[]; __searchMatch?: boolean; __hasSearchDescendant?: boolean }

const props = withDefaults(defineProps<{ nodes: TreeNode[]; searching?: boolean }>(), { searching: false })

const tableRef = ref<TableInstance>()
const expandedKeys = ref<string[]>([])

function assignDepth(nodes: TreeNode[], depth: number): Row[] {
  return nodes.map(node => ({
    ...node,
    depth,
    children: node.children?.length ? assignDepth(node.children, depth + 1) : undefined,
  }))
}

const rows = computed<Row[]>(() => assignDepth(props.nodes, 1))

function collectAncestors(nodes: Row[], level = 1): string[] {
  const keys: string[] = []
  nodes.forEach(node => {
    if (level === 1 && node.children?.length) keys.push(String(node.id))
    if (level < 2) keys.push(...collectAncestors(node.children ?? [], level + 1))
  })
  return keys
}

function searchKeys(nodes: Row[]): string[] {
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
  return [...keys]
}

function refreshExpanded() {
  expandedKeys.value = props.searching ? searchKeys(rows.value) : collectAncestors(rows.value)
}

watch([() => props.nodes, () => props.searching], refreshExpanded, { immediate: true, deep: true })

function onExpandChange(row: Record<string, any>, expanded: unknown) {
  if (typeof expanded !== 'boolean') return
  const key = String(row.id)
  expandedKeys.value = expanded
    ? [...new Set([...expandedKeys.value, key])]
    : expandedKeys.value.filter(k => k !== key)
}

function toggleExpand(row: Record<string, any>) {
  tableRef.value?.toggleRowExpansion(row)
}
</script>

<style scoped>
.org-table { width: 100%; }
.org-table__grid { width: 100%; --el-table-border-color: rgba(31, 35, 41, 0.15); --el-table-header-bg-color: #f2f3f5; --el-table-header-text-color: #646a73; --el-table-text-color: #1f2329; border-radius: 0; font-size: 14px; font-weight: 400; }
.org-table__grid :deep(.el-table__header th.el-table__cell) { box-sizing: border-box; height: 51px; padding: 12px; font-weight: 400; color: #646a73; background-color: #f2f3f5; }
.org-table__grid :deep(.el-table__header .cell) { padding: 0; line-height: 22px; white-space: nowrap; }
.org-table__grid :deep(.el-table__body td.el-table__cell) { box-sizing: border-box; height: 51px; padding: 12px; border-bottom: 1px solid rgba(31, 35, 41, 0.15); }
.org-table__grid :deep(.el-table__body .cell) { padding: 0; font-size: 14px; line-height: 22px; color: #1f2329; }
.org-table__name { display: flex; align-items: center; gap: 4px; min-width: 0; height: 51px; box-sizing: border-box; }
.org-table__name-col :deep(.el-table__expand-icon), .org-table__name-col :deep(.el-table__indent), .org-table__name-col :deep(.el-table__placeholder) { display: none; }
.org-table__expand { display: grid; place-items: center; width: 18px; height: 18px; flex: 0 0 18px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: #646a73; cursor: pointer; }
.org-table__expand:hover { background: rgba(31, 35, 41, 0.08); }
.org-table__expand svg { transition: transform 0.2s cubic-bezier(0.34, 0.69, 0.1, 1); }
.org-table__expand svg.is-collapsed { transform: rotate(-90deg); }
.org-table__expand--placeholder { pointer-events: none; }
.org-table__label { overflow: hidden; min-width: 0; flex: 1; color: #1f2329; font: inherit; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.org-table__inactive { margin-left: 8px; }
.org-table__text { color: #1f2329; font: inherit; }
.org-table__action-placeholder { color: #8f959e; }
</style>
