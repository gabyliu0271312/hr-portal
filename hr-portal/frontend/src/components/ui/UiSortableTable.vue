<script setup lang="ts">
import { ref } from 'vue'
import UiSortableList from './UiSortableList.vue'
import UiDragHandle from './UiDragHandle.vue'

export interface UiSortableColumn {
  key: string
  label: string
  width?: number
  minWidth?: number
  align?: 'left' | 'right'
}

const props = withDefaults(defineProps<{
  columns: UiSortableColumn[]
  rows: object[]
  rowKey?: string | ((row: any, index: number) => string)
  loading?: boolean
  loadingText?: string
  emptyText?: string
  ariaLabel?: string
  stickyHeaderTop?: number | string
  disabled?: boolean
  /** 拖拽手柄宽度（含间距），默认 32px */
  dragWidth?: number
}>(), {
  rowKey: 'id',
  loading: false,
  loadingText: '加载中',
  emptyText: '暂无数据',
  ariaLabel: '可排序表格',
  stickyHeaderTop: undefined,
  disabled: false,
  dragWidth: 32,
})

const emit = defineEmits<{
  reorder: [from: number, to: number]
  'row-click': [row: any]
}>()

defineSlots<{
  cell?: (props: { row: any; column: UiSortableColumn; value: any }) => any
  empty?: (props: { loading: boolean; text: string }) => any
}>()

function keyOf(row: any, index: number) {
  if (typeof props.rowKey === 'function') return props.rowKey(row, index)
  const value = row?.[props.rowKey]
  return value === undefined || value === null || value === '' ? `row-${index}` : String(value)
}

function declaredWidth(column: UiSortableColumn) {
  return column.width ?? column.minWidth ?? 160
}

function displayValue(value: unknown) {
  if (value === undefined || value === null || value === '') return '--'
  return value
}

function cellAlign(column: UiSortableColumn) {
  return column.align === 'right' ? 'is-align-right' : ''
}

function onReorder(from: number, to: number) {
  emit('reorder', from, to)
}
</script>

<template>
  <div
    class="ui-sortable-table"
    :class="{ 'is-sticky-header': stickyHeaderTop !== undefined }"
    :style="stickyHeaderTop !== undefined ? { '--ui-sortable-sticky-top': typeof stickyHeaderTop === 'number' ? `${stickyHeaderTop}px` : stickyHeaderTop } : undefined"
    :aria-label="ariaLabel"
  >
    <div class="ui-sortable-table__header" aria-hidden="true">
      <div class="ui-sortable-table__cell ui-sortable-table__cell--drag" :style="{ width: `${dragWidth}px` }"></div>
      <div
        v-for="column in columns"
        :key="column.key"
        class="ui-sortable-table__cell ui-sortable-table__cell--head"
        :class="cellAlign(column)"
        :style="{ width: `${declaredWidth(column)}px` }"
      >{{ column.label }}</div>
    </div>

    <div v-if="loading || !rows.length" class="ui-sortable-table__state">
      <slot name="empty" :loading="loading" :text="loading ? loadingText : emptyText">
        <span :role="loading ? 'status' : undefined">{{ loading ? loadingText : emptyText }}</span>
      </slot>
    </div>

    <UiSortableList
      v-else
      :items="rows"
      :item-key="keyOf"
      :disabled="disabled"
      :gap="0"
      class="ui-sortable-table__body"
      @reorder="onReorder"
    >
      <template #default="{ item: row, index, dragging, itemStyle }">
        <div
          class="ui-sortable-table__row"
          :class="{ 'is-dragging': dragging }"
          :style="itemStyle"
          :data-sortable-index="index"
          @click="emit('row-click', row)"
        >
          <div class="ui-sortable-table__cell ui-sortable-table__cell--drag" :style="{ width: `${dragWidth}px` }">
            <UiDragHandle :label="`拖拽第${index + 1}行`" :dragging="dragging" :disabled="disabled" />
          </div>
          <div
            v-for="column in columns"
            :key="column.key"
            class="ui-sortable-table__cell"
            :class="cellAlign(column)"
            :style="{ width: `${declaredWidth(column)}px` }"
          >
            <div class="ui-sortable-table__cell-content">
              <slot name="cell" :row="row" :column="column" :value="(row as any)[column.key]">
                {{ displayValue((row as any)[column.key]) }}
              </slot>
            </div>
          </div>
        </div>
      </template>
    </UiSortableList>
  </div>
</template>

<style scoped>
/* 视觉完全对齐 UiTable token（--ui-table-*）：表头 46 #f2f3f5/#646a73、行高 51、cell padding 12、分隔线、hover。 */
.ui-sortable-table { min-width: 0; }
.ui-sortable-table.is-sticky-header > .ui-sortable-table__header {
  position: sticky;
  top: var(--ui-sortable-sticky-top, 0px);
  z-index: var(--ui-table-header-z-index, 20);
  background: var(--ui-table-header-background);
}
.ui-sortable-table__header {
  display: flex;
  align-items: center;
  min-width: 0;
  border-top: 1px solid var(--ui-table-border-color);
  border-bottom: 1px solid var(--ui-table-border-color);
  background: var(--ui-table-header-background);
  color: var(--ui-table-header-color);
}
.ui-sortable-table__row {
  display: flex;
  align-items: center;
  min-width: 0;
  border-bottom: 1px solid var(--ui-table-border-color);
  background: var(--ui-surface-background);
}
.ui-sortable-table__row:hover { background: var(--ui-table-row-hover-background); }
.ui-sortable-table__row.is-dragging {
  position: relative;
  z-index: var(--ui-table-fixed-z-index, 2);
  background: var(--ui-surface-background);
  box-shadow: 0 2px 8px rgba(31, 35, 41, 0.12);
}
.ui-sortable-table__cell {
  height: var(--ui-table-row-height);
  padding: var(--ui-table-cell-padding-inline);
  box-sizing: border-box;
  color: var(--ui-table-text-color);
  font-size: var(--ui-table-font-size);
  font-weight: 400;
  line-height: var(--ui-table-line-height);
  text-align: left;
  white-space: nowrap;
}
.ui-sortable-table__cell--head {
  height: var(--ui-table-header-height);
  font-weight: 400;
}
.ui-sortable-table__cell--drag {
  flex: 0 0 auto;
  padding: 0 0 0 var(--ui-table-cell-padding-inline);
  display: flex;
  align-items: center;
  min-width: 0;
  overflow: visible;
}
.ui-sortable-table__cell--drag :deep(.performance-drag-handle) { flex: 0 0 16px; width: 16px; margin-right: 4px; }
.ui-sortable-table__cell.is-align-right { text-align: right; }
.ui-sortable-table__cell-content { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.ui-sortable-table__state { height: var(--ui-table-empty-height); display: flex; align-items: center; justify-content: center; color: var(--ui-table-placeholder-color); border-bottom: 1px solid var(--ui-table-border-color); background: var(--ui-surface-background); }
</style>
