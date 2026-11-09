<script setup lang="ts">
import { ElTable, type TableInstance, vLoading } from 'element-plus'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import UiTable, { type UiTableColumn } from '../ui/UiTable.vue'
import UiPagination from '../ui/UiPagination.vue'
import PerformancePopover from './PerformancePopover.vue'
import { performanceColumnWidth, type PerformanceTableColumn } from './performanceTableColumns'
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
  viewportSurface?: boolean
  viewportFill?: boolean
  showPagination?: boolean
  rowKey?: string
  clickableRows?: boolean
  sortKey?: string
  sortOrder?: PerformanceSortOrder
  sortMode?: 'local' | 'remote'
  sortValue?: (row: any, key: string) => unknown
  scrollMode?: 'inner' | 'page'
  fit?: boolean
  browserColumnMinWidths?: number[]
  showSelectionBar?: boolean
  selectionBarTarget?: string
  columns?: PerformanceTableColumn[]
  selectable?: boolean
  isRowSelectable?: (row: any) => boolean
  selectionKey?: string
  selectedKeys?: string[]
  highlightRowKey?: string | number
}>(), {
  page: 1,
  pageSize: 10,
  maxHeight: 600,
  viewportSurface: false,
  viewportFill: false,
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
  selectionBarTarget: undefined,
  columns: undefined,
  selectable: false,
  selectionKey: 'id',
  selectedKeys: undefined,
  highlightRowKey: undefined,
})

const emit = defineEmits<{
  'page-change': [page: number]
  'page-size-change': [pageSize: number]
  'selection-change': [rows: any[]]
  'update:selectedKeys': [keys: string[]]
  'row-click': [row: any]
  'sort-change': [payload: { key: string; order: PerformanceSortOrder }]
}>()

const totalCount = computed(() => props.total ?? props.rows.length)
const tableRows = computed(() => {
  if (props.sortMode !== 'local' || !props.sortKey || !props.sortOrder || !props.sortValue) {
    return props.rows as any[]
  }
  return sortPerformanceRows(props.rows as any[], props.sortKey, props.sortOrder, props.sortValue)
})

/**
 * 渲染内核：统一交给 UiTable（REA 单内核架构）。
 * - inner 模式（存量 el-table 分支）：待后续迁移，见治理方案 S2
 * - page 模式：UiTable 外层滚动 + 可选吸顶 + 多选/排序（REA 绩效 v2 线形态）
 */
const useNativeTable = computed(() => props.scrollMode === 'page' && Boolean(props.columns?.length))
const nativeColumns = computed(() => props.columns ?? [])
const uiColumns = computed<UiTableColumn[]>(() => nativeColumns.value.map(column => ({
  key: column.key,
  label: column.label,
  width: columnWidth(column),
  fixed: column.fixed === true || column.fixed === 'left' ? 'left' : column.fixed === 'right' ? 'right' : undefined,
  sortable: column.sortable,
  align: column.align,
})))
const selectionWidth = 40
function columnWidth(column: PerformanceTableColumn) {
  return column.width ?? performanceColumnWidth(column.key)
}

/* ---- 多选（UiTable 受控，本组件持有状态并向上桥接 v-model） ---- */
const rowKeyOf = (row: any) => String(row?.[props.selectionKey] ?? '')
const selectedKeys = ref<Set<string>>(new Set())
watch(() => props.selectedKeys, keys => {
  if (keys) selectedKeys.value = new Set(keys)
}, { immediate: true })
const selectedKeyList = computed(() => [...selectedKeys.value])
const elSelectedRows = ref<any[]>([])
const selectedCount = computed(() => (useNativeTable.value ? selectedKeys.value.size : elSelectedRows.value.length))
function onNativeSelectedKeys(keys: string[]) {
  selectedKeys.value = new Set(keys)
  emit('update:selectedKeys', keys)
}
function onSelectionChange(rows: any[]) {
  elSelectedRows.value = rows
  emit('selection-change', rows)
}
function clearSelection() {
  if (useNativeTable.value) {
    selectedKeys.value = new Set()
    emit('update:selectedKeys', [])
    emit('selection-change', [])
  } else {
    tableRef.value?.clearSelection()
  }
}

