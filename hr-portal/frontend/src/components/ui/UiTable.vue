<template>
  <div
    ref="rootRef"
    class="ui-table"
    :class="{ 'is-sticky-header': stickyHeaderTop !== undefined }"
    :style="stickyHeaderTop !== undefined ? { '--ui-table-sticky-top': `${stickyHeaderTop}px` } : undefined"
    :aria-label="ariaLabel"
  >
    <table class="ui-table__grid" :style="{ minWidth: tableMinWidth }">
      <colgroup>
        <col v-if="selectable" :style="{ width: 'var(--ui-table-selection-width)' }">
        <col v-for="column in columns" :key="column.key" :style="{ width: `${declaredWidth(column)}px` }">
      </colgroup>
      <thead>
        <tr>
          <th
            v-if="selectable"
            class="ui-table__cell ui-table__cell--head ui-table__cell--selection is-fixed-left"
            style="left: 0"
          >
            <input
              type="checkbox"
              :checked="allSelected"
              :indeterminate="someSelected"
              aria-label="全选"
              @click.stop
              @change="toggleAll(($event.target as HTMLInputElement).checked)"
            >
          </th>
          <th
            v-for="(column, index) in columns"
            :key="column.key"
            class="ui-table__cell ui-table__cell--head"
            :class="cellClasses(column)"
            :style="fixedStyle(index)"
            scope="col"
          >
            <button
              v-if="column.sortable"
              type="button"
              class="ui-table__sort-header"
              :class="{ 'is-align-right': column.align === 'right' }"
              :aria-label="`${column.label}，点击切换排序`"
              @click.stop="onSort(column.key)"
            >
              <span class="ui-table__sort-label">{{ column.label }}</span>
              <span class="ui-table__sort-icons" aria-hidden="true">
                <svg viewBox="0 0 24 24" :class="{ 'is-active': sortOrder === 'asc' && sortKey === column.key }"><path d="M11.228 5.376a1 1 0 0 1 1.559 0l8.305 10.334a1 1 0 0 1-.78 1.626H3.703a1 1 0 0 1-.78-1.626l8.306-10.334Z" fill="currentColor" /></svg>
                <svg viewBox="0 0 24 24" :class="{ 'is-active': sortOrder === 'desc' && sortKey === column.key }"><path d="M11.22 18.46a1 1 0 0 0 1.56 0l8.305-10.334a1 1 0 0 0-.78-1.626H3.696a1 1 0 0 0-.78 1.626L11.22 18.46Z" fill="currentColor" /></svg>
              </span>
            </button>
            <template v-else>{{ column.label }}</template>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading || !rows.length" class="ui-table__row ui-table__row--state">
          <td class="ui-table__cell ui-table__state" :colspan="columns.length + (selectable ? 1 : 0)">
            <slot name="empty" :loading="loading" :text="loading ? loadingText : emptyText">
              <span :role="loading ? 'status' : undefined">{{ loading ? loadingText : emptyText }}</span>
            </slot>
          </td>
        </tr>
        <template v-else>
          <tr
            v-for="(row, rowIndex) in rows"
            :key="rowKeyOf(row, rowIndex)"
            class="ui-table__row"
            :class="{ 'is-clickable': clickableRows, 'is-selected': selectable && isRowSelected(row) }"
            @click="emit('row-click', row)"
          >
            <td
              v-if="selectable"
              class="ui-table__cell ui-table__cell--selection is-fixed-left"
              style="left: 0"
              @click.stop
            >
              <input
                type="checkbox"
                :checked="isRowSelected(row)"
                :disabled="Boolean(isRowSelectable && !isRowSelectable(row))"
                :aria-label="`选择${(row as any)[selectionLabelKey] ?? rowKeyOf(row, rowIndex)}`"
                @change="toggleRow(row, ($event.target as HTMLInputElement).checked)"
              >
            </td>
            <td
              v-for="(column, index) in columns"
              :key="column.key"
              class="ui-table__cell"
              :class="cellClasses(column)"
              :style="fixedStyle(index)"
            >
              <div class="ui-table__cell-content">
                <slot name="cell" :row="row" :column="column" :value="(row as any)[column.key]">
                  {{ displayValue((row as any)[column.key]) }}
                </slot>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

