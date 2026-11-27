<template>
  <div class="performance-date-range-field" data-member-filter-layer @input="handleInput">
    <ElConfigProvider :locale="zhCn">
    <ElDatePicker
      :model-value="modelValue"
      type="daterange"
      format="YYYY-MM-DD"
      value-format="YYYY-MM-DD"
      start-placeholder="开始日期"
      end-placeholder="结束日期"
      range-separator="-"
      :aria-label="ariaLabel || '入职日期范围'"
      :unlink-panels="false"
      :clearable="false"
      :validate-event="false"
      popper-class="member-filter-date-popup"
      @update:model-value="publish"
      @calendar-change="handleCalendarChange"
      @visible-change="markPopup"
    />
    </ElConfigProvider>
  </div>
</template>

<script setup lang="ts">
import { nextTick } from 'vue'
import { ElConfigProvider, ElDatePicker } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'

const props = defineProps<{ modelValue: string[]; ariaLabel?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()
let inputDraft: string[] | null = null

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function publish(value: unknown) {
  const candidate = inputDraft || value
  const range = Array.isArray(candidate) && candidate.length === 2 && candidate.every(validDate) && candidate[0] <= candidate[1] ? [...candidate] : []
  if (range.length !== props.modelValue.length || range.some((date, index) => date !== props.modelValue[index])) {
    emit('update:modelValue', range)
  }
}

function handleInput(event: Event) {
  const root = event.currentTarget as HTMLElement
  inputDraft = Array.from(root.querySelectorAll<HTMLInputElement>('.el-range-input'), input => input.value)
  publish(inputDraft)
}

function handleCalendarChange(value: unknown[]) {
  inputDraft = null
  if (!value[1]) publish([])
}

async function markPopup(visible: boolean) {
  inputDraft = null
  if (!visible) return
  await nextTick()
  document.querySelectorAll('.member-filter-date-popup').forEach(popup => popup.setAttribute('data-member-filter-layer', ''))
}
</script>

<style scoped>
.performance-date-range-field {
  width: var(--performance-member-filter-value-width);
  max-width: 100%;
}
.performance-date-range-field :deep(.el-date-editor.el-range-editor) {
  width: 100%;
  height: var(--performance-control-height);
  box-sizing: border-box;
  padding: 0 var(--performance-input-padding-x);
  border-radius: var(--performance-control-radius);
  background: var(--color-bg-card);
  box-shadow: inset 0 0 0 var(--performance-popover-border-width) var(--performance-field-border);
}
.performance-date-range-field :deep(.el-range-editor:hover) {
  box-shadow: inset 0 0 0 var(--performance-popover-border-width) var(--performance-field-border-hover);
}
.performance-date-range-field :deep(.el-range-editor.is-active) {
  box-shadow: inset 0 0 0 var(--performance-popover-border-width) var(--performance-field-border-focus), var(--performance-field-focus-ring);
}
.performance-date-range-field :deep(.el-range-input) {
  min-width: 0;
  flex: 1;
  font-family: var(--font-sans);
  font-size: var(--font-size-md);
  line-height: var(--performance-input-line-height);
  color: var(--color-text-primary);
  text-align: left;
}
.performance-date-range-field :deep(.el-range-input::placeholder) { color: var(--color-text-placeholder); }
.performance-date-range-field :deep(.el-range-separator) {
  flex: 0;
  padding: 0 var(--spacing-2);
  color: var(--color-text-secondary);
}
.performance-date-range-field :deep(.el-range__icon) {
  order: 1;
  margin: 0 0 0 var(--spacing-2);
  color: var(--color-text-secondary);
  font-size: var(--font-size-lg);
}
.performance-date-range-field :deep(.el-range__close-icon) { display: none; }
</style>

<style>
.member-filter-date-popup {
  --el-color-primary: var(--color-primary);
  --el-datepicker-active-color: var(--color-primary);
  --el-datepicker-inrange-bg-color: var(--color-bg-hover);
  --el-datepicker-inrange-hover-bg-color: var(--color-bg-hover);
  --el-datepicker-hover-bg-color: var(--color-surface-disabled);
  --el-datepicker-text-color: var(--color-text-primary);
  --el-datepicker-off-text-color: var(--color-text-placeholder);
  --el-datepicker-border-color: var(--performance-popover-border);
  --el-bg-color-overlay: var(--performance-popover-background);
  --el-border-color-light: var(--performance-popover-border);
  --el-text-color-regular: var(--color-text-primary);
  --el-text-color-placeholder: var(--color-text-placeholder);
  z-index: calc(var(--performance-popover-z-index) + 1) !important;
  font-family: var(--font-sans);
  font-size: var(--font-size-md);
  border-radius: var(--performance-popover-radius);
  box-shadow: var(--performance-popover-shadow);
}
.member-filter-date-popup .el-date-range-picker {
  width: calc(var(--performance-member-filter-value-width) * 2);
}
.member-filter-date-popup .el-date-range-picker__content { padding: var(--spacing-4); }
</style>