const tableRef = ref<TableInstance | null>(null)

const rootRef = ref<HTMLElement | null>(null)
const barStyle = ref<Record<string, string>>({})
function updateBarPosition() {
  const element = rootRef.value
  if (!element) return
  const container = element.parentElement ?? element
  const rect = container.getBoundingClientRect()
  const viewportWidth = document.documentElement.clientWidth
  barStyle.value = {
    left: `${Math.max(0, rect.left)}px`,
    right: `${Math.max(0, viewportWidth - rect.right)}px`,
  }
}

const cellTooltip = ref<{ visible: boolean; text: string; anchor: HTMLElement | null }>({ visible: false, text: '', anchor: null })
let tooltipShowTimer: number | undefined
let tooltipHideTimer: number | undefined
function onTableCellOver(event: MouseEvent) {
  if (!props.viewportSurface || useNativeTable.value) return
  const cell = (event.target as HTMLElement).closest<HTMLElement>('td.el-table__cell:not(.el-table-fixed-column--right)')
  if (!cell || !rootRef.value?.contains(cell)) return
  if (event.relatedTarget instanceof Node && cell.contains(event.relatedTarget)) return
  window.clearTimeout(tooltipShowTimer)
  window.clearTimeout(tooltipHideTimer)
  cellTooltip.value.visible = false
  const content = cell.querySelector<HTMLElement>('.cell')
  if (!content || !(content.scrollWidth > content.clientWidth || content.scrollHeight > content.clientHeight)) return
  tooltipShowTimer = window.setTimeout(() => {
    cellTooltip.value = { visible: true, text: (content.textContent || '').trim(), anchor: content }
  }, 300)
}
function onTableCellOut(event: MouseEvent) {
  const cell = (event.target as HTMLElement).closest<HTMLElement>('td.el-table__cell')
  if (!cell || !rootRef.value?.contains(cell)) return
  if (event.relatedTarget instanceof Node && cell.contains(event.relatedTarget)) return
  scheduleCellTooltipHide()
}
function keepCellTooltip() {
  window.clearTimeout(tooltipHideTimer)
}
function scheduleCellTooltipHide() {
  window.clearTimeout(tooltipShowTimer)
  window.clearTimeout(tooltipHideTimer)
  tooltipHideTimer = window.setTimeout(hideCellTooltip, 100)
}
function hideCellTooltip() {
  window.clearTimeout(tooltipShowTimer)
  window.clearTimeout(tooltipHideTimer)
  cellTooltip.value.visible = false
}

const widthProbeRef = ref<HTMLTableElement | null>(null)
const measuredColumnWidths = ref<number[]>([])
const browserColumnWidths = computed(() => measuredColumnWidths.value.length === props.browserColumnMinWidths?.length
  ? measuredColumnWidths.value
  : props.browserColumnMinWidths ?? [])
function measureColumnWidths() {
  const cells = widthProbeRef.value?.rows[0]?.cells
  if (!cells?.length) return
  const widths: number[] = []
  let edge = 0
  let roundedEdge = 0
  for (const cell of Array.from(cells)) {
    const width = cell.getBoundingClientRect().width
    if (!width) return
    edge += width
    const nextEdge = Math.round(edge)
    widths.push(nextEdge - roundedEdge)
    roundedEdge = nextEdge
  }
  if (widths.some((width, index) => width !== measuredColumnWidths.value[index]) || widths.length !== measuredColumnWidths.value.length) {
    measuredColumnWidths.value = widths
  }
}
watch(() => props.browserColumnMinWidths, () => {
  measuredColumnWidths.value = []
  void nextTick(measureColumnWidths)
}, { deep: true })