/**
 * UiTable —— 全局唯一的表格渲染内核。
 *
 * 规格基准：REA 实测（飞书人事 smb 线 + 飞书绩效 ud__table 线）。
 * - 表头 #f2f3f5（token 可覆盖，绩效线白底）、行高 51、分隔线 rgba(31,35,41,.15)
 * - 固定列 sticky、无投影（REA 全线无投影）；偏移按表头实测宽度累加
 * - 表格自身永不纵向滚动：数据量由外层滚动或分页承载（REA 两线一致，无内滚）
 * - 表头吸顶：可选（stickyHeaderTop），对齐 REA 绩效 v2 线「头体分离 + 业务 sticky top」
 *   的能力形态；smb 线不传即完全不吸顶
 * - 多选列 / 列排序：对齐 REA 绩效成员列表（p4）的表格能力
 *
 * 分页 / 工具栏 / 搜索属能力壳（UiPagination 或业务层），不在内核内。
 */
export interface UiTableColumn {
  key: string
  label: string
  width?: number
  minWidth?: number
  align?: 'left' | 'right'
  fixed?: 'left' | 'right'
  sortable?: boolean
}

const props = withDefaults(defineProps<{
  columns: UiTableColumn[]
  rows: unknown[]
  rowKey?: string | ((row: any, index: number) => string | number)
  loading?: boolean
  loadingText?: string
  emptyText?: string
  ariaLabel?: string
  clickableRows?: boolean
  /** 空值占位符 */
  placeholder?: string
  /** 表格最小宽度；低于该宽度由外层容器横向滚动 */
  minWidth?: number
  /** 表头吸顶偏移；不传 = 不吸顶（smb 线），传数字 = 吸顶（绩效 v2 线 sticky top:N） */
  stickyHeaderTop?: number
  /** 多选列（REA 绩效成员列表形态） */
  selectable?: boolean
  selectionKey?: string
  isRowSelectable?: (row: any) => boolean
  /** 受控选中键集合；不传则组件内部托管 */
  selectedKeys?: string[]
  /** 多选行 checkbox 的 aria-label 取值字段 */
  selectionLabelKey?: string
  /** 列排序（受控）：sortKey + sortOrder('asc'|'desc'|'') */
  sortKey?: string
  sortOrder?: 'asc' | 'desc' | ''
}>(), {
  rowKey: 'id',
  loading: false,
  loadingText: '加载中',
  emptyText: '暂无数据',
  ariaLabel: '数据表格',
  clickableRows: false,
  placeholder: '--',
  minWidth: 0,
  stickyHeaderTop: undefined,
  selectable: false,
  selectionKey: 'id',
  isRowSelectable: undefined,
  selectedKeys: undefined,
  selectionLabelKey: 'display_name',
  sortKey: '',
  sortOrder: '',
})

const emit = defineEmits<{
  'row-click': [row: any]
  'update:selectedKeys': [keys: string[]]
  'selection-change': [rows: any[]]
  'sort-change': [payload: { key: string; order: 'asc' | 'desc' | '' }]
}>()

defineSlots<{
  /** 单元格插槽；未提供时显示 row[column.key]，空值显示 placeholder */
  cell?: (props: { row: any; column: UiTableColumn; value: any }) => any
  /** 空/加载态插槽 */
  empty?: (props: { loading: boolean; text: string }) => any
}>()

const rootRef = ref<HTMLElement>()
/** 表头实测宽度，用于固定列偏移；未测量到（SSR/测试）时回退到声明宽度 */
const measuredWidths = ref<number[]>([])
let observer: ResizeObserver | undefined

