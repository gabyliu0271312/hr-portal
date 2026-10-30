<script setup lang="ts">
import { ElOption, ElSelect, ElTable, type TableInstance } from 'element-plus'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DownBoldOutlinedIcon from './DownBoldOutlinedIcon.vue'
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import PerformanceSortHeader from './PerformanceSortHeader.vue'
import PerformancePopover from './PerformancePopover.vue'
import { performanceColumnWidth, type PerformanceTableColumn } from './performanceTableColumns'
import { nextPerformanceSort, sortPerformanceRows, type PerformanceSortOrder } from './performanceTableSort'

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
  columns?: PerformanceTableColumn[]
  selectable?: boolean
  selectionKey?: string
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
  columns: undefined,
  selectable: false,
  selectionKey: 'id',
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

const useNativeTable = computed(() => props.scrollMode === 'page' && Boolean(props.columns?.length))
const nativeColumns = computed(() => props.columns ?? [])
const selectionWidth = 40
const totalWidth = computed(() => (props.selectable ? selectionWidth : 0) + nativeColumns.value.reduce((sum, column) => sum + columnWidth(column), 0))
function columnWidth(column: PerformanceTableColumn) {
  return column.width ?? performanceColumnWidth(column.key)
}
function fixedLeft(column: PerformanceTableColumn) {
  const index = nativeColumns.value.indexOf(column)
  let left = props.selectable ? selectionWidth : 0
  for (let position = 0; position < index; position += 1) {
    const previous = nativeColumns.value[position]
    if (previous.fixed) left += columnWidth(previous)
  }
  return left
}
function cellStyle(column: PerformanceTableColumn) {
  return column.fixed ? { left: `${fixedLeft(column)}px` } : undefined
}
function isLastFixed(column: PerformanceTableColumn) {
  const index = nativeColumns.value.indexOf(column)
  for (let position = index + 1; position < nativeColumns.value.length; position += 1) {
    if (nativeColumns.value[position].fixed) return false
  }
  return true
}
function orderOf(key: string): 'ascending' | 'descending' | null {
  if (props.sortKey !== key || !props.sortOrder) return null
  return props.sortOrder === 'asc' ? 'ascending' : 'descending'
}
function onSort(key: string) {
  const next = nextPerformanceSort(props.sortKey, props.sortOrder, key)
  emit('sort-change', next)
}

const rowKeyOf = (row: any) => String(row?.[props.selectionKey] ?? '')
const selectedKeys = ref<Set<string>>(new Set())
const elSelectedRows = ref<any[]>([])
const selectedCount = computed(() => (useNativeTable.value ? selectedKeys.value.size : elSelectedRows.value.length))
const allSelected = computed(() => useNativeTable.value && props.rows.length > 0 && props.rows.every(row => selectedKeys.value.has(rowKeyOf(row))))
const someSelected = computed(() => useNativeTable.value && selectedKeys.value.size > 0 && !allSelected.value)
function isSelected(row: any) {
  return useNativeTable.value && selectedKeys.value.has(rowKeyOf(row))
}
function toggleRow(row: any, checked: boolean) {
  const next = new Set(selectedKeys.value)
  if (checked) next.add(rowKeyOf(row))
  else next.delete(rowKeyOf(row))
  selectedKeys.value = next
  emit('selection-change', props.rows.filter(item => next.has(rowKeyOf(item))))
}
function toggleAll(checked: boolean) {
  if (checked) selectedKeys.value = new Set(props.rows.map(rowKeyOf))
  else selectedKeys.value = new Set()
  emit('selection-change', checked ? [...(props.rows as any[])] : [])
}
const tableRef = ref<TableInstance | null>(null)
const headerWrapRef = ref<HTMLElement | null>(null)
const bodyWrapRef = ref<HTMLElement | null>(null)
function syncHeaderScroll() {
  if (headerWrapRef.value && bodyWrapRef.value) headerWrapRef.value.scrollLeft = bodyWrapRef.value.scrollLeft
}
function onSelectionChange(rows: any[]) {
  elSelectedRows.value = rows
  emit('selection-change', rows)
}
function clearSelection() {
  if (useNativeTable.value) {
    selectedKeys.value = new Set()
    emit('selection-change', [])
  } else {
    tableRef.value?.clearSelection()
  }
}

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