const toolbarRef = ref<HTMLElement | null>(null)
const paginationRef = ref<HTMLElement | null>(null)
const viewportTableHeight = ref<number>()
const tableMaxHeight = computed(() => {
  if (props.scrollMode !== 'inner') return undefined
  if (props.viewportFill) return props.maxHeight
  if (!props.viewportSurface || viewportTableHeight.value === undefined) return props.maxHeight
  return typeof props.maxHeight === 'number'
    ? Math.min(props.maxHeight, viewportTableHeight.value)
    : viewportTableHeight.value
})
function measureViewport() {
  const root = rootRef.value
  const parent = root?.parentElement
  if (!props.viewportSurface || !root || !parent?.clientHeight) return
  const style = getComputedStyle(root)
  const occupiedHeight = [toolbarRef.value, paginationRef.value].reduce((sum, element) => {
    if (!element) return sum
    const elementStyle = getComputedStyle(element)
    return sum + element.offsetHeight + (parseFloat(elementStyle.marginTop) || 0) + (parseFloat(elementStyle.marginBottom) || 0)
  }, 0)
  viewportTableHeight.value = Math.max(1, Math.floor(parent.clientHeight - occupiedHeight
    - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0)))
}

let resizeObserver: ResizeObserver | null = null
watch(() => [selectedCount.value, useNativeTable.value], () => {
  if (selectedCount.value) void nextTick(updateBarPosition)
})
watch(() => [props.rows, props.loading], hideCellTooltip)
watch(() => [props.rows, props.showPagination, props.viewportSurface], () => { void nextTick(measureViewport) })
onMounted(() => {
  updateBarPosition()
  void nextTick(() => { measureViewport(); measureColumnWidths() })
  window.addEventListener('resize', updateBarPosition)
  window.addEventListener('scroll', hideCellTooltip, { capture: true })
  if (rootRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => { updateBarPosition(); measureViewport(); measureColumnWidths() })
    resizeObserver.observe(rootRef.value)
    if (rootRef.value.parentElement) resizeObserver.observe(rootRef.value.parentElement)
    if (toolbarRef.value) resizeObserver.observe(toolbarRef.value)
    if (paginationRef.value) resizeObserver.observe(paginationRef.value)
  }
})
onBeforeUnmount(() => {
  hideCellTooltip()
  window.removeEventListener('resize', updateBarPosition)
  window.removeEventListener('scroll', hideCellTooltip, { capture: true } as EventListenerOptions)
  resizeObserver?.disconnect()
})
function rowClassName({ row }: { row: any }) {
  const classes: string[] = []
  if (props.clickableRows) classes.push('is-clickable-row')
  if (props.showSelectionBar && elSelectedRows.value.includes(row)) classes.push('is-selected-row')
  if (props.highlightRowKey !== undefined && String(row?.[props.rowKey] ?? '') === String(props.highlightRowKey)) classes.push('is-highlighted-row')
  return classes.join(' ') || undefined
}
</script>

