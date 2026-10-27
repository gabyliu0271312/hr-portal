<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { PerformanceTodoNotificationRule } from '@/api/performance'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformanceRadioGroup from './PerformanceRadioGroup.vue'
import PerformanceNumberInput from './PerformanceNumberInput.vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import PerformanceTimeField from './PerformanceTimeField.vue'
import PerformanceButton from './PerformanceButton.vue'
import { defaultTodoNotificationRule, notificationFrequencyOptions, notificationTimezoneOptions, notificationWeekdayOptions } from './performanceTodoNotificationRule'

const props = withDefaults(defineProps<{
  modelValue: boolean
  rule?: PerformanceTodoNotificationRule
  title?: string
  saving?: boolean
  saveError?: string
}>(), { rule: undefined, title: '编辑待办任务通知', saving: false, saveError: '' })
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [rule: PerformanceTodoNotificationRule]
}>()
const form = ref<HTMLFormElement | null>(null)
const draft = ref(defaultTodoNotificationRule())
const dailyInterval = ref('1')
const weeklyInterval = ref('1')
const selectedDays = ref<string[]>([])
const selectedWeekdays = ref<string[]>([])
const errors = ref<Record<string, string>>({})
let returnFocus: HTMLElement | null = null

const dayOptions = computed(() => [...new Set([...Array.from({ length: 100 }, (_, index) => index + 1), ...selectedDays.value.map(Number)])]
  .sort((a, b) => a - b).map(day => ({ value: String(day), label: day === 0 ? '截止当天' : String(day) })))
const timezoneOptions = computed(() => notificationTimezoneOptions.some(option => option.value === draft.value.timezone)
  ? notificationTimezoneOptions : [...notificationTimezoneOptions, { value: draft.value.timezone, label: draft.value.timezone }])
const frequency = computed({
  get: () => draft.value.frequency,
  set: (value: string) => {
    if (value === 'specified' || value === 'daily' || value === 'weekly') draft.value.frequency = value
    errors.value = {}
  },
})
const holiday = computed({ get: () => draft.value.suppress_non_working_days ? 'yes' : 'no', set: (value: string) => { draft.value.suppress_non_working_days = value === 'yes' } })

watch(() => props.modelValue, async (open) => {
  if (open) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const rule = props.rule || defaultTodoNotificationRule()
    draft.value = { ...rule, days_before: [...rule.days_before], weekdays: [...rule.weekdays] }
    dailyInterval.value = String(rule.frequency === 'daily' ? rule.interval : 1)
    weeklyInterval.value = String(rule.frequency === 'weekly' ? rule.interval : 1)
    selectedDays.value = rule.days_before.map(String)
    selectedWeekdays.value = rule.weekdays.map(String)
    errors.value = {}
    await nextTick()
    form.value?.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.focus()
    document.addEventListener('keydown', trapFocus)
  } else {
    document.removeEventListener('keydown', trapFocus)
    returnFocus?.focus()
  }
}, { immediate: true })
watch([dailyInterval, weeklyInterval, selectedDays, selectedWeekdays, () => draft.value.time, () => draft.value.timezone], () => { errors.value = {} })
onBeforeUnmount(() => document.removeEventListener('keydown', trapFocus))

function trapFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab') return
  if (document.querySelector('.performance-select-shell__popup, .performance-time-field-popup:not([style*="display: none"])')) return
  const dialog = form.value?.closest('[role="dialog"]')
  const controls = Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') || [])
  if (!controls.length) return
  const first = controls[0]
  const last = controls[controls.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}

function confirm() {
  if (props.saving) return
  const nextErrors: Record<string, string> = {}
  const interval = Number(frequency.value === 'weekly' ? weeklyInterval.value : dailyInterval.value)
  if (frequency.value !== 'specified' && (!Number.isInteger(interval) || interval < 1 || interval > 365)) nextErrors.schedule = '请输入 1–365 的整数间隔'
  if (frequency.value === 'specified' && !selectedDays.value.length) nextErrors.schedule = '请至少选择一个通知日期'
  if (frequency.value === 'weekly' && !selectedWeekdays.value.length) nextErrors.schedule = '请至少选择一个星期'
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.value.time)) nextErrors.time = '请选择有效的通知时刻'
  if (!draft.value.timezone) nextErrors.timezone = '请选择时区'
  errors.value = nextErrors
  if (Object.keys(nextErrors).length) return
  emit('confirm', {
    ...draft.value,
    interval: frequency.value === 'specified' ? 1 : interval,
    days_before: frequency.value === 'specified' ? [...new Set(selectedDays.value.map(Number))].sort((a, b) => a - b) : [],
    weekdays: frequency.value === 'weekly' ? [...new Set(selectedWeekdays.value.map(Number))] : [],
  })
}
</script>

