<script setup lang="ts">
import { ElOption, ElSelect, ElTable, type TableInstance } from 'element-plus'
import { computed, ref } from 'vue'
import DownBoldOutlinedIcon from './DownBoldOutlinedIcon.vue'
import { sortPerformanceRows, type PerformanceSortOrder } from './performanceTableSort'

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
  rowKey?: string
  clickableRows?: boolean
  sortKey?: string
  sortOrder?: PerformanceSortOrder
  sortMode?: 'local' | 'remote'
  sortValue?: (row: any, key: string) => unknown
  scrollMode?: 'inner' | 'page'
  fit?: boolean
  showSelectionBar?: boolean
}>(), {
  page: 1,
  pageSize: 10,
  maxHeight: 600,
  showPagination: true,
  rowKey: 'id',
  clickableRows: false,
  sortKey: '',
  sortOrder: '',
  sortMode: 'local',
  sortValue: undefined,
  scrollMode: 'inner',
  fit: true,
  showSelectionBar: false,
})

const emit = defineEmits<{
  'page-change': [page: number]
  'page-size-change': [pageSize: number]
  'selection-change': [rows: any[]]
  'row-click': [row: any]
  'sort-change': [payload: { key: string; order: PerformanceSortOrder }]
}>()

const totalCount = computed(() => props.total ?? props.rows.length)
const pageCount = computed(() => Math.max(1, Math.ceil(totalCount.value / props.pageSize)))
const tableRows = computed(() => {
  if (props.sortMode !== 'local' || !props.sortKey || !props.sortOrder || !props.sortValue) {
    return props.rows as any[]
  }
  return sortPerformanceRows(props.rows as any[], props.sortKey, props.sortOrder, props.sortValue)
})

function changePage(page: number) {
  if (page >= 1 && page <= pageCount.value && page !== props.page) emit('page-change', page)
}

const tableRef = ref<TableInstance | null>(null)
const selectedRows = ref<any[]>([])
function onSelectionChange(rows: any[]) {
  selectedRows.value = rows
  emit('selection-change', rows)
}
function clearSelection() {
  tableRef.value?.clearSelection()
}
function rowClassName({ row }: { row: any }) {
  const classes: string[] = []
  if (props.clickableRows) classes.push('is-clickable-row')
  if (props.showSelectionBar && selectedRows.value.includes(row)) classes.push('is-selected-row')
  return classes.join(' ') || undefined
}

const jumpText = ref('')
type PageItem = { type: 'page'; page: number } | { type: 'jump'; key: string }
const pageItems = computed<PageItem[]>(() => {
  const count = pageCount.value
  const current = Math.min(Math.max(props.page, 1), count)
  const pages = new Set<number>([1, count, current])
  if (count <= 7) {
    for (let index = 1; index <= count; index += 1) pages.add(index)
  } else if (current <= 4) {
    ;[2, 3, 4, 5].forEach(page => pages.add(page))
  } else if (current >= count - 3) {
    ;[count - 4, count - 3, count - 2, count - 1].forEach(page => pages.add(page))
  } else {
    ;[current - 1, current + 1].forEach(page => pages.add(page))
  }
  const ordered = [...pages].filter(page => page >= 1 && page <= count).sort((left, right) => left - right)
  const items: PageItem[] = []
  ordered.forEach((page, index) => {
    if (index > 0 && page - ordered[index - 1] > 1) items.push({ type: 'jump', key: `jump-${page}` })
    items.push({ type: 'page', page })
  })
  return items
})

function jumpToPage() {
  const value = Number(jumpText.value)
  jumpText.value = ''
  if (!Number.isFinite(value)) return
  const target = Math.min(Math.max(Math.trunc(value), 1), pageCount.value)
  changePage(target)
}
</script>

