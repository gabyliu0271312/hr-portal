<template>
  <div ref="root" class="performance-date-range-picker" :class="{ 'is-open': open, 'is-disabled': disabled }">
    <div
      class="performance-date-range-picker__control"
      role="group"
      :aria-label="ariaLabel"
      @click="toggle"
      @keydown.esc.stop="closePanel"
    >
      <input
        class="performance-date-range-picker__input"
        :value="displayStart"
        :placeholder="startPlaceholder"
        :aria-label="`${ariaLabel}开始日期`"
        :disabled="disabled"
        readonly
      />
      <span class="performance-date-range-picker__separator" aria-hidden="true"></span>
      <input
        class="performance-date-range-picker__input"
        :value="displayEnd"
        :placeholder="endPlaceholder"
        :aria-label="`${ariaLabel}结束日期`"
        :disabled="disabled"
        readonly
      />
      <span class="performance-date-range-picker__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" width="1em" height="1em">
          <rect x="4" y="5.5" width="16" height="15" rx="2" stroke="currentColor" stroke-width="1.6" />
          <path d="M4 10h16M8 3.5v4M16 3.5v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      </span>
    </div>
    <Teleport to="body">
      <div
        v-if="open"
        ref="panel"
        class="performance-date-range-picker__panel"
        :class="{ 'is-mode': panelMode !== 'date' }"
        :style="panelStyle"
        role="dialog"
        :aria-label="`${ariaLabel}日期面板`"
      >
        <PerformanceDateRangePanel
          :mode="panelMode"
          :months="months"
          :view-year="viewYear"
          :view-month="viewMonth"
          :year-block="yearBlock"
          :start="start"
          :end="end"
          :hover="hover"
          :today="today"
          @set-mode="setMode"
          @shift-month="shiftMonth"
          @shift-year="shiftYear"
          @shift-mode="shiftMode"
          @pick-date="pick"
          @hover-date="hover = $event"
          @pick-mode="pickMode"
        />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PerformanceDateRangePanel from './PerformanceDateRangePanel.vue'
import {
  buildMonthView,
  displayDate,
  parseDateString,
  toDateString,
  yearBlockStart,
  YEAR_BLOCK_SIZE,
  type PanelMode,
} from './performanceDateRange'

const props = withDefaults(defineProps<{
  modelValue: string[]
  startPlaceholder?: string
  endPlaceholder?: string
  ariaLabel?: string
  disabled?: boolean
}>(), {
  startPlaceholder: '开始日期',
  endPlaceholder: '结束日期',
  ariaLabel: '操作时间',
  disabled: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const root = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const open = ref(false)
const panelMode = ref<PanelMode>('date')
const start = ref('')
const end = ref('')
const hover = ref<string | null>(null)
const panelStyle = ref<Record<string, string>>({ visibility: 'hidden' })
const now = new Date()
const today = toDateString(now.getFullYear(), now.getMonth(), now.getDate())
const viewYear = ref(now.getFullYear())
const viewMonth = ref(now.getMonth())
const yearBlock = ref(yearBlockStart(now.getFullYear()))

const displayStart = computed(() => displayDate(start.value))
const displayEnd = computed(() => displayDate(end.value))

function syncFromModel(value: string[]) {
  const first = parseDateString(value[0])
  const second = parseDateString(value[1])
  start.value = first ? value[0] : ''
  end.value = first && second ? value[1] : ''
  if (first) {
    viewYear.value = first.year
    viewMonth.value = first.month
  }
}

watch(() => props.modelValue, value => syncFromModel(value || []), { immediate: true, deep: true })

const months = computed(() => {
  const next = new Date(viewYear.value, viewMonth.value + 1, 1)
  return [buildMonthView(viewYear.value, viewMonth.value), buildMonthView(next.getFullYear(), next.getMonth())]
})

function shiftMonth(delta: number) {
  const next = new Date(viewYear.value, viewMonth.value + delta, 1)
  viewYear.value = next.getFullYear()
  viewMonth.value = next.getMonth()
}

function shiftYear(delta: number) {
  viewYear.value += delta
}

function setMode(mode: PanelMode) {
  panelMode.value = mode
  if (mode === 'year') yearBlock.value = yearBlockStart(viewYear.value)
  void nextTick(updatePosition)
}

function shiftMode(delta: number) {
  if (panelMode.value === 'month') viewYear.value += delta
  else yearBlock.value += delta * YEAR_BLOCK_SIZE
}

function pickMode(value: number) {
  if (panelMode.value === 'month') viewMonth.value = value
  else viewYear.value = value
  setMode('date')
}

function cssToken(name: string): number {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name))
  return Number.isFinite(value) ? value : 0
}