<template>
  <div ref="rootRef" class="performance-management-table" :class="{ 'is-page-scroll': scrollMode === 'page', 'table-surface': viewportSurface && !useNativeTable, 'table-surface-fill': viewportSurface && viewportFill && !useNativeTable }" :aria-label="tableAriaLabel">
    <div v-if="$slots.toolbar" ref="toolbarRef" class="table-toolbar"><slot name="toolbar" /></div>
    <template v-if="useNativeTable">
      <!-- 渲染内核：UiTable（REA 单内核；外层滚动、无投影、可选吸顶） -->
      <UiTable
        :columns="uiColumns"
        :rows="tableRows"
        :row-key="rowKey"
        :loading="loading"
        :loading-text="loadingText"
        :empty-text="emptyText"
        :aria-label="tableAriaLabel"
        :clickable-rows="clickableRows"
        :selectable="selectable"
        :selection-key="selectionKey"
        :is-row-selectable="isRowSelectable"
        :selected-keys="selectedKeyList"
        :highlight-row-key="highlightRowKey"
        :sort-key="sortKey"
        :sort-order="sortOrder"
        :sticky-header-top="0"
        @update:selected-keys="onNativeSelectedKeys"
        @selection-change="emit('selection-change', $event)"
        @sort-change="emit('sort-change', $event)"
        @row-click="emit('row-click', $event)"
      >
        <template #cell="{ row, column, value }">
          <slot name="cell" :row="row" :column="column" :value="value" />
        </template>
        <template #empty="{ loading: isLoading, text }">
          <slot name="empty" :loading="isLoading" :text="text" />
        </template>
      </UiTable>
    </template>

    <template v-else>
      <div class="table-scroll" :class="{ 'has-column-width-probe': browserColumnMinWidths?.length }" @mouseover="onTableCellOver" @mouseout="onTableCellOut">
        <div v-if="browserColumnMinWidths?.length" class="column-width-probe" aria-hidden="true">
          <table ref="widthProbeRef">
            <colgroup><col v-for="(width, index) in browserColumnMinWidths" :key="index" :style="{ width: `${width}px`, minWidth: `${width}px` }"></colgroup>
            <tbody><tr><td v-for="(_, index) in browserColumnMinWidths" :key="index"></td></tr></tbody>
          </table>
        </div>
        <el-table ref="tableRef" v-loading="loading" :data="tableRows" style="width: 100%" :fit="browserColumnMinWidths?.length ? false : fit" :max-height="tableMaxHeight" :scrollbar-tabindex="viewportSurface ? 0 : undefined" :row-key="rowKey" table-layout="fixed" :row-class-name="rowClassName" @selection-change="onSelectionChange" @row-click="emit('row-click', $event)">
          <slot :column-widths="browserColumnWidths" />
          <template #empty>
            <slot name="empty" :loading="loading" :text="loading ? loadingText : emptyText">
              <div class="table-state" :role="loading ? 'status' : undefined">
                {{ loading ? loadingText : emptyText }}
              </div>
            </slot>
          </template>
        </el-table>
      </div>
    </template>

    <div v-if="showPagination" ref="paginationRef" class="table-pagination" :aria-label="paginationAriaLabel">
      <slot name="pagination-prefix" />
      <UiPagination :page="page" :page-size="pageSize" :total="totalCount" @page-change="emit('page-change', $event)" @page-size-change="emit('page-size-change', $event)" />
    </div>

    <div v-if="showSelectionBar && selectedCount" class="selection-bar-spacer" aria-hidden="true"></div>
    <Teleport :to="selectionBarTarget || 'body'" :disabled="!selectionBarTarget">
      <Transition name="selection-bar-slide">
        <div v-if="showSelectionBar && selectedCount" class="selection-bar" :class="{ 'selection-bar--viewport': selectionBarTarget }" :style="selectionBarTarget ? undefined : barStyle" :aria-label="`已选择 ${selectedCount} 条`">
          <slot name="selection-actions" />
          <span class="selection-bar__count">已选择 {{ selectedCount }} 条</span>
          <button type="button" class="selection-bar__clear" @click="clearSelection">清除</button>
        </div>
      </Transition>
    </Teleport>

    <PerformancePopover :visible="cellTooltip.visible" :anchor="cellTooltip.anchor" width="auto" :gap="8" name="performance-cell-tooltip" @close="hideCellTooltip" @mouseenter="keepCellTooltip" @mouseleave="viewportSurface ? scheduleCellTooltipHide() : hideCellTooltip()">{{ cellTooltip.text }}</PerformancePopover>
  </div>
</template>