<template>
  <div class="performance-management-table" :class="{ 'is-page-scroll': scrollMode === 'page' }" :aria-label="tableAriaLabel">
    <div class="table-scroll">
      <el-table ref="tableRef" v-loading="loading" :data="tableRows" style="width: 100%" :fit="fit" :max-height="scrollMode === 'inner' ? maxHeight : undefined" :row-key="rowKey" table-layout="fixed" :row-class-name="rowClassName" @selection-change="onSelectionChange" @row-click="emit('row-click', $event)">
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
      <ul class="pagination-list">
        <li>
          <button class="pagination-arrow" type="button" aria-label="上一页" :disabled="page <= 1" @click="changePage(page - 1)">
            <svg viewBox="0 0 24 24" aria-hidden="true" data-icon="LeftBoldOutlined"><path d="m16.314 3.515-.707-.707a1 1 0 0 0-1.414 0l-7.779 7.778a2 2 0 0 0 0 2.829l7.779 7.778a1 1 0 0 0 1.414 0l.707-.707a1 1 0 0 0 0-1.414L9.243 12l7.07-7.072a1 1 0 0 0 0-1.414Z" fill="currentColor" /></svg>
          </button>
        </li>
        <template v-for="item in pageItems" :key="item.type === 'page' ? `page-${item.page}` : item.key">
          <li v-if="item.type === 'jump'" class="pagination-ellipsis" aria-hidden="true">…</li>
          <li v-else>
            <button class="page-number" :class="{ current: item.page === page }" type="button" :aria-current="item.page === page ? 'page' : undefined" :aria-label="`第 ${item.page} 页`" @click="changePage(item.page)">{{ item.page }}</button>
          </li>
        </template>
        <li>
          <button class="pagination-arrow" type="button" aria-label="下一页" :disabled="page >= pageCount" @click="changePage(page + 1)">
            <svg viewBox="0 0 24 24" aria-hidden="true" data-icon="RightBoldOutlined"><path d="m7.586 20.486.707.707a1 1 0 0 0 1.414 0l7.778-7.778a2 2 0 0 0 0-2.829L9.707 2.808a1 1 0 0 0-1.414 0l-.707.707a1 1 0 0 0 0 1.414l7.07 7.072-7.07 7.07a1 1 0 0 0 0 1.415Z" fill="currentColor" /></svg>
          </button>
        </li>
      </ul>
      <el-select popper-class="performance-token-select-popper" class="page-size-select performance-token-select" :model-value="pageSize" :suffix-icon="DownBoldOutlinedIcon" size="small" aria-label="每页条数" @change="emit('page-size-change', $event)">
        <el-option v-for="size in [10, 20, 50, 100]" :key="size" :label="`${size} 条/页`" :value="size" />
      </el-select>
      <span class="pagination-jump">跳至 <input v-model="jumpText" class="pagination-jump-input" type="text" inputmode="numeric" aria-label="跳至页码" @keyup.enter="jumpToPage" @blur="jumpToPage" /> 页</span>
    </div>

    <Transition name="selection-bar-slide">
      <div v-if="showSelectionBar && selectedRows.length" class="selection-bar" :aria-label="`已选择 ${selectedRows.length} 条`">
        <slot name="selection-actions" />
        <span class="selection-bar__count">已选择 {{ selectedRows.length }} 条</span>
        <button type="button" class="selection-bar__clear" @click="clearSelection">清除</button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.performance-management-table { min-height: 0; display: flex; flex-direction: column; }