async function updatePosition() {
  await nextTick()
  const trigger = root.value?.getBoundingClientRect()
  if (!trigger || !panel.value) return
  const width = panel.value.offsetWidth
  const height = panel.value.offsetHeight
  const margin = cssToken('--performance-select-popup-viewport-margin')
  const gap = cssToken('--performance-select-popup-gap')
  // 宽面板（双月）右对齐触发器，窄面板（年月）左对齐触发器
  let left = width > trigger.width ? trigger.right - width : trigger.left
  left = Math.min(Math.max(margin, left), window.innerWidth - width - margin)
  let top = trigger.bottom + gap
  if (top + height > window.innerHeight - margin && trigger.top - height - gap >= margin) top = trigger.top - height - gap
  panelStyle.value = { top: `${top}px`, left: `${left}px`, visibility: 'visible' }
}

function openPanel() {
  if (props.disabled) return
  panelMode.value = 'date'
  yearBlock.value = yearBlockStart(viewYear.value)
  open.value = true
  panelStyle.value = { visibility: 'hidden' }
  void updatePosition()
  window.setTimeout(() => { if (open.value) void updatePosition() }, cssToken('--drawer-enter-duration'))
}

function closePanel() {
  if (!open.value) return
  open.value = false
  hover.value = null
  panelMode.value = 'date'
  if (start.value && !end.value) {
    start.value = ''
    emit('update:modelValue', [])
  }
}

function toggle() {
  if (open.value) closePanel()
  else openPanel()
}

function pick(date: string) {
  if (!start.value || (start.value && end.value)) {
    start.value = date
    end.value = ''
    return
  }
  if (date < start.value) {
    end.value = start.value
    start.value = date
  } else {
    end.value = date
  }
  emit('update:modelValue', [start.value, end.value])
  closePanel()
}

function outside(event: PointerEvent) {
  if (!open.value || !(event.target instanceof Element)) return
  if (root.value?.contains(event.target) || panel.value?.contains(event.target)) return
  closePanel()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) closePanel()
}

function onViewportChange() {
  if (open.value) void updatePosition()
}

onMounted(() => {
  document.addEventListener('pointerdown', outside)
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('scroll', onViewportChange, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', outside)
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
})
</script>

<style scoped>
.performance-date-range-picker { position: relative; width: 100%; min-width: 0; }
.performance-date-range-picker__control { display: flex; align-items: center; width: 100%; height: var(--performance-control-height); padding: 0 var(--performance-input-padding-x); box-sizing: border-box; border: var(--performance-popover-border-width) solid var(--performance-control-border); border-radius: var(--performance-control-radius); background: var(--color-bg-card); transition: border-color var(--duration-base) var(--ease-standard); cursor: pointer; }
.performance-date-range-picker__control:hover, .performance-date-range-picker.is-open .performance-date-range-picker__control { border-color: var(--performance-control-focus-border); }
.performance-date-range-picker.is-disabled .performance-date-range-picker__control { background: var(--color-surface-disabled); cursor: not-allowed; }
.performance-date-range-picker__input { min-width: 0; flex: 1; height: var(--performance-input-line-height); padding: 0; border: 0; outline: 0; background: transparent; color: var(--color-text-primary); font: var(--font-weight-normal) var(--font-size-md)/var(--performance-input-line-height) var(--font-sans); cursor: inherit; }
.performance-date-range-picker__input::placeholder { color: var(--color-text-placeholder); }
.performance-date-range-picker__separator { flex: none; width: var(--performance-date-range-separator-width); height: var(--performance-date-range-separator-height); margin: 0 var(--spacing-2); background: var(--performance-control-border); }
.performance-date-range-picker__icon { display: inline-flex; flex: none; width: var(--performance-date-range-icon-size); height: var(--performance-date-range-icon-size); margin-left: var(--spacing-2); color: var(--color-text-tertiary); }
.performance-date-range-picker__panel { position: fixed; z-index: var(--performance-popover-z-index); display: flex; box-sizing: border-box; width: var(--performance-date-range-panel-width); padding: var(--performance-date-panel-padding); border: var(--performance-popover-border-width) solid var(--performance-popover-border); border-radius: var(--performance-popover-radius); background: var(--performance-popover-background); box-shadow: var(--performance-popover-shadow); column-gap: var(--performance-date-range-panel-gap); }
.performance-date-range-picker__panel.is-mode { display: block; width: var(--performance-date-mode-panel-width); padding: var(--performance-date-panel-padding) var(--performance-date-panel-padding) 0; }
</style>