const hscrollTrackRef = ref<HTMLElement | null>(null)
const hscrollVisible = ref(false)
const hscrollActive = ref(false)
const isPingLeft = ref(false)
const cellTooltip = ref<{ visible: boolean; text: string; anchor: HTMLElement | null }>({ visible: false, text: '', anchor: null })
function onCellEnter(event: MouseEvent) {
  const cell = event.currentTarget as HTMLElement
  const content = cell.querySelector<HTMLElement>('.feishu-cell__content')
  if (!content) return
  const overflowing = content.scrollWidth > content.clientWidth
    || Array.from(content.querySelectorAll<HTMLElement>('*')).some(element => element.scrollWidth > element.clientWidth)
  if (!overflowing) {
    cellTooltip.value.visible = false
    return
  }
  cellTooltip.value = { visible: true, text: (content.textContent || '').trim(), anchor: cell }
}
function hideCellTooltip() {
  cellTooltip.value.visible = false
}
const hscrollThumbStyle = ref<Record<string, string>>({})
let hideTimer: number | undefined
let draggingThumb = false
let dragStartX = 0
let dragStartScroll = 0
let hscrollMeasureRetry = 0
function updateHscroll() {
  const body = bodyWrapRef.value
  if (!body) return
  isPingLeft.value = body.scrollLeft > 0
  const overflow = body.scrollWidth - body.clientWidth
  hscrollActive.value = overflow > 0
  if (overflow <= 0) return
  const track = hscrollTrackRef.value
  if (!track) return
  if (!track.clientWidth) {
    if (hscrollMeasureRetry++ < 5) void nextTick(updateHscroll)
    return
  }
  hscrollMeasureRetry = 0
  const trackWidth = track.clientWidth
  const thumbWidth = Math.max(24, trackWidth * body.clientWidth / body.scrollWidth)
  const left = (body.scrollLeft / overflow) * Math.max(0, trackWidth - thumbWidth)
  hscrollThumbStyle.value = { width: `${thumbWidth}px`, transform: `translateX(${left}px)` }
}
function showHscroll() {
  if (!hscrollActive.value) return
  hscrollVisible.value = true
  scheduleHscrollHide()
}
function scheduleHscrollHide() {
  window.clearTimeout(hideTimer)
  hideTimer = window.setTimeout(() => { if (!draggingThumb) hscrollVisible.value = false }, 1000)
}
function onBodyScroll() {
  syncHeaderScroll()
  updateHscroll()
  showHscroll()
  hideCellTooltip()
}
function onThumbDown(event: PointerEvent) {
  draggingThumb = true
  dragStartX = event.clientX
  dragStartScroll = bodyWrapRef.value?.scrollLeft ?? 0
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function onThumbMove(event: PointerEvent) {
  if (!draggingThumb) return
  const body = bodyWrapRef.value
  const track = hscrollTrackRef.value
  if (!body || !track) return
  const overflow = body.scrollWidth - body.clientWidth
  const thumbWidth = Math.max(24, track.clientWidth * body.clientWidth / body.scrollWidth)
  const maxThumb = track.clientWidth - thumbWidth
  if (overflow <= 0 || maxThumb <= 0) return
  body.scrollLeft = dragStartScroll + (event.clientX - dragStartX) * overflow / maxThumb
  updateHscroll()
}
function onThumbUp() {
  if (!draggingThumb) return
  draggingThumb = false
  showHscroll()
}
function onTrackClick(event: MouseEvent) {
  const body = bodyWrapRef.value
  const track = hscrollTrackRef.value
  if (!body || !track) return
  const rect = track.getBoundingClientRect()
  const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
  body.scrollLeft = ratio * (body.scrollWidth - body.clientWidth)
  updateHscroll()
  showHscroll()
}

let resizeObserver: ResizeObserver | null = null
watch(() => [selectedCount.value, useNativeTable.value], () => {
  if (selectedCount.value) void nextTick(updateBarPosition)
})
watch(() => props.rows, () => { void nextTick(updateHscroll) })
onMounted(() => {
  updateBarPosition()
  void nextTick(updateHscroll)
  window.addEventListener('resize', updateBarPosition)
  window.addEventListener('scroll', hideCellTooltip, { capture: true })
  if (rootRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => { updateBarPosition(); updateHscroll() })
    resizeObserver.observe(rootRef.value)
    if (rootRef.value.parentElement) resizeObserver.observe(rootRef.value.parentElement)
  }
})
onBeforeUnmount(() => {
  window.clearTimeout(hideTimer)
  window.removeEventListener('resize', updateBarPosition)
  window.removeEventListener('scroll', hideCellTooltip, { capture: true } as EventListenerOptions)
  resizeObserver?.disconnect()
})
function rowClassName({ row }: { row: any }) {
  const classes: string[] = []
  if (props.clickableRows) classes.push('is-clickable-row')
  if (props.showSelectionBar && (isSelected(row) || elSelectedRows.value.includes(row))) classes.push('is-selected-row')
  return classes.join(' ') || undefined
}
function onNativeRowClick(row: any) {
  emit('row-click', row)
}

