<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ElInput, ElPopover } from 'element-plus'

const props = withDefaults(defineProps<{
  modelValue: string
  disabled?: boolean
  invalid?: boolean
  ariaLabel?: string
}>(), { disabled: false, invalid: false, ariaLabel: '通知时刻' })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const open = ref(false)
const input = ref<InstanceType<typeof ElInput>>()
const columns = ref<HTMLElement[]>([])
const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'))
const parts = computed(() => /^([01]\d|2[0-3]):[0-5]\d$/.test(props.modelValue) ? props.modelValue.split(':') : ['10', '00'])
const minutes = computed(() => [...new Set(['00', '30', parts.value[1]])].sort())
const options = computed(() => [hours, minutes.value])

async function alignColumns() {
  await nextTick()
  columns.value.forEach((column, index) => {
    const selected = column.querySelector<HTMLElement>('[aria-selected="true"]')
    if (selected) column.scrollTop = Math.max(0, selected.offsetTop - 1)
  })
}
function choose(index: number, value: string) {
  if (props.disabled) return
  const next = [...parts.value]
  next[index] = value
  emit('update:modelValue', next.join(':'))
}
function close() {
  open.value = false
  input.value?.focus()
}
function onEscape(event: KeyboardEvent) {
  if (!open.value) return
  event.preventDefault()
  event.stopPropagation()
  close()
}
function navigate(event: KeyboardEvent, index: number) {
  const values = options.value[index]
  const current = values.indexOf(parts.value[index])
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? values.length - 1
    : event.key === 'ArrowDown' ? Math.min(current + 1, values.length - 1)
      : event.key === 'ArrowUp' ? Math.max(current - 1, 0) : -1
  if (next < 0) return
  event.preventDefault()
  choose(index, values[next])
  void nextTick(alignColumns)
}
function trapTab(event: KeyboardEvent) {
  const controls = [input.value?.input, ...columns.value].filter(Boolean) as HTMLElement[]
  const index = controls.indexOf(document.activeElement as HTMLElement)
  event.preventDefault()
  controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus()
}
watch(() => props.disabled, disabled => { if (disabled) open.value = false })
</script>

<template>
  <ElPopover v-model:visible="open" trigger="click" :disabled="disabled" :width="142" :show-arrow="false" :teleported="true" :persistent="false" :popper-style="{ padding: '0', zIndex: 'var(--performance-popover-z-index)' }" popper-class="performance-time-field-popup" placement="bottom-start" @after-enter="alignColumns">
    <template #reference>
      <div class="performance-time-field" :class="{ 'is-invalid': invalid }" @keydown.esc="onEscape" @keydown.tab="open && trapTab($event)">
        <ElInput ref="input" :model-value="modelValue" :disabled="disabled" :aria-label="ariaLabel" :aria-invalid="invalid || undefined" :aria-expanded="open" aria-haspopup="dialog" readonly placeholder="请选择时间" @keydown.down.prevent="open = !disabled">
          <template #suffix><svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" /><path d="M12 6v6h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg></template>
        </ElInput>
      </div>
    </template>
    <div class="performance-time-panel" role="dialog" :aria-label="`${ariaLabel}选项`" @keydown.esc="onEscape" @keydown.tab.capture.stop="trapTab">
      <div v-for="(values, index) in options" :key="index" :ref="el => { if (el) columns[index] = el as HTMLElement }" class="performance-time-panel__column" role="listbox" :aria-label="index === 0 ? '小时' : '分钟'" tabindex="0" @keydown="navigate($event, index)">
        <button v-for="value in values" :key="value" type="button" role="option" tabindex="-1" :aria-selected="parts[index] === value" class="performance-time-panel__option" @click="choose(index, value)">{{ value }}</button>
        <div class="performance-time-panel__tail" aria-hidden="true" />
      </div>
    </div>
  </ElPopover>
</template>

<style scoped>
.performance-time-field { width: 100%; height: var(--performance-control-height); --el-input-height: var(--performance-control-height); --el-input-border-radius: var(--performance-control-radius); --el-input-border-color: var(--performance-field-border); --el-input-focus-border-color: var(--performance-field-border-focus); --el-input-text-color: var(--color-text-primary); --el-input-bg-color: var(--color-bg-card); --el-font-size-base: var(--font-size-md); }
.performance-time-field :deep(.el-input__wrapper) { padding: var(--performance-input-padding-y) var(--performance-input-padding-x); }
.performance-time-field :deep(.el-input__inner) { height: var(--performance-input-line-height); font-family: var(--font-sans); cursor: pointer; }
.performance-time-field.is-invalid :deep(.el-input__wrapper) { box-shadow: 0 0 0 1px var(--performance-field-border-invalid) inset; }
.performance-time-panel { display: flex; padding: 2px 0; color: var(--color-text-primary); font: 400 var(--font-size-md)/22px var(--font-sans); }
.performance-time-panel__column { display: flex; flex-direction: column; position: relative; flex: 0 0 var(--performance-time-column-width); width: var(--performance-time-column-width); height: var(--performance-time-panel-height); overflow: hidden; overscroll-behavior: contain; outline: none; }
.performance-time-panel__column + .performance-time-panel__column { box-shadow: -1px 0 var(--performance-popover-border); }
.performance-time-panel__column:hover, .performance-time-panel__column:focus-within { overflow-y: auto; }
.performance-time-panel__column::-webkit-scrollbar { width: var(--spacing-2); }
.performance-time-panel__column::-webkit-scrollbar-track { background: transparent; }
.performance-time-panel__column::-webkit-scrollbar-thumb { border: 1px solid transparent; border-radius: var(--spacing-25); background: var(--performance-time-scrollbar-thumb); background-clip: padding-box; }
.performance-time-panel__option { display: block; flex: 0 0 calc(var(--performance-control-height) - 2px); box-sizing: border-box; width: calc(100% - 6px); height: calc(var(--performance-control-height) - 2px); margin: 1px 3px; padding: var(--spacing-1) var(--spacing-2); border: 0; border-radius: var(--radius-sm); background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.performance-time-panel__option:hover { background: var(--color-bg-hover); }
.performance-time-panel__option[aria-selected="true"] { background: var(--color-primary-subtle); color: var(--color-primary-hover); }
.performance-time-panel__column:focus-visible { box-shadow: inset 0 0 0 1px var(--performance-field-border-focus); }
.performance-time-panel__tail { flex: 0 0 calc(var(--performance-time-panel-height) - var(--performance-control-height)); height: calc(var(--performance-time-panel-height) - var(--performance-control-height)); }
</style>

<style>
.performance-time-field-popup.el-popover.el-popper { min-width: 0; box-sizing: border-box; border-radius: var(--performance-control-radius); background: var(--color-bg-card); box-shadow: var(--performance-popover-shadow); }
</style>
