<template>
  <div ref="root" class="performance-date-time-field">
    <input
      ref="input"
      :id="inputId"
      class="performance-date-time-field__input"
      type="text"
      :value="displayValue"
      :placeholder="placeholder"
      :required="required"
      :disabled="disabled"
      :pattern="dateOnly ? '[0-9]{4}-[0-9]{2}-[0-9]{2}' : '[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}'"
      :aria-label="ariaLabel || undefined"
      :aria-invalid="invalid || undefined"
      :aria-describedby="describedBy || undefined"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :aria-controls="open ? panelId : undefined"
      @input="updateInput"
      @click="openPicker"
      @keydown.down.prevent="openPicker"
      @keydown.esc.stop.prevent="closePicker(true)"
    />
    <button class="performance-date-time-field__trigger" type="button" :disabled="disabled" :aria-label="ariaLabel || '打开日期时间选择器'" aria-haspopup="dialog" :aria-expanded="open" :aria-controls="open ? panelId : undefined" @click="open ? closePicker(true) : openPicker()">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2.25" y="3.25" width="11.5" height="10.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.25" /><path d="M5 2.25v2M11 2.25v2M2.75 6h10.5" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" /><path d="M5 8.5h1.25M8 8.5h1.25M11 8.5h.01M5 11h1.25M8 11h1.25" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" /></svg>
    </button>
    <Teleport to="body">
      <Transition name="performance-datetime">
        <section v-if="open" :id="panelId" ref="panel" class="performance-datetime-panel" role="dialog" :aria-label="`${ariaLabel || '日期时间'}选择器`" :style="panelStyle" @keydown="handlePanelKeydown" @focusout="handleFocusOut">
          <div class="performance-datetime-panel__body">
            <div class="performance-datetime-calendar">
              <header class="performance-datetime-calendar__header">
                <div class="performance-datetime-calendar__heading">
                  <button type="button" aria-label="选择年份" @click="mode = mode === 'year' ? 'date' : 'year'">{{ viewYear }}年</button>
                  <button type="button" aria-label="选择月份" @click="mode = mode === 'month' ? 'date' : 'month'">{{ viewMonth + 1 }}月</button>
                  <button class="performance-datetime-calendar__arrow" type="button" aria-label="切换年月面板" @click="mode = mode === 'date' ? 'month' : 'date'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 9 7 7 7-7" /></svg></button>
                </div>
                <div class="performance-datetime-calendar__paging">
                  <button class="performance-datetime-calendar__arrow" type="button" :aria-label="mode === 'year' ? '上一组年份' : mode === 'month' ? '上一年' : '上一月'" @click="navigate(-1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg></button>
                  <button class="performance-datetime-calendar__arrow" type="button" :aria-label="mode === 'year' ? '下一组年份' : mode === 'month' ? '下一年' : '下一月'" @click="navigate(1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg></button>
                </div>
              </header>
              <template v-if="mode === 'date'">
                <div class="performance-datetime-calendar__week" aria-hidden="true"><span v-for="day in weekdays" :key="day">{{ day }}</span></div>
                <div class="performance-datetime-calendar__days" role="group" aria-label="选择日期">
                  <button v-for="day in calendarDays" :key="day.value" type="button" :data-date="day.value" :aria-label="day.value" :aria-pressed="draftDate === day.value" :aria-current="day.value === today ? 'date' : undefined" :class="{ outside: day.month !== viewMonth, selected: draftDate === day.value, today: day.value === today }" @click="selectDate(day.value)" @keydown="handleDayKeydown($event, day.value)"><span>{{ day.day }}</span></button>
                </div>
              </template>
              <div v-else class="performance-datetime-calendar__options" role="group" :aria-label="mode === 'year' ? '选择年份' : '选择月份'">
                <button v-for="value in mode === 'year' ? yearOptions : months" :key="value" type="button" :aria-pressed="mode === 'year' ? value === viewYear : value === viewMonth + 1" @click="selectPeriod(value)">{{ mode === 'year' ? value : `${value}月` }}</button>
              </div>
            </div>
            <div v-if="!dateOnly" class="performance-datetime-time">
              <div v-for="column in timeColumns" :key="column.key" class="performance-datetime-time__column">
                <div class="performance-datetime-time__label">{{ column.label }}</div>
                <div class="performance-datetime-time__list" role="group" :aria-label="`选择${column.label === '时' ? '小时' : '分钟'}`">
                  <button v-for="value in column.values" :key="value" type="button" :data-time="`${column.key}-${value}`" :aria-label="`${pad(value)}${column.label}`" :aria-pressed="(column.key === 'hour' ? draftHour : draftMinute) === value" :class="{ selected: (column.key === 'hour' ? draftHour : draftMinute) === value }" @click="selectTime(column.key, value)" @keydown="handleTimeKeydown($event, column.key, value)">{{ pad(value) }}</button>
                </div>
              </div>
            </div>
          </div>
          <footer class="performance-datetime-panel__footer">
            <button type="button" class="performance-datetime-panel__cancel" @click="closePicker(true)">取消</button>
            <button type="button" class="performance-datetime-panel__confirm" :disabled="!draftDate" @click="confirmPicker">确定</button>
          </footer>
        </section>
      </Transition>
    </Teleport>
  </div>
