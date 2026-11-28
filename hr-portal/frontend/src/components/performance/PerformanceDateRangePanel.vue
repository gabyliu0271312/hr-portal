<template>
  <template v-if="mode === 'date'">
    <div v-for="(month, index) in months" :key="month.key" class="performance-date-range-picker__month">
      <div class="performance-date-range-picker__header">
        <div class="performance-date-range-picker__nav">
          <template v-if="index === 0">
            <button class="performance-date-range-picker__nav-btn" type="button" aria-label="上一年" @click="emit('shift-year', -1)">
              <svg viewBox="0 0 24 24" fill="none" width="1em" height="1em"><path d="m11 6-6 6 6 6M18 6l-6 6 6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
            <button class="performance-date-range-picker__nav-btn" type="button" aria-label="上一月" @click="emit('shift-month', -1)">
              <svg viewBox="0 0 24 24" fill="none" width="1em" height="1em"><path d="m15 6-6 6 6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
          </template>
          <span v-else class="performance-date-range-picker__nav-placeholder"></span>
          <span v-if="index === 1" class="performance-date-range-picker__nav-placeholder"></span>
        </div>
        <div class="performance-date-range-picker__title">
          <button class="performance-date-range-picker__title-btn" type="button" @click="emit('set-mode', 'year')">{{ month.year }}年</button>
          <button class="performance-date-range-picker__title-btn" type="button" @click="emit('set-mode', 'month')">{{ month.month }}月</button>
          <button class="performance-date-range-picker__collapse-btn" type="button" aria-label="展开月份选择" @click="emit('set-mode', 'month')">
            <svg viewBox="0 0 24 24" fill="none" width="1em" height="1em"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>
        </div>
        <div class="performance-date-range-picker__nav performance-date-range-picker__nav--end">
          <span v-if="index === 0" class="performance-date-range-picker__nav-placeholder"></span>
          <span v-if="index === 0" class="performance-date-range-picker__nav-placeholder"></span>
          <template v-if="index === 1">
            <button class="performance-date-range-picker__nav-btn" type="button" aria-label="下一月" @click="emit('shift-month', 1)">
              <svg viewBox="0 0 24 24" fill="none" width="1em" height="1em"><path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
            <button class="performance-date-range-picker__nav-btn" type="button" aria-label="下一年" @click="emit('shift-year', 1)">
              <svg viewBox="0 0 24 24" fill="none" width="1em" height="1em"><path d="m13 6 6 6-6 6M6 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
          </template>
        </div>
      </div>
      <PerformanceDateRangeDayGrid
        :cells="month.cells"
        :start="start"
        :end="end"
        :hover="hover"
        :today="today"
        @pick="emit('pick-date', $event)"
        @hover="emit('hover-date', $event)"
      />
    </div>
  </template>
  <div v-else class="performance-date-range-picker__mode" :class="`performance-date-range-picker__mode--${mode}`">
    <div class="performance-date-range-picker__header performance-date-range-picker__header--mode">
      <div class="performance-date-range-picker__mode-title">
        <template v-if="mode === 'month'">
          <button class="performance-date-range-picker__title-btn" type="button" @click="emit('set-mode', 'year')">{{ viewYear }}年</button>
          <span class="performance-date-range-picker__title-text">{{ viewMonth + 1 }}月</span>
          <button class="performance-date-range-picker__collapse-btn" type="button" aria-label="展开年份选择" @click="emit('set-mode', 'year')">
            <svg viewBox="0 0 24 24" fill="none" width="1em" height="1em"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>
        </template>
        <span v-else class="performance-date-range-picker__title-text">{{ yearBlock }} - {{ yearBlock + YEAR_BLOCK_SIZE - 1 }}</span>
      </div>
      <div class="performance-date-range-picker__nav performance-date-range-picker__nav--mode">
        <button class="performance-date-range-picker__nav-btn" type="button" :aria-label="mode === 'month' ? '上一年' : '上二十年'" @click="emit('shift-mode', -1)">
          <svg viewBox="0 0 24 24" fill="none" width="1em" height="1em"><path d="m11 6-6 6 6 6M18 6l-6 6 6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
        <button class="performance-date-range-picker__nav-btn" type="button" :aria-label="mode === 'month' ? '下一年' : '下二十年'" @click="emit('shift-mode', 1)">
          <svg viewBox="0 0 24 24" fill="none" width="1em" height="1em"><path d="m13 6 6 6-6 6M6 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
      </div>
    </div>
    <PerformanceDateRangeModeGrid :mode="mode" :cells="modeCells" @pick="emit('pick-mode', $event)" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import PerformanceDateRangeDayGrid from './PerformanceDateRangeDayGrid.vue'