<style scoped>
/* REA 绩效线（ud__table）表头规格：白底 47px（覆盖 UiTable 的 smb 线灰底默认值） */
.performance-management-table {
  --ui-table-header-background: #ffffff;
  --ui-table-header-height: 47px;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.table-toolbar { flex-shrink: 0; margin-bottom: var(--page-gap-toolbar-table); }
.table-scroll { overflow: visible; }
.table-scroll.has-column-width-probe { position: relative; }
.column-width-probe { position: absolute; width: 100%; height: 0; overflow: hidden; visibility: hidden; pointer-events: none; }
.column-width-probe table { width: auto; min-width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0; }
.column-width-probe td { padding: 0; border: 0; }
.table-surface {
  flex: 0 1 auto;
  max-height: 100%;
  padding: var(--performance-table-viewport-padding);
  box-sizing: border-box;
  overflow: hidden;
  border-radius: var(--performance-content-surface-radius);
  background: var(--performance-content-surface-background);
  box-shadow: var(--performance-content-surface-shadow);
}
.table-surface .table-scroll { min-width: 0; min-height: 0; overflow: hidden; }
.table-surface :deep(.el-scrollbar__wrap::-webkit-scrollbar) { display: none; }
.table-surface :deep(.el-scrollbar__wrap) { scrollbar-width: none; overscroll-behavior: contain; }
.table-surface :deep(.el-scrollbar__bar.is-vertical) { display: none; }
.table-surface :deep(.el-scrollbar__bar.is-horizontal) { height: var(--performance-table-scrollbar-size); }
.table-surface :deep(.el-scrollbar__thumb) { background: var(--performance-table-scrollbar-thumb); }
.table-surface :deep(.el-table th.el-table__cell),
.table-surface :deep(.el-table td.el-table__cell) { padding-left: 0; padding-right: 0; text-align: left; }
.table-surface :deep(.el-table .cell) {
  padding: 0 var(--performance-table-cell-padding-inline);
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}
.table-surface .table-pagination {
  flex-shrink: 0;
  flex-wrap: wrap;
  min-height: var(--performance-table-pagination-height);
  margin: var(--performance-table-pagination-gap) 0 0;
}
.table-surface-fill {
  flex: 1 1 0;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: none;
}
.table-surface-fill::-webkit-scrollbar { display: none; }
.table-surface-fill .table-scroll { flex: 0 0 auto; }
.table-surface-fill :deep(.el-table__body tr) { height: var(--performance-table-fill-row-height); }
.table-surface-fill :deep(.el-scrollbar__wrap) { overscroll-behavior-y: auto; }
.table-surface-fill .table-pagination {
  --performance-select-height: var(--performance-table-pagination-height);
  margin: var(--performance-table-fill-pagination-gap) 0;
}
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
:deep(.el-table__cell) { height: 48px; padding-top: 0; padding-bottom: 0; }
.table-state { display: grid; min-height: 96px; place-items: center; color: var(--color-text-secondary); }
:deep(.is-clickable-row) { cursor: pointer; }
:deep(.is-highlighted-row > .el-table__cell) { background: var(--ui-table-highlight-background, #e8f3ff); }
.table-pagination { min-height: 28px; display: flex; align-items: center; justify-content: flex-end; margin: 16px 0; }
.selection-bar { position: fixed; bottom: 0; z-index: 30; display: flex; align-items: center; gap: 12px; padding: 12px 20px; background: #fff; box-shadow: 0 -1px 0 rgba(31, 35, 41, 0.1); }
.selection-bar--viewport { left: 0; right: 0; z-index: var(--performance-drawer-z-index); height: 60px; padding: 0 20px; box-sizing: border-box; }
.selection-bar-spacer { height: 30px; }
.selection-bar__count { margin-left: 12px; color: #646a73; font-size: 14px; line-height: 22px; }
.selection-bar__clear { padding: 2px 4px; border: 0; border-radius: 6px; background: transparent; color: #1456f0; font: inherit; font-size: 14px; line-height: 18px; cursor: pointer; }
.selection-bar__clear:hover, .selection-bar__clear:focus-visible { background: #eff0f1; outline: 0; }
.selection-bar-slide-enter-active, .selection-bar-slide-leave-active { transition: transform .2s ease, opacity .2s ease; }
.selection-bar-slide-enter-from, .selection-bar-slide-leave-to { transform: translateY(100%); opacity: 0; }
</style>