function changePage(page: number) {
  if (page >= 1 && page <= pageCount.value && page !== props.page) emit('page-change', page)
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
  <div ref="rootRef" class="performance-management-table" :class="{ 'is-page-scroll': scrollMode === 'page', 'is-ping-left': isPingLeft }" :aria-label="tableAriaLabel" @mouseenter="showHscroll" @mouseleave="scheduleHscrollHide">
    <template v-if="useNativeTable">
      <div class="feishu-table">
        <div ref="headerWrapRef" class="feishu-table__header">
          <table class="feishu-table__table" :style="{ width: '100%', minWidth: `${totalWidth}px` }">
            <colgroup>
              <col v-if="selectable" :style="{ width: `${selectionWidth}px` }">
              <col v-for="column in nativeColumns" :key="column.key" :style="{ width: `${columnWidth(column)}px` }">
            </colgroup>
            <thead>
              <tr>
                <th v-if="selectable" class="feishu-cell feishu-cell--selection is-fixed-left" style="left: 0">
                  <PerformanceCheckbox :model-value="allSelected" :indeterminate="someSelected" label="全选成员" hide-label @update:model-value="toggleAll" />
                </th>
                <th
                  v-for="column in nativeColumns"
                  :key="column.key"
                  class="feishu-cell"
                  :class="{ 'is-fixed-left': column.fixed, 'is-last-fixed': column.fixed && isLastFixed(column), 'is-align-right': column.align === 'right' }"
                  :style="cellStyle(column)"
                >
                  <PerformanceSortHeader
                    v-if="column.sortable"
                    :label="column.label"
                    :order="orderOf(column.key)"
                    :align="column.align === 'right' ? 'right' : 'left'"
                    @click="onSort(column.key)"
                  />
                  <span v-else>{{ column.label }}</span>
                </th>
              </tr>
            </thead>
          </table>
        </div>
        <div ref="bodyWrapRef" class="feishu-table__body" @scroll="onBodyScroll">
          <table class="feishu-table__table" :style="{ width: '100%', minWidth: `${totalWidth}px` }">
            <colgroup>
              <col v-if="selectable" :style="{ width: `${selectionWidth}px` }">
              <col v-for="column in nativeColumns" :key="column.key" :style="{ width: `${columnWidth(column)}px` }">
            </colgroup>
            <tbody>
              <template v-if="loading || !rows.length">
                <tr>
                  <td class="feishu-cell feishu-table__state" :colspan="nativeColumns.length + (selectable ? 1 : 0)">
                    <slot name="empty" :loading="loading" :text="loading ? loadingText : emptyText">
                      <span :role="loading ? 'status' : undefined">{{ loading ? loadingText : emptyText }}</span>
                    </slot>
                  </td>
                </tr>
              </template>
              <template v-else>
                <tr
                  v-for="row in rows"
                  :key="rowKeyOf(row)"
                  class="feishu-row"
                  :class="{ 'is-clickable': clickableRows, 'is-selected-row': isSelected(row) }"
                  @click="onNativeRowClick(row)"
                >
                  <td v-if="selectable" class="feishu-cell feishu-cell--selection is-fixed-left" style="left: 0" @click.stop>
                    <PerformanceCheckbox :model-value="isSelected(row)" :label="`选择${(row as any).display_name || ''}`" hide-label @update:model-value="checked => toggleRow(row, checked)" />
                  </td>
                  <td
                    v-for="column in nativeColumns"
                    :key="column.key"
                    class="feishu-cell"
                    :class="{ 'is-fixed-left': column.fixed, 'is-last-fixed': column.fixed && isLastFixed(column), 'is-align-right': column.align === 'right' }"
                    :style="cellStyle(column)"
                    @mouseenter="onCellEnter"
                    @mouseleave="hideCellTooltip"
                  >
                    <div class="feishu-cell__content"><slot name="cell" :row="row as any" :column="column">{{ (row as any)[column.key] ?? '' }}</slot></div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <div
          v-show="hscrollActive"
          ref="hscrollTrackRef"
          class="feishu-hscroll"
          :class="{ 'is-visible': hscrollVisible }"
          :style="{ bottom: showSelectionBar && selectedCount ? '46px' : '0' }"
          @click="onTrackClick"
        >
          <div
            class="feishu-hscroll__thumb"
            :style="hscrollThumbStyle"
            @pointerdown.stop.prevent="onThumbDown"
            @pointermove="onThumbMove"
            @pointerup="onThumbUp"
            @pointercancel="onThumbUp"
          />
        </div>
      </div>
    </template>

    <template v-else>
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
    </template>

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

    <div v-if="showSelectionBar && selectedCount" class="selection-bar-spacer" aria-hidden="true"></div>
    <Transition name="selection-bar-slide">
      <div v-if="showSelectionBar && selectedCount" class="selection-bar" :style="barStyle" :aria-label="`已选择 ${selectedCount} 条`">
        <slot name="selection-actions" />
        <span class="selection-bar__count">已选择 {{ selectedCount }} 条</span>
        <button type="button" class="selection-bar__clear" @click="clearSelection">清除</button>
      </div>
    </Transition>

    <PerformancePopover :visible="cellTooltip.visible" :anchor="cellTooltip.anchor" width="auto" :gap="8" name="performance-cell-tooltip" @close="hideCellTooltip" @mouseleave="hideCellTooltip">{{ cellTooltip.text }}</PerformancePopover>
  </div>
</template>

<style scoped>
.performance-management-table { min-height: 0; display: flex; flex-direction: column; }
.table-scroll { overflow: visible; }
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
.selection-bar { position: fixed; bottom: 0; z-index: 30; display: flex; align-items: center; gap: 12px; padding: 12px 20px; background: #fff; box-shadow: 0 -1px 0 rgba(31, 35, 41, 0.1); }
.selection-bar-spacer { height: 30px; }
.selection-bar__count { margin-left: 12px; color: #646a73; font-size: 14px; line-height: 22px; }
.selection-bar__clear { padding: 2px 4px; border: 0; border-radius: 6px; background: transparent; color: #1456f0; font: inherit; font-size: 14px; line-height: 18px; cursor: pointer; }
.selection-bar__clear:hover, .selection-bar__clear:focus-visible { background: #eff0f1; outline: 0; }
.selection-bar-slide-enter-active, .selection-bar-slide-leave-active { transition: transform .2s ease, opacity .2s ease; }
.selection-bar-slide-enter-from, .selection-bar-slide-leave-to { transform: translateY(100%); opacity: 0; }
/* 飞书同构原生表格（页面滚动模式） */
.feishu-table { min-width: 0; }
.feishu-table__header { position: sticky; top: calc(20px - var(--performance-table-container-padding, 0px)); z-index: 20; overflow: hidden; border-top: 1px solid rgba(31, 35, 41, 0.15); background: #fff; }
.feishu-table__body { overflow-x: auto; scrollbar-width: none; }
.feishu-table__body::-webkit-scrollbar { display: none; }
.feishu-hscroll { position: sticky; bottom: 0; z-index: 19; height: 10px; margin-top: 2px; opacity: 0; transition: opacity .15s ease; }
.feishu-hscroll.is-visible { opacity: 1; }
.feishu-hscroll__thumb { height: 8px; margin: 1px 0; border-radius: 4px; background: rgba(31, 35, 41, 0.28); cursor: grab; transition: background .15s ease; }
.feishu-hscroll__thumb:hover { background: rgba(31, 35, 41, 0.45); }
.feishu-table__table { table-layout: fixed; border-collapse: separate; border-spacing: 0; }
.feishu-cell { height: 52px; padding: 12px; box-sizing: border-box; border-bottom: 1px solid rgba(31, 35, 41, 0.08); background: #fff; color: #1f2329; font-size: 14px; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.feishu-cell__content { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
thead .feishu-cell { height: 47px; color: #646a73; border-bottom-color: rgba(31, 35, 41, 0.15); }
thead .feishu-cell:hover { background: #f5f6f7; }
.feishu-cell.is-align-right { text-align: right; }
.feishu-cell--selection { padding: 12px; }
.feishu-cell.is-fixed-left { position: sticky; z-index: 2; background: #fff; }
.feishu-cell.is-fixed-left.is-last-fixed::after { content: ''; position: absolute; top: 0; right: -1px; bottom: 0; width: 1px; background: #bbbfc4; box-shadow: 1px 0 2px -2px rgba(31, 35, 41, 0.02), 2px 0 4px 0 rgba(31, 35, 41, 0.02), 2px 0 8px 2px rgba(31, 35, 41, 0.02); display: none; opacity: 0; transition: opacity .3s; }
.is-ping-left .feishu-cell.is-fixed-left.is-last-fixed::after { display: block; opacity: 1; }
thead .feishu-cell.is-fixed-left { z-index: 3; }
.feishu-row:hover > .feishu-cell { background: #f5f6f7; }
.feishu-row { cursor: pointer; }
.feishu-table__state { height: 220px; text-align: center; color: #646a73; }
</style>

<style>
.is-page-scroll .feishu-table__header { position: sticky; top: calc(20px - var(--performance-table-container-padding, 0px)); z-index: 20; }
</style>