import PerformanceDateRangeModeGrid, { type ModeCell } from './PerformanceDateRangeModeGrid.vue'
import { YEAR_BLOCK_SIZE, type MonthView, type PanelMode } from './performanceDateRange'

const props = defineProps<{
  mode: PanelMode
  months: MonthView[]
  viewYear: number
  viewMonth: number
  yearBlock: number
  start: string
  end: string
  hover: string | null
  today: string
}>()

const emit = defineEmits<{
  'set-mode': [mode: PanelMode]
  'shift-month': [delta: number]
  'shift-year': [delta: number]
  'shift-mode': [delta: number]
  'pick-date': [date: string]
  'hover-date': [date: string | null]
  'pick-mode': [value: number]
}>()

const modeCells = computed<ModeCell[]>(() => {
  if (props.mode === 'month') {
    return Array.from({ length: 12 }, (_, index) => ({ value: index, label: `${index + 1}月` }))
  }
  return Array.from({ length: YEAR_BLOCK_SIZE }, (_, index) => {
    const year = props.yearBlock + index
    return { value: year, label: String(year) }
  })
})
</script>

<style scoped>
.performance-date-range-picker__month { width: var(--performance-date-panel-width); }
.performance-date-range-picker__header { display: flex; align-items: center; justify-content: space-between; padding: 0 0 var(--performance-date-panel-header-gap) var(--spacing-2); }
.performance-date-range-picker__header--mode { padding-left: var(--spacing-2); }
.performance-date-range-picker__nav { display: flex; align-items: center; flex: none; gap: var(--spacing-1); }
.performance-date-range-picker__nav--mode { gap: var(--performance-date-mode-nav-gap); }
.performance-date-range-picker__nav-placeholder { width: var(--performance-date-panel-nav-size); height: var(--performance-date-panel-nav-size); }
.performance-date-range-picker__nav-btn { display: grid; place-items: center; width: var(--performance-date-panel-nav-size); height: var(--performance-date-panel-nav-size); padding: 0; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-tertiary); font-size: var(--performance-date-panel-nav-size); cursor: pointer; transition: color var(--duration-fast) var(--ease-standard); }
.performance-date-range-picker__nav-btn:hover { color: var(--performance-control-focus-border); }
.performance-date-range-picker__title { display: flex; flex: 1; justify-content: center; align-items: center; gap: var(--spacing-1); color: var(--color-text-primary); font-size: var(--font-size-md); font-weight: var(--font-weight-medium); line-height: var(--performance-input-line-height); white-space: nowrap; }
.performance-date-range-picker__title-btn, .performance-date-range-picker__title-text { padding: 0; border: 0; background: transparent; color: inherit; font: inherit; line-height: inherit; white-space: nowrap; }
.performance-date-range-picker__title-btn { cursor: pointer; }
.performance-date-range-picker__title-btn:hover { color: var(--performance-control-focus-border); }
.performance-date-range-picker__collapse-btn { display: grid; place-items: center; width: var(--performance-date-panel-nav-size); height: var(--performance-date-panel-nav-size); padding: 0; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-tertiary); font-size: var(--performance-date-panel-nav-size); cursor: pointer; }
.performance-date-range-picker__collapse-btn:hover { color: var(--performance-control-focus-border); }
.performance-date-range-picker__mode { width: var(--performance-date-panel-width); }
.performance-date-range-picker__mode-title { display: flex; align-items: center; flex: 1; gap: var(--spacing-1); color: var(--color-text-primary); font-size: var(--font-size-md); font-weight: var(--font-weight-medium); line-height: var(--performance-input-line-height); white-space: nowrap; }
</style>