function declaredWidth(column: UiTableColumn) {
  return column.width ?? column.minWidth ?? 160
}

function offsetWidth(index: number, column: UiTableColumn) {
  const measured = measuredWidths.value[index]
  return measured && measured > 0 ? measured : declaredWidth(column)
}

const tableMinWidth = computed(() => {
  const selection = props.selectable ? 40 : 0
  return `${Math.max(props.minWidth, selection + props.columns.reduce((sum, column) => sum + declaredWidth(column), 0))}px`
})

function measure() {
  measuredWidths.value = Array.from(
    rootRef.value?.querySelectorAll('thead th') ?? [],
    cell => cell.getBoundingClientRect().width,
  )
}

function observeColumns() {
  if (typeof ResizeObserver === 'undefined') return
  observer?.disconnect()
  void nextTick(() => {
    measure()
    rootRef.value?.querySelectorAll('thead th').forEach(cell => observer?.observe(cell))
  })
}

onMounted(() => {
  if (typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver(measure)
  observeColumns()
})
watch(() => [props.columns, props.selectable], observeColumns, { deep: true })
onBeforeUnmount(() => observer?.disconnect())

function rowKeyOf(row: any, index: number) {
  if (typeof props.rowKey === 'function') return props.rowKey(row, index)
  const key = row?.[props.rowKey]
  return key === undefined || key === null || key === '' ? `row-${index}` : String(key)
}

function displayValue(value: unknown) {
  if (value === undefined || value === null || value === '') return props.placeholder
  return value
}

function cellClasses(column: UiTableColumn) {
  return {
    'is-align-right': column.align === 'right',
    'is-fixed-left': column.fixed === 'left',
    'is-fixed-right': column.fixed === 'right',
  }
}

/** 固定列偏移；多选列固定在最左（left:0），业务列偏移从多选列宽起算 */
function fixedStyle(index: number) {
  const column = props.columns[index]
  if (!column?.fixed) return undefined
  const side = column.fixed
  let offset = props.selectable ? 40 : 0
  for (let position = 0; position < props.columns.length; position += 1) {
    const other = props.columns[position]
    if (other.fixed !== side) continue
    if (side === 'left' ? position >= index : position <= index) continue
    offset += offsetWidth(position, other)
  }
  return { [side]: `${offset}px` }
}

/* ---- 多选（受控优先，未传 selectedKeys 时内部托管） ---- */
const selectionKeyOf = (row: any) => String(row?.[props.selectionKey] ?? '')
const internalKeys = ref<string[]>([])
const selectedKeyList = computed(() => props.selectedKeys ?? internalKeys.value)
const selectedKeySet = computed(() => new Set(selectedKeyList.value))
const selectableRows = computed(() => props.rows.filter(row => !props.isRowSelectable || props.isRowSelectable(row)))
const allSelected = computed(() => selectableRows.value.length > 0 && selectableRows.value.every(row => selectedKeySet.value.has(selectionKeyOf(row))))
const someSelected = computed(() => selectedKeyList.value.length > 0 && !allSelected.value)

function isRowSelected(row: any) {
  return selectedKeySet.value.has(selectionKeyOf(row))
}

function commitSelection(nextKeys: string[]) {
  internalKeys.value = nextKeys
  emit('update:selectedKeys', nextKeys)
  emit('selection-change', props.rows.filter(row => nextKeys.includes(selectionKeyOf(row))))
}

function toggleRow(row: any, checked: boolean) {
  if (props.isRowSelectable && !props.isRowSelectable(row)) return
  const key = selectionKeyOf(row)
  const next = selectedKeyList.value.filter(item => item !== key)
  if (checked) next.push(key)
  commitSelection(next)
}

function toggleAll(checked: boolean) {
  const next = new Set(selectedKeyList.value)
  if (checked) selectableRows.value.forEach(row => next.add(selectionKeyOf(row)))
  else selectableRows.value.forEach(row => next.delete(selectionKeyOf(row)))
  commitSelection([...next])
}

/* ---- 列排序：新列先降序（对齐 REA/antd 习惯），同列 desc→asc→取消 ---- */
function onSort(key: string) {
  let order: 'asc' | 'desc' | ''
  if (props.sortKey !== key) order = 'desc'
  else if (props.sortOrder === 'desc') order = 'asc'
  else order = ''
  emit('sort-change', { key, order })
}
</script>

<style scoped>
.ui-table {
  min-width: 0;
}
.ui-table__grid {
  width: 100%;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
  background: var(--ui-surface-background);
}
.ui-table__cell {
  height: var(--ui-table-row-height);
  padding: var(--ui-table-cell-padding-inline);
  box-sizing: border-box;
  border-bottom: 1px solid var(--ui-table-border-color);
  background: var(--ui-surface-background);
  color: var(--ui-table-text-color);
  font-size: var(--ui-table-font-size);
  font-weight: 400;
  line-height: var(--ui-table-line-height);
  text-align: left;
  vertical-align: middle;
  white-space: nowrap;
}
.ui-table__cell--head {
  height: var(--ui-table-header-height);
  border-bottom: 0;
  background: var(--ui-table-header-background);
  color: var(--ui-table-header-color);
}
.ui-table__cell--selection {
  padding: 0 4px 0 12px;
  overflow: visible;
}
.ui-table__cell--selection input[type='checkbox'] {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--ui-pagination-active-color);
  cursor: pointer;
}
.ui-table__cell--selection input[type='checkbox']:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
.ui-table__cell.is-align-right { text-align: right; }
.ui-table__cell.is-fixed-left { position: sticky; z-index: 2; }
.ui-table__cell.is-fixed-right { position: sticky; z-index: 2; }
.ui-table__cell--head.is-fixed-left,
.ui-table__cell--head.is-fixed-right { z-index: 4; }
/* 表头吸顶（可选能力，对齐 REA 绩效 v2 线）：单表 + th sticky，与固定列 z-index 分层 */
.ui-table.is-sticky-header thead .ui-table__cell--head {
  position: sticky;
  top: var(--ui-table-sticky-top, 0px);
  z-index: 3;
}
.ui-table.is-sticky-header thead .ui-table__cell--head.is-fixed-left,
.ui-table.is-sticky-header thead .ui-table__cell--head.is-fixed-right { z-index: 5; }
.ui-table__sort-header {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  max-width: 100%;
  min-width: 0;
  height: var(--ui-table-sort-header-height);
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: var(--ui-table-sort-header-height);
  text-align: left;
  cursor: pointer;
}
.ui-table__sort-header.is-align-right { justify-content: flex-end; }
.ui-table__sort-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ui-table__sort-icons {
  display: flex;
  flex: 0 0 10px;
  flex-direction: column;
  width: 10px;
  height: 17px;
  margin-left: 8px;
  color: var(--ui-table-header-color);
}
.ui-table__sort-icons svg {
  display: block;
  flex: 0 0 10px;
  width: 10px;
  height: 10px;
  opacity: 0.35;
}
.ui-table__sort-icons svg + svg { margin-top: -3px; }
.ui-table__sort-icons svg.is-active { opacity: 1; }
.ui-table__sort-header:hover .ui-table__sort-icons svg { opacity: 0.7; }
.ui-table__sort-header:hover .ui-table__sort-icons svg.is-active { opacity: 1; }
.ui-table__cell-content {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 行 hover 仅作用于数据行；空态/加载态行（--state）不响应 hover */
.ui-table__row:not(.ui-table__row--state):hover > .ui-table__cell { background: var(--ui-table-row-hover-background); }
.ui-table__row.is-clickable { cursor: pointer; }
.ui-table__row.is-selected > .ui-table__cell { background: var(--ui-pagination-hover-background); }
.ui-table__state {
  height: var(--ui-table-empty-height);
  color: var(--ui-table-header-color);
  text-align: center;
}
</style>