</template>

<script lang="ts">
let nextDateTimeFieldId = 0
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: string
  inputId?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  ariaLabel?: string
  timeRole?: 'start' | 'end'
  dateOnly?: boolean
  initialDate?: string
  invalid?: boolean
  describedBy?: string
}>(), { inputId: undefined, placeholder: 'YYYY-MM-DD HH:MM', required: false, disabled: false, ariaLabel: '', invalid: false, describedBy: '' })
const emit = defineEmits<{ 'update:modelValue': [value: string]; open: [] }>()
const panelId = `performance-datetime-${++nextDateTimeFieldId}`
const root = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const open = ref(false)
const panelStyle = ref<Record<string, string>>({ visibility: 'hidden' })
const mode = ref<'date' | 'month' | 'year'>('date')
const viewYear = ref(2026)
const viewMonth = ref(0)
const draftDate = ref('')
const draftHour = ref(0)
const draftMinute = ref(0)
const weekdays = ['日', '一', '二', '三', '四', '五', '六']
const months = Array.from({ length: 12 }, (_, index) => index + 1)
const timeColumns = [{ key: 'hour', label: '时', values: Array.from({ length: 24 }, (_, index) => index) }, { key: 'minute', label: '分', values: Array.from({ length: 60 }, (_, index) => index) }] as const
const pad = (value: number) => String(value).padStart(2, '0')
const dateValue = (date: Date) => `${String(date.getUTCFullYear()).padStart(4, '0')}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
const displayValue = computed(() => props.modelValue.replace('T', ' '))
const today = computed(() => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()))
const yearOptions = computed(() => Array.from({ length: 12 }, (_, index) => Math.floor(viewYear.value / 12) * 12 + index).filter(year => year >= 1 && year <= 9999))
const calendarDays = computed(() => {
  const first = new Date(`${String(viewYear.value).padStart(4, '0')}-${pad(viewMonth.value + 1)}-01T00:00:00Z`)
  first.setUTCDate(1 - first.getUTCDay())
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first)
    date.setUTCDate(first.getUTCDate() + index)
    return { value: dateValue(date), day: date.getUTCDate(), month: date.getUTCMonth() }
  })
})

function validValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(props.dateOnly ? `${value}T00:00` : value)
  if (!match || Number(match[1]) < 1 || Number(match[4]) > 23 || Number(match[5]) > 59) return false
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && dateValue(date) === `${match[1]}-${match[2]}-${match[3]}`
}

function updateValidity(value = props.modelValue) {
  input.value?.setCustomValidity(value && !validValue(value) ? (props.dateOnly ? '请输入有效日期，格式为 YYYY-MM-DD' : '请输入有效日期时间，格式为 YYYY-MM-DD HH:MM') : '')
}

function updateInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  updateValidity(value)
  if (props.dateOnly || !value || validValue(value)) emit('update:modelValue', value.replace(' ', 'T'))
}

function resetDraft() {
  const value = validValue(props.modelValue) ? props.modelValue.replace(' ', 'T') : `${props.initialDate || today.value}T00:00`
  draftDate.value = props.modelValue && validValue(props.modelValue) ? value.slice(0, 10) : ''
  viewYear.value = Number(value.slice(0, 4))
  viewMonth.value = Number(value.slice(5, 7)) - 1
  draftHour.value = !props.dateOnly && props.modelValue && validValue(props.modelValue) ? Number(value.slice(11, 13)) : (props.timeRole === 'end' ? 23 : 0)
  draftMinute.value = !props.dateOnly && props.modelValue && validValue(props.modelValue) ? Number(value.slice(14, 16)) : (props.timeRole === 'end' ? 59 : 0)
  mode.value = 'date'
}

function updatePosition() {
  if (!open.value || !root.value || !panel.value) return
  const rect = root.value.getBoundingClientRect()
  const viewport = window.visualViewport
  const x = viewport?.offsetLeft || 0
  const y = viewport?.offsetTop || 0
  const width = viewport?.width || window.innerWidth
  const height = viewport?.height || window.innerHeight
  const panelWidth = Math.min(props.dateOnly ? 280 : 420, Math.max(0, width - 32))
  const panelHeight = Math.min(panel.value.offsetHeight || 366, Math.max(0, height - 32))
  const left = Math.min(Math.max(x + 16, rect.left), x + width - panelWidth - 16)
  const below = rect.bottom + 6
  const preferredTop = below + panelHeight <= y + height - 16 ? below : rect.top - panelHeight - 6
  const top = Math.max(y + 16, Math.min(preferredTop, y + height - panelHeight - 16))
  panelStyle.value = { left: `${left}px`, top: `${top}px`, width: `${panelWidth}px`, maxHeight: `${Math.max(0, height - 32)}px`, visibility: 'visible' }
}

function scrollTimeIntoView() {
  for (const key of ['hour', 'minute'] as const) {
    const value = key === 'hour' ? draftHour.value : draftMinute.value
    const button = panel.value?.querySelector<HTMLElement>(`[data-time="${key}-${value}"]`)
    if (button?.parentElement) button.parentElement.scrollTop = button.offsetTop - button.parentElement.offsetTop
  }
}

function openPicker() {
  if (props.disabled || open.value) return
  resetDraft()
  open.value = true
  emit('open')
  panelStyle.value = { visibility: 'hidden' }
  void nextTick(() => {
    updatePosition()
    scrollTimeIntoView()
    panel.value?.querySelector<HTMLButtonElement>(`[data-date="${draftDate.value || today.value}"]`)?.focus({ preventScroll: true })
  })
}

function closePicker(restoreFocus = false) {
  open.value = false
  if (restoreFocus) void nextTick(() => input.value?.focus({ preventScroll: true }))
}

function confirmPicker() {
  if (props.disabled || !draftDate.value) return
  const value = props.dateOnly ? draftDate.value : `${draftDate.value}T${pad(draftHour.value)}:${pad(draftMinute.value)}`
  if (!validValue(value)) return
  updateValidity(value)
  emit('update:modelValue', value)
  closePicker(true)
}

function selectDate(value: string) {
  draftDate.value = value
  draftHour.value = props.timeRole === 'end' ? 23 : 0
  draftMinute.value = props.timeRole === 'end' ? 59 : 0
  viewYear.value = Number(value.slice(0, 4))
  viewMonth.value = Number(value.slice(5, 7)) - 1
}

function navigate(direction: number) {
  if (mode.value === 'year') viewYear.value = Math.min(9999, Math.max(1, viewYear.value + direction * 12))
  else if (mode.value === 'month') viewYear.value = Math.min(9999, Math.max(1, viewYear.value + direction))
  else {
    const month = viewYear.value * 12 + viewMonth.value + direction
    if (month < 12 || month >= 10000 * 12) return
    viewYear.value = Math.floor(month / 12)
    viewMonth.value = month % 12
  }
}

function selectPeriod(value: number) {
  if (mode.value === 'year') { viewYear.value = value; mode.value = 'month' }
  else { viewMonth.value = value - 1; mode.value = 'date' }
}

function selectTime(key: 'hour' | 'minute', value: number) {
  if (key === 'hour') draftHour.value = value
  else draftMinute.value = value
}

function handleDayKeydown(event: KeyboardEvent, value: string) {
  const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
  if (!(event.key in offsets)) return
  event.preventDefault()
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offsets[event.key])
  if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) return
  const next = dateValue(date)
  viewYear.value = date.getUTCFullYear()
  viewMonth.value = date.getUTCMonth()
  void nextTick(() => panel.value?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus({ preventScroll: true }))
}

function handleTimeKeydown(event: KeyboardEvent, key: 'hour' | 'minute', value: number) {
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const max = key === 'hour' ? 23 : 59
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? max : Math.min(max, Math.max(0, value + (event.key === 'ArrowDown' ? 1 : -1)))
  selectTime(key, next)
  panel.value?.querySelector<HTMLButtonElement>(`[data-time="${key}-${next}"]`)?.focus()
}

function handlePanelKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); closePicker(true) }
}

function handleFocusOut(event: FocusEvent) {
  if (event.relatedTarget instanceof Node && !panel.value?.contains(event.relatedTarget) && !root.value?.contains(event.relatedTarget)) closePicker()
}

function handleOutsidePointerDown(event: PointerEvent) {
  if (!(event.target instanceof Node) || root.value?.contains(event.target) || panel.value?.contains(event.target)) return
  closePicker()
}

watch(() => props.modelValue, () => { updateValidity(); if (open.value) { resetDraft(); void nextTick(scrollTimeIntoView) } })
watch(() => props.initialDate, value => {
  if (open.value && !draftDate.value && value && validValue(props.dateOnly ? value : `${value}T00:00`)) {
    viewYear.value = Number(value.slice(0, 4))
    viewMonth.value = Number(value.slice(5, 7)) - 1
  }
})
watch(() => props.disabled, value => { if (value) closePicker() })
onMounted(() => {
  updateValidity()
  document.addEventListener('pointerdown', handleOutsidePointerDown)
  window.addEventListener('resize', updatePosition)
  window.addEventListener('scroll', updatePosition, true)
  window.visualViewport?.addEventListener('resize', updatePosition)
  window.visualViewport?.addEventListener('scroll', updatePosition)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutsidePointerDown)
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
  window.visualViewport?.removeEventListener('resize', updatePosition)
  window.visualViewport?.removeEventListener('scroll', updatePosition)
})
</script>

<style scoped>
.performance-date-time-field{position:relative;display:block;width:100%}
.performance-date-time-field__input{display:block;width:100%;height:var(--performance-control-height);min-height:var(--performance-control-height);padding:4px 38px 4px 10px;box-sizing:border-box;border:1px solid var(--performance-field-border);border-radius:var(--performance-control-radius);background:var(--color-bg-card);color:var(--color-text-primary);font:inherit;line-height:var(--performance-input-line-height);transition:border-color var(--duration-fast) var(--ease-standard),box-shadow var(--duration-fast) var(--ease-standard)}
.performance-date-time-field__input::placeholder{color:var(--color-text-placeholder)}
.performance-date-time-field__input:focus{border-color:var(--performance-field-border-focus);outline:0;box-shadow:var(--performance-field-focus-ring)}
.performance-date-time-field__input[aria-invalid="true"]{border-color:var(--performance-field-border-invalid);box-shadow:none}
.performance-date-time-field__input:disabled{background:var(--performance-field-disabled-background);color:var(--performance-field-disabled-text);cursor:not-allowed}
.performance-date-time-field__trigger{position:absolute;top:0;right:0;display:grid;place-items:center;width:var(--performance-control-height);height:var(--performance-control-height);padding:0;border:0;border-radius:0 var(--performance-control-radius) var(--performance-control-radius) 0;background:transparent;color:var(--color-text-secondary);cursor:pointer}
.performance-date-time-field__trigger:hover,.performance-date-time-field__trigger:focus-visible{color:var(--color-action-primary-hover);background:var(--color-surface-disabled);outline:0}
.performance-date-time-field__trigger:disabled{cursor:not-allowed;opacity:.5}
.performance-datetime-panel{position:fixed;z-index:var(--performance-popover-z-index);display:flex;flex-direction:column;width:420px;box-sizing:border-box;overflow:hidden;border:1px solid var(--performance-popover-border);border-radius:var(--performance-popover-radius);background:var(--performance-popover-background);box-shadow:var(--performance-popover-shadow);color:var(--color-text-primary);font-family:var(--font-sans);font-size:14px;line-height:22px}
.performance-datetime-panel button{box-sizing:border-box;font:inherit;cursor:pointer}
.performance-datetime-panel button:focus-visible{outline:2px solid var(--color-primary);outline-offset:-2px}
.performance-datetime-panel__body{display:flex;flex:1;min-height:0;overflow:auto}
.performance-datetime-calendar{flex:1;min-width:0;margin:15px;width:248px}
.performance-datetime-calendar__header{height:32px;box-sizing:border-box;padding:0 0 10px 8px;display:flex;align-items:flex-start;justify-content:space-between}
.performance-datetime-calendar__heading,.performance-datetime-calendar__paging{display:flex;align-items:center;gap:4px}
.performance-datetime-calendar__paging{gap:12px}
.performance-datetime-calendar__heading>button{padding:0;border:0;background:transparent;color:inherit;font-weight:500;white-space:nowrap}
.performance-datetime-calendar__arrow{display:grid;place-items:center;width:20px;height:20px;padding:4px;border:0;border-radius:6px;background:transparent;color:var(--color-text-secondary)}
.performance-datetime-calendar__arrow svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.performance-datetime-calendar__heading>button:hover{color:var(--color-primary)}
.performance-datetime-calendar__arrow:hover{background:var(--color-surface-disabled)}
.performance-datetime-calendar__week,.performance-datetime-calendar__days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));text-align:center}
.performance-datetime-calendar__week{height:33px;align-items:center;color:var(--color-text-secondary)}
.performance-datetime-calendar__days>button{display:grid;place-items:center;height:36px;padding:2px 0;border:0;background:transparent;color:inherit}
.performance-datetime-calendar__days>button>span{display:grid;place-items:center;width:28px;height:28px;box-sizing:border-box;border:1px solid transparent;border-radius:6px}
.performance-datetime-calendar__days>button.outside{color:var(--color-text-placeholder)}
.performance-datetime-calendar__days>button.today>span{border-color:var(--color-primary);color:var(--color-primary)}
.performance-datetime-calendar__days>button:hover>span{background:var(--color-surface-disabled)}
.performance-datetime-calendar__days>button.selected>span{color:var(--color-bg-card);background:var(--color-primary);border-color:var(--color-primary)}
.performance-datetime-calendar__options{height:249px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));align-items:center;gap:8px}
.performance-datetime-calendar__options>button{height:32px;padding:0;border:0;border-radius:6px;background:transparent;color:inherit}
.performance-datetime-calendar__options>button:hover{background:var(--color-surface-disabled)}
.performance-datetime-calendar__options>button[aria-pressed="true"]{background:var(--color-primary);color:var(--color-bg-card)}
.performance-datetime-time{display:flex;flex:0 0 140px;min-height:311px;border-left:1px solid var(--performance-popover-border)}
.performance-datetime-time__column{display:flex;flex:1;min-width:0;flex-direction:column}
.performance-datetime-time__column+.performance-datetime-time__column{border-left:1px solid var(--performance-popover-border)}
.performance-datetime-time__label{display:grid;place-items:center;height:46px;flex-shrink:0;color:var(--color-text-secondary)}
.performance-datetime-time__list{position:relative;height:265px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--color-border) transparent}
.performance-datetime-time__list>button{display:block;width:100%;height:32px;padding:0;border:0;background:transparent;color:inherit;text-align:center}
.performance-datetime-time__list>button:hover{background:var(--color-surface-disabled)}
.performance-datetime-time__list>button.selected{background:var(--color-bg-hover);color:var(--color-primary);font-weight:500}
.performance-datetime-panel__footer{display:flex;flex-shrink:0;align-items:center;justify-content:flex-end;gap:12px;height:53px;box-sizing:border-box;padding:10px 16px;border-top:1px solid var(--performance-popover-border)}
.performance-datetime-panel__footer>button{height:32px;min-width:60px;padding:0 12px;border-radius:var(--performance-button-radius)}
.performance-datetime-panel__cancel{border:1px solid var(--performance-button-secondary-border);background:var(--performance-button-secondary-background);color:var(--performance-button-secondary-text)}
.performance-datetime-panel__cancel:hover{background:var(--performance-button-secondary-hover-background)}
.performance-datetime-panel__confirm{border:1px solid var(--color-primary);background:var(--color-primary);color:var(--color-bg-card)}
.performance-datetime-panel__confirm:hover{background:var(--color-primary-hover)}
.performance-datetime-panel__confirm:disabled{border-color:var(--color-surface-disabled);background:var(--color-surface-disabled);color:var(--color-text-placeholder);cursor:not-allowed}
.performance-datetime-enter-active,.performance-datetime-leave-active{transition:opacity .15s ease-out,transform .15s ease-out}
.performance-datetime-enter-from,.performance-datetime-leave-to{opacity:0;transform:translateY(4px)}
@media(max-width:480px){.performance-datetime-calendar{margin:10px}.performance-datetime-time{flex-basis:100px}.performance-datetime-calendar__paging{gap:0}.performance-datetime-calendar__header{padding-left:0}.performance-datetime-calendar__days>button>span{width:24px;height:24px}}
@media(prefers-reduced-motion:reduce){.performance-datetime-enter-active,.performance-datetime-leave-active{transition:none}}
</style>