<template>
  <PerformanceDialogShell :model-value="modelValue" :title="title" title-id="todo-notification-title" width="var(--performance-notification-dialog-width)" :loading="saving" dialog-class="todo-notification-dialog" @update:model-value="emit('update:modelValue', $event)">
    <form ref="form" class="todo-notification-form" novalidate @submit.prevent="confirm">
      <PerformanceFormItem label="通知频率" required>
        <PerformanceRadioGroup v-model="frequency" :options="notificationFrequencyOptions" name="todo-notification-frequency" aria-label="通知频率" :disabled="saving" />
      </PerformanceFormItem>
      <PerformanceFormItem label="通知时间" required :invalid="Boolean(errors.schedule || errors.time || errors.timezone)" :error-message="errors.schedule || errors.time || errors.timezone" error-id="todo-schedule-error">
        <template #label-extra><span class="todo-notification-info" title="设置环节截止前的提醒日期、时刻和时区。当前仅保存配置，尚未接入发送。" tabindex="0" aria-label="通知时间说明">ⓘ</span></template>
        <div class="todo-notification-schedule" :class="`todo-notification-schedule--${frequency}`">
          <span class="todo-notification-prefix">{{ frequency === 'specified' ? '环节截止前第' : '环节截止前每' }}</span>
          <template v-if="frequency === 'specified'">
            <PerformanceSearchSelect v-model="selectedDays" :options="dayOptions" multiple option-style="checkmark" aria-label="截止前通知日期" :disabled="saving" :aria-invalid="Boolean(errors.schedule)" />
            <PerformanceSearchSelect v-model="draft.day_kind" :options="[{ value: 'calendar_day', label: '自然日' }, { value: 'working_day', label: '工作日' }]" option-style="checkmark" selection-style="plain" aria-label="通知日期单位" :disabled="saving" />
          </template>
          <template v-else>
            <PerformanceNumberInput v-if="frequency === 'daily'" v-model="dailyInterval" aria-label="重复天数" :min="1" :max="365" :step="1" :precision="0" suffix="天" :show-controls="false" :disabled="saving" :invalid="Boolean(errors.schedule)" />
            <PerformanceNumberInput v-else v-model="weeklyInterval" aria-label="重复周数" :min="1" :max="365" :step="1" :precision="0" suffix="周" :show-controls="false" :disabled="saving" :invalid="Boolean(errors.schedule)" />
            <PerformanceSearchSelect v-if="frequency === 'weekly'" v-model="selectedWeekdays" :options="notificationWeekdayOptions" multiple option-style="checkmark" aria-label="通知星期" :disabled="saving" :aria-invalid="Boolean(errors.schedule)" />
          </template>
          <PerformanceTimeField v-model="draft.time" :disabled="saving" :invalid="Boolean(errors.time)" />
        </div>
        <div class="todo-notification-timezone">
          <span>时区</span>
          <PerformanceSearchSelect :model-value="draft.timezone" :options="timezoneOptions" selection-style="plain" aria-label="通知时区" :disabled="saving" @update:model-value="draft.timezone = typeof $event === 'string' ? $event : ''" />
        </div>
      </PerformanceFormItem>
      <PerformanceFormItem label="是否在节假日和周末时屏蔽" required>
        <template #label-extra><span class="todo-notification-info" title="仅保存屏蔽偏好；节假日日历及实际屏蔽逻辑尚未接入。" tabindex="0" aria-label="节假日屏蔽说明">ⓘ</span></template>
        <PerformanceRadioGroup v-model="holiday" :options="[{ value: 'yes', label: '屏蔽' }, { value: 'no', label: '不屏蔽' }]" name="todo-notification-holiday" aria-label="节假日和周末屏蔽" :disabled="saving" />
      </PerformanceFormItem>
      <p class="todo-notification-notice">配置保存后可回显，实际通知发送尚未接入。</p>
      <p v-if="saveError" class="todo-notification-error" role="alert">{{ saveError }}</p>
    </form>
    <template #footer>
      <div class="todo-notification-actions">
        <PerformanceButton type="button" :disabled="saving" @click="emit('update:modelValue', false)">取消</PerformanceButton>
        <PerformanceButton type="button" variant="primary" :loading="saving" @click="confirm">确定</PerformanceButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<style scoped>
.todo-notification-form { display: flex; flex-direction: column; gap: var(--spacing-5); }
.todo-notification-form :deep(.performance-form-item) { margin-bottom: 0; }
.todo-notification-form :deep(.performance-form-item__label) { min-height: 24px; line-height: 24px; }
.todo-notification-form :deep(.performance-radio-group) { flex-wrap: wrap; row-gap: var(--spacing-2) !important; }
.todo-notification-form :deep(.performance-form-item--invalid .performance-search-select__trigger:not([aria-invalid="true"])) { border-color: var(--performance-field-border); }
.todo-notification-form :deep(.performance-search-select__trigger[aria-invalid="true"] .performance-select-shell__selector) { border-color: var(--performance-field-border-invalid); }
.todo-notification-schedule { display: grid; grid-template-columns: auto minmax(0, 228fr) minmax(0, 300fr); align-items: center; gap: var(--spacing-25); }
.todo-notification-schedule--specified { grid-template-columns: auto repeat(3, minmax(0, 1fr)); }
.todo-notification-schedule--weekly { grid-template-columns: auto minmax(0, 125fr) minmax(0, 203fr) minmax(0, 180fr); }
.todo-notification-prefix { white-space: nowrap; }
.todo-notification-timezone { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: var(--spacing-25); margin-top: var(--spacing-25); }
.todo-notification-info { margin-left: var(--spacing-1); color: var(--performance-settings-text-secondary); font-size: var(--font-size-lg); font-weight: 400; cursor: help; }
.todo-notification-notice { margin: 0; color: var(--performance-settings-text-secondary); font-size: var(--font-size-xs); line-height: 20px; }
.todo-notification-error { margin: 0; color: var(--performance-field-error-color); font-size: var(--font-size-sm); }
.todo-notification-actions { display: flex; justify-content: flex-end; gap: var(--performance-dialog-footer-gap); }
@media (max-width: 600px) {
  .todo-notification-schedule, .todo-notification-schedule--specified, .todo-notification-schedule--weekly { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .todo-notification-prefix { grid-column: 1 / -1; }
  .todo-notification-schedule--weekly > :last-child, .todo-notification-schedule--specified > :last-child { grid-column: 1 / -1; }
}
</style>
