<script setup lang="ts">
import { ElTableColumn } from 'element-plus'
import PerformanceCreateButton from './PerformanceCreateButton.vue'
import PerformanceManagementTable from './PerformanceManagementTable.vue'
import PerformancePermissionButton from './PerformancePermissionButton.vue'
import PerformancePromptNotice from './PerformancePromptNotice.vue'

type HrbpPermissionRow = {
  id: string | number
  hrbp: string
  scope: string
  invisiblePeople: string
}

withDefaults(defineProps<{
  rows: HrbpPermissionRow[]
  page?: number
  pageSize?: number
  total?: number
  allowed?: boolean
}>(), {
  page: 1,
  pageSize: 10,
  total: 0,
  allowed: true,
})

const emit = defineEmits<{
  create: []
  edit: [row: HrbpPermissionRow]
  remove: [row: HrbpPermissionRow]
  'selection-change': [rows: HrbpPermissionRow[]]
  'page-change': [page: number]
  'page-size-change': [pageSize: number]
}>()

function create() { emit('create') }
function edit(row: unknown) { emit('edit', row as HrbpPermissionRow) }
function remove(row: unknown) { emit('remove', row as HrbpPermissionRow) }
function selectionChange(rows: unknown) { emit('selection-change', rows as HrbpPermissionRow[]) }
function pageChange(page: number) { emit('page-change', page) }
function pageSizeChange(pageSize: number) { emit('page-size-change', pageSize) }
</script>

<template>
  <section class="hrbp-permission-list" aria-label="HRBP 权限列表">
    <PerformancePromptNotice class="permission-notice" type="info">
      <span class="permission-count">{{ total }}</span>
    </PerformancePromptNotice>

    <div class="permission-toolbar">
      <PerformanceCreateButton class="permission-create-button" label="新建 HRBP" @click="create" />
    </div>

    <PerformanceManagementTable
      :rows="rows"
      :loading="false"
      loading-text="正在加载 HRBP 权限配置..."
      empty-text="暂无 HRBP 权限配置"
      table-aria-label="HRBP 权限表格"
      pagination-aria-label="HRBP 权限分页"
      :page="page"
      :page-size="pageSize"
      :total="total"
      @selection-change="selectionChange"
      @page-change="pageChange"
      @page-size-change="pageSizeChange"
    >
      <el-table-column type="selection" width="40" align="left" header-align="left" />
      <el-table-column prop="hrbp" label="HRBP" min-width="300" align="left" header-align="left" show-overflow-tooltip />
      <el-table-column prop="scope" label="本周期负责范围" min-width="856" align="left" header-align="left" show-overflow-tooltip />
      <el-table-column prop="invisiblePeople" label="不可见人员" min-width="150" align="left" header-align="left" show-overflow-tooltip />
      <el-table-column label="操作" width="128" align="left" header-align="left" fixed="right">
        <template #default="{ row }">
          <div class="permission-row-actions">
            <PerformancePermissionButton :allowed="allowed" op="U" class="row-action" :aria-label="`编辑${row.hrbp}`" @click="edit(row)">编辑</PerformancePermissionButton>
            <PerformancePermissionButton :allowed="allowed" op="D" danger class="row-action" :aria-label="`删除${row.hrbp}`" @click="remove(row)">删除</PerformancePermissionButton>
          </div>
        </template>
      </el-table-column>
    </PerformanceManagementTable>
  </section>
</template>

<style scoped>
.hrbp-permission-list { min-width: 0; }
.permission-notice { width: 100%; height: 40px; margin-bottom: 16px; }
.permission-count { color: #3370ff; }
.permission-toolbar { display: flex; align-items: center; justify-content: flex-start; min-height: 32px; margin-bottom: 16px; }
.permission-create-button { min-width: 109px; }
.permission-row-actions { display: flex; align-items: center; gap: var(--performance-button-gap); white-space: nowrap; }
.hrbp-permission-list :deep(.el-table th.el-table__cell) { color: #646a73; font-weight: 500; }
.hrbp-permission-list :deep(.el-table__row:hover > td.el-table__cell) { background: #eff0f1; }
</style>
