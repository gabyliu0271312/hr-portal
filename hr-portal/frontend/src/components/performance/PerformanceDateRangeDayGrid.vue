<template>
  <div class="performance-date-range-picker__body">
    <div class="performance-date-range-picker__weeks" aria-hidden="true">
      <span v-for="week in weeks" :key="week" class="performance-date-range-picker__week">{{ week }}</span>
    </div>
    <div class="performance-date-range-picker__grid" role="grid">
      <button
        v-for="cell in cells"
        :key="cell.key"
        class="performance-date-range-picker__cell"
        :class="cellClasses(cell)"
        type="button"
        role="gridcell"
        :aria-selected="cell.date === start || cell.date === end"
        :aria-label="cell.date"
        @click="emit('pick', cell.date)"
        @mouseenter="emit('hover', cell.date)"
        @mouseleave="emit('hover', null)"
      >
        <span class="performance-date-range-picker__cell-inner">{{ cell.day }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { rangeBand, type DateCell } from './performanceDateRange'

const weeks = ['日', '一', '二', '三', '四', '五', '六']

const props = defineProps<{
  cells: DateCell[]
  start: string
  end: string
  hover: string | null
  today: string
}>()

const emit = defineEmits<{
  pick: [date: string]
  hover: [date: string | null]
}>()

function cellClasses(cell: DateCell) {
  const band = rangeBand(cell.date, props.start, props.end, props.hover)
  return {
    'is-out': cell.out,
    'is-today': cell.date === props.today,
    'is-selected': cell.date === props.start || cell.date === props.end,
    'is-range-start': band === 'start',
    'is-range-middle': band === 'middle',
    'is-range-end': band === 'end',
    'is-preview': band !== '' && !props.end,
  }
}
</script>

<style scoped>
.performance-date-range-picker__body { display: flex; flex-direction: column; height: var(--performance-date-panel-body-height); }
.performance-date-range-picker__weeks { display: grid; grid-template-columns: repeat(7, var(--performance-date-panel-cell-size)); column-gap: var(--performance-date-panel-weeks-gap); margin-bottom: var(--performance-date-panel-weeks-gap); }
.performance-date-range-picker__week { display: flex; align-items: center; justify-content: center; width: var(--performance-date-panel-cell-size); height: var(--performance-date-panel-cell-size); color: var(--performance-date-panel-muted-color); font-size: var(--font-size-xs); line-height: var(--performance-date-panel-cell-size); }
.performance-date-range-picker__grid { display: grid; flex: 1; grid-template-columns: repeat(7, var(--performance-date-panel-cell-size)); grid-auto-rows: var(--performance-date-panel-cell-size); column-gap: var(--performance-date-panel-weeks-gap); align-content: space-between; }
.performance-date-range-picker__cell { position: relative; display: flex; align-items: center; justify-content: center; width: var(--performance-date-panel-cell-size); height: var(--performance-date-panel-cell-size); padding: 0; border: 0; background: transparent; color: var(--color-text-primary); font: inherit; cursor: pointer; }
.performance-date-range-picker__cell::before { position: absolute; top: 0; bottom: 0; content: ''; background: var(--performance-date-panel-range-background); opacity: 0; }
.performance-date-range-picker__cell.is-range-start::before, .performance-date-range-picker__cell.is-range-end::before, .performance-date-range-picker__cell.is-range-middle::before { opacity: 1; }
.performance-date-range-picker__cell.is-range-start::before { left: 50%; right: 0; }
.performance-date-range-picker__cell.is-range-end::before { left: 0; right: 50%; }
.performance-date-range-picker__cell.is-range-middle::before { left: 0; right: 0; }
.performance-date-range-picker__cell.is-preview::before { background: var(--performance-date-panel-range-preview-background); }
.performance-date-range-picker__cell-inner { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; width: var(--performance-date-panel-cell-size); height: var(--performance-date-panel-cell-size); border-radius: var(--performance-date-panel-cell-radius); color: inherit; font-size: var(--font-size-md); line-height: var(--performance-date-panel-cell-size); transition: background-color var(--duration-base) var(--ease-standard); }
.performance-date-range-picker__cell:hover .performance-date-range-picker__cell-inner { background: var(--performance-date-panel-range-background); }
.performance-date-range-picker__cell.is-out { color: var(--performance-date-panel-muted-color); }
.performance-date-range-picker__cell.is-today .performance-date-range-picker__cell-inner { border: var(--performance-popover-border-width) solid var(--performance-date-panel-today-border); box-sizing: border-box; color: var(--performance-date-panel-today-border); }
.performance-date-range-picker__cell.is-selected .performance-date-range-picker__cell-inner, .performance-date-range-picker__cell.is-selected:hover .performance-date-range-picker__cell-inner { border: 0; background: var(--performance-date-panel-selected-background); color: var(--color-bg-card); }
.performance-date-range-picker__cell.is-selected { z-index: 2; }
</style>
