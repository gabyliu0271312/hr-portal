<script setup lang="ts">
import { ElOption, ElSelect, ElTable } from 'element-plus'
import { computed } from 'vue'
import DownBoldOutlinedIcon from './DownBoldOutlinedIcon.vue'

const props = withDefaults(defineProps<{
  rows: unknown[]
  loading: boolean
  loadingText: string
  emptyText: string
  tableAriaLabel: string
  paginationAriaLabel: string
  page?: number
  pageSize?: number
  total?: number
  maxHeight?: number | string
  showPagination?: boolean
}>(), {
  page: 1,
  pageSize: 10,
  showPagination: true,
})

const emit = defineEmits<{
  'page-change': [page: number]
  'page-size-change': [pageSize: number]
  'selection-change': [rows: any[]]
}>()

const totalCount = computed(() => props.total ?? props.rows.length)
const pageCount = computed(() => Math.max(1, Math.ceil(totalCount.value / props.pageSize)))
const tableRows = computed(() => props.rows as any[])

function changePage(page: number) {
  if (page >= 1 && page <= pageCount.value && page !== props.page) emit('page-change', page)
}
</script>

<template>
  <div class="performance-management-table" :aria-label="tableAriaLabel">
    <div class="table-scroll">
      <el-table :data="tableRows" style="width: 100%" :max-height="maxHeight" row-key="id" table-layout="fixed" @selection-change="emit('selection-change', $event)">
        <slot />
        <template #empty>
          <slot name="empty" :loading="loading" :text="loading ? loadingText : emptyText">
            <div class="table-state" :role="loading ? 'status' : undefined">
              {{ loading ? loadingText : emptyText }}
            </div>
          </slot>
        </template>
      </el-table>
    </div>

    <div v-if="showPagination" class="table-pagination" :aria-label="paginationAriaLabel">
      <span class="pagination-total">共 {{ totalCount }} 条</span>
      <button class="pagination-arrow" type="button" aria-label="上一页" :disabled="page <= 1" @click="changePage(page - 1)">
        <svg viewBox="0 0 24 24" aria-hidden="true" data-icon="LeftBoldOutlined"><path d="m16.314 3.515-.707-.707a1 1 0 0 0-1.414 0l-7.779 7.778a2 2 0 0 0 0 2.829l7.779 7.778a1 1 0 0 0 1.414 0l.707-.707a1 1 0 0 0 0-1.414L9.243 12l7.07-7.072a1 1 0 0 0 0-1.414Z" fill="currentColor" /></svg>
      </button>
      <button class="page-current" type="button" aria-current="page">{{ page }}</button>
      <button class="pagination-arrow" type="button" aria-label="下一页" :disabled="page >= pageCount" @click="changePage(page + 1)">
        <svg viewBox="0 0 24 24" aria-hidden="true" data-icon="RightBoldOutlined"><path d="m7.586 20.486.707.707a1 1 0 0 0 1.414 0l7.778-7.778a2 2 0 0 0 0-2.829L9.707 2.808a1 1 0 0 0-1.414 0l-.707.707a1 1 0 0 0 0 1.414l7.07 7.072-7.07 7.07a1 1 0 0 0 0 1.415Z" fill="currentColor" /></svg>
      </button>
      <el-select class="page-size-select" :model-value="pageSize" :suffix-icon="DownBoldOutlinedIcon" size="small" aria-label="每页条数" @change="emit('page-size-change', $event)">
        <el-option v-for="size in [10, 20, 50, 100]" :key="size" :label="`${size} 条/页`" :value="size" />
      </el-select>
    </div>
  </div>
</template>

<style scoped>
.performance-management-table { min-height: 0; display: flex; flex-direction: column; }
/* 单一横向滚动容器：由 el-table 内部滚动区承担（等价采集契约 ud__table-content），外层一律不滚动，避免双滚动条 */
.table-scroll { overflow: visible; }
.table-state { display: grid; min-height: 96px; place-items: center; color: var(--color-text-secondary); }
.table-pagination { min-height: 28px; display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin: 16px 0; color: #1f2329; font-size: 14px; }
.pagination-total { margin-right: 2px; }
.pagination-arrow, .page-current { width: 28px; height: 28px; display: inline-grid; place-items: center; padding: 0; border: 1px solid #d0d3d6; border-radius: 6px; background: #fff; color: #1f2329; }
.pagination-arrow svg { width: 12px; height: 12px; }
.pagination-arrow:disabled { color: #bbbfc4; cursor: not-allowed; }
.page-current { border-color: #3370ff; color: #3370ff; }
.page-size-select { width: 88px; margin-left: 2px; }
:deep(.el-table) { --el-table-header-bg-color: #fff; border-top: 1px solid rgba(31, 35, 41, 0.15); }
:deep(.el-table th.el-table__cell) { height: 46.6667px; padding: 12px; background: #fff; color: #1f2329; font-size: 14px; font-weight: 400; line-height: 22px; }
:deep(.el-table th.el-table__cell > .cell) { padding: 0 12px; line-height: 22px; }
:deep(.el-table .el-table-column--selection > .cell) { padding-right: 0; padding-left: 0; }
:deep(.el-table__cell) { height: 48px; padding-top: 0; padding-bottom: 0; }
</style>