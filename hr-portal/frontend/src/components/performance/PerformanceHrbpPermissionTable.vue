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
</script>

<template>
  <section class="hrbp-permission-list" aria-label="HRBP 权限列表">
    <PerformancePromptNotice class="permission-notice" type="info">
      <span class="permission-count">{{ total }}</span>
    </PerformancePromptNotice>

    <div class="permission-toolbar">
      <PerformanceCreateButton class="permission-create-button" label="新建 HRBP" @click="emit('create')" />
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
      @selection-change="emit('selection-change', $event as HrbpPermissionRow[])"
      @page-change="emit('page-change', $event)"
      @page-size-change="emit('page-size-change', $event)"
    >
      <el-table-column type="selection" width="40" />
      <el-table-column prop="hrbp" label="HRBP" min-width="300" show-overflow-tooltip />
      <el-table-column prop="scope" label="本周期负责范围" min-width="856" show-overflow-tooltip />
      <el-table-column prop="invisiblePeople" label="不可见人员" min-width="150" show-overflow-tooltip />
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <div class="permission-row-actions">
            <PerformancePermissionButton :allowed="allowed" op="U" class="row-action" @click="emit('edit', row)">编辑</PerformancePermissionButton>
            <PerformancePermissionButton :allowed="allowed" op="D" class="row-action" @click="emit('remove', row)">删除</PerformancePermissionButton>
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
.permission-toolbar { display: flex; align-items: center; min-height: 32px; margin-bottom: 16px; }
.permission-create-button { min-width: 109px; }
.permission-row-actions { display: flex; align-items: center; white-space: nowrap; }
.permission-row-actions .row-action { min-width: 0; margin: 0; padding: 0; border: 0; background: transparent; color: #1456f0; font-size: 14px; line-height: 22px; }
.permission-row-actions .row-action + .row-action { margin-left: 16px; }
.hrbp-permission-list :deep(.el-table th.el-table__cell) { color: #646a73; font-weight: 500; }
.hrbp-permission-list :deep(.el-table__row:hover > td.el-table__cell) { background: #eff0f1; }
</style>