/* 单一横向滚动容器：由 el-table 内部滚动区承担（等价采集契约 ud__table-content），外层一律不滚动，避免双滚动条 */
.table-scroll { overflow: visible; }
.table-state { display: grid; min-height: 96px; place-items: center; color: var(--color-text-secondary); }
:deep(.is-clickable-row) { cursor: pointer; }
.table-pagination { min-height: 28px; display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin: 16px 0; color: #1f2329; font-size: 14px; }
.pagination-list { display: flex; align-items: center; gap: 4px; margin: 0; padding: 0; list-style: none; }
.pagination-arrow, .page-number, .pagination-ellipsis { min-width: 28px; height: 28px; display: inline-grid; place-items: center; padding: 0; border: 1px solid transparent; border-radius: 6px; background: transparent; color: #1f2329; font: inherit; }
.pagination-arrow { border-color: #d0d3d6; background: #fff; }
.pagination-arrow svg { width: 12px; height: 12px; }
.pagination-arrow:disabled { color: #bbbfc4; cursor: not-allowed; }
.page-number { cursor: pointer; }
.page-number:hover { background: #eff0f1; }
.page-number.current { border-color: #3370ff; color: #3370ff; font-weight: 600; }
.page-size-select { width: 96px; }
.pagination-jump { display: inline-flex; align-items: center; gap: 4px; color: #1f2329; }
.pagination-jump-input { width: 44px; height: 28px; padding: 0 6px; border: 1px solid #d0d3d6; border-radius: 6px; box-sizing: border-box; font: inherit; text-align: center; }
.is-page-scroll { overflow: visible; }
.is-page-scroll :deep(.el-table) { overflow: visible; }
.is-page-scroll :deep(.el-table__inner-wrapper) { overflow: visible; }
.is-page-scroll :deep(.el-table__header-wrapper) { position: sticky; top: 20px; z-index: 20; background: #fff; box-shadow: 0 1px 0 rgba(31, 35, 41, 0.15); }
.is-page-scroll :deep(.el-scrollbar__bar.is-vertical) { display: none; }
:deep(.el-table) { --el-table-header-bg-color: #fff; border-top: 1px solid rgba(31, 35, 41, 0.15); }
:deep(.el-table th.el-table__cell) { height: 46.6667px; padding: 12px 0; background: #fff; color: #1f2329; font-size: 14px; font-weight: 400; line-height: 22px; }
:deep(.el-table th.el-table__cell:hover) { background: #f5f6f7; }
:deep(.el-table th.el-table__cell > .cell) { padding: 0 12px; line-height: 22px; }
:deep(.el-table th.el-table-column--selection),
:deep(.el-table td.el-table-column--selection) { padding-left: 0 !important; padding-right: 0 !important; }
:deep(.el-table th.el-table-column--selection > .cell),
:deep(.el-table td.el-table-column--selection > .cell) { display: flex; align-items: center; padding-left: 12px !important; padding-right: 0 !important; }
:deep(.el-table th.el-table-column--selection .el-checkbox),
:deep(.el-table td.el-table-column--selection .el-checkbox) { margin: 0; }
:deep(.el-table__row.is-selected-row > td.el-table__cell) { background: #f5f6f7; }
:deep(.el-table__cell) { height: 48px; padding-top: 0; padding-bottom: 0; }
.selection-bar { position: sticky; bottom: 0; z-index: 21; display: flex; align-items: center; gap: 12px; margin-top: 30px; padding: 8px 0; background: #fff; }
.selection-bar-slide-enter-active, .selection-bar-slide-leave-active { transition: transform .2s ease, opacity .2s ease; }
.selection-bar-slide-enter-from, .selection-bar-slide-leave-to { transform: translateY(100%); opacity: 0; }
.selection-bar__count { margin-left: 12px; color: #646a73; font-size: 14px; line-height: 22px; }
.selection-bar__clear { padding: 2px 4px; border: 0; border-radius: 6px; background: transparent; color: #1456f0; font: inherit; font-size: 14px; line-height: 18px; cursor: pointer; }
.selection-bar__clear:hover, .selection-bar__clear:focus-visible { background: #eff0f1; outline: 0; }
</style>

<style>
/* 页面滚动模式下必须解除 el-table 自身的滚动容器，表头才能相对内容区吸附 */
.is-page-scroll .el-table,
.is-page-scroll .el-table__inner-wrapper { overflow: visible; }
.is-page-scroll .el-table__header-wrapper { position: sticky; top: 20px; z-index: 20; background: #fff; box-shadow: 0 1px 0 rgba(31, 35, 41, 0.15); }
</style>