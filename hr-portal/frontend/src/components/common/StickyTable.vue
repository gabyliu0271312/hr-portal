<template>
  <div class="sticky-table">
    <table ref="table" class="sticky-table__grid" :style="{ minWidth: `${tableMinWidth}px` }">
      <colgroup>
        <col v-for="col in columns" :key="col.key ?? col.label" :style="{ width: `${col.width ?? col.minWidth ?? 150}px` }" />
      </colgroup>
      <thead>
        <tr>
          <th
            v-for="(col, index) in columns"
            :key="col.key ?? col.label"
            scope="col"
            class="sticky-table__cell sticky-table__cell--header"
            :class="stickyClass(col)"
            :style="stickyStyle(index)"
          >{{ col.label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in rows" :key="rowKey(row, i)" class="sticky-table__row">
          <td
            v-for="(col, index) in columns"
            :key="col.key ?? col.label"
            class="sticky-table__cell"
            :class="stickyClass(col)"
            :style="stickyStyle(index)"
          >
            <slot :name="col.slot ?? 'default'" :row="row" :column="col">{{ col.key ? (row[col.key] ?? '--') : '--' }}</slot>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length" class="sticky-table__empty"><slot name="empty">{{ emptyText }}</slot></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  columns: Array<{
    key?: string
    label: string
    width?: number
    minWidth?: number
    fixed?: 'left' | 'right'
    slot?: string
  }>
  rows: Record<string, any>[]
  rowKey?: (row: Record<string, any>, index: number) => string | number
  emptyText?: string
}>(), {
  rowKey: (row: Record<string, any>, index: number) => index,
  emptyText: '暂无数据',
})

const table = ref<HTMLTableElement>()
const widths = ref<number[]>([])
const tableMinWidth = computed(() => props.columns.reduce((sum, col) => sum + (col.width ?? col.minWidth ?? 150), 0))
let observer: ResizeObserver | undefined

function measure() {
  widths.value = Array.from(table.value?.querySelectorAll('thead th') ?? [], cell => cell.getBoundingClientRect().width)
}

async function observeColumns() {
  await nextTick()
  observer?.disconnect()
  measure()
  table.value?.querySelectorAll('thead th').forEach(cell => observer?.observe(cell))
}

onMounted(() => {
  observer = new ResizeObserver(measure)
  observeColumns()
})
watch(() => props.columns, observeColumns, { deep: true })
onBeforeUnmount(() => observer?.disconnect())

function stickyClass(col: { fixed?: 'left' | 'right' }): string {
  return col.fixed === 'left' ? 'sticky-table__cell--fix-left' : col.fixed === 'right' ? 'sticky-table__cell--fix-right' : ''
}

function stickyStyle(index: number) {
  const side = props.columns[index]?.fixed
  if (!side) return undefined
  const offset = props.columns.reduce((sum, col, i) => {
    if (col.fixed !== side || (side === 'left' ? i >= index : i <= index)) return sum
    return sum + (widths.value[i] || col.width || col.minWidth || 150)
  }, 0)
  return { [side]: `${offset}px` }
}

defineSlots<{
  default?: (props: { row: Record<string, any>; column: Record<string, any> }) => any
  empty?: () => any
  [name: string]: any
}>()
</script>

<style scoped>
.sticky-table { width: 100%; min-width: 0; flex: 1 1; min-height: 0; overflow: auto; }
.sticky-table__grid { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0; font: 400 14px/22px var(--font-sans); color: #1f2329; }
.sticky-table__cell { box-sizing: border-box; height: 51px; padding: 12px; border-bottom: 1px solid rgba(31, 35, 41, 0.15); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sticky-table__cell--fix-left, .sticky-table__cell--fix-right { position: sticky; z-index: 2; background: #fff; }
.sticky-table__cell--fix-left::after, .sticky-table__cell--fix-right::after { content: ''; position: absolute; top: 0; bottom: 0; width: 1px; background: #dee0e3; }
.sticky-table__cell--fix-left::after { right: 0; }
.sticky-table__cell--fix-right::after { left: 0; }
.sticky-table__cell--header { position: sticky; top: 0; z-index: 3; background: #f2f3f5; color: #646a73; font-weight: 400; }
.sticky-table__cell--header.sticky-table__cell--fix-left, .sticky-table__cell--header.sticky-table__cell--fix-right { z-index: 4; background: #f2f3f5; }
.sticky-table__row:hover > td { background: #eff0f1; }
.sticky-table__empty { padding: 32px 12px; text-align: center; color: var(--color-text-placeholder); }
</style>
