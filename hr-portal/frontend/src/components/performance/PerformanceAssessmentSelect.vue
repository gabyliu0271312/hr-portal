<template>
  <label ref="root" class="performance-assessment-select">
    <span v-if="label" class="field-label">{{ label }}<i v-if="required">*</i></span>
    <div :class="['select-shell', { invalid, open }]">
      <button ref="trigger" type="button" role="combobox" :aria-label="ariaLabel || label || undefined" :aria-expanded="open" :disabled="disabled" @click="open = !open" @keydown="onKeydown">
        <span :class="{ placeholder: !selected }">{{ selected?.label || placeholder }}</span>
        <DownBoldOutlinedIcon :size="12" />
      </button>
      <Teleport to="body">
        <div v-if="open" ref="menuRef" class="option-menu" role="listbox" :style="menuStyle" @keydown="onKeydown">
          <template v-if="options.length">
            <button v-for="option in options" :key="option.id" type="button" role="option" :aria-selected="option.id === modelValue" :class="{ selected: option.id === modelValue, active: option.id === activeId, 'has-description': Boolean(option.description) }" :aria-disabled="option.disabled ? true : undefined" :disabled="option.disabled || disabled" :title="option.disabled ? (option.disabledReason || defaultDisabledReason) : undefined" @mouseenter="!option.disabled && (activeId = option.id)" @click="select(option)">
              <span class="option-body"><strong>{{ option.label }}</strong><small v-if="option.description">{{ option.description }}</small></span>
              <em v-if="option.disabled">{{ option.disabledReason || defaultDisabledReason }}</em>
              <span class="option-check-slot" aria-hidden="true"><svg v-if="option.id === modelValue" class="option-check" viewBox="0 0 24 24"><path d="M4 11.293a1 1 0 0 1 1.414 0l4.072 4.07 9.07-9.07a1 1 0 0 1 1.415 0l.706.707a1 1 0 0 1 0 1.414L10.193 18.9a1 1 0 0 1-1.415 0l-5.485-5.485a1 1 0 0 1 0-1.414L4 11.293Z" fill="currentColor" /></svg></span>
            </button>
          </template>
          <div v-else class="option-empty">{{ emptyText }}</div>
        </div>
      </Teleport>
    </div>
    <span v-if="invalid" class="field-error">{{ label === '评估项' ? '评估项为必填' : '此项为必填' }}</span>
  </label>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DownBoldOutlinedIcon from './DownBoldOutlinedIcon.vue'

export interface PerformanceAssessmentSelectOption {
  id: string
  label: string
  description?: string
  disabled?: boolean
  disabledReason?: string
}
const props = withDefaults(defineProps<{
  modelValue?: string
  label: string
  ariaLabel?: string
  required?: boolean
  placeholder?: string
  options?: PerformanceAssessmentSelectOption[]
  invalid?: boolean
  emptyText?: string
  disabled?: boolean
}>(), { modelValue: '', required: false, placeholder: '', options: () => [], invalid: false, emptyText: '暂无数据', disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const open = ref(false)
const activeId = ref<string | null>(null)
const menuStyle = ref<Record<string, string>>({})
let observer: ResizeObserver | undefined
const defaultDisabledReason = '模板中已存在该评估项'
const selected = computed(() => props.options.find(option => option.id === props.modelValue))
function positionMenu() {
  const rect = root.value?.querySelector<HTMLElement>('.select-shell')?.getBoundingClientRect()
  if (!rect || !root.value) return
  const style = getComputedStyle(root.value)
  const gap = Number.parseFloat(style.getPropertyValue('--performance-select-popup-gap')) || 4
  const margin = Number.parseFloat(style.getPropertyValue('--performance-select-popup-viewport-margin')) || 8
  const maxHeight = Number.parseFloat(style.getPropertyValue('--performance-select-popup-max-height')) || 240
  const height = Math.min(maxHeight + 6, menuRef.value?.getBoundingClientRect().height || maxHeight + 6)
  const width = Math.min(rect.width, Math.max(0, window.innerWidth - margin * 2))
  const top = rect.bottom + gap + height <= window.innerHeight - margin ? rect.bottom + gap : Math.max(margin, rect.top - height - gap)
  menuStyle.value = { position: 'fixed', top: `${top}px`, left: `${Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))}px`, width: `${width}px`, zIndex: 'var(--performance-popover-z-index)' }
}
function updateMenuPosition() { if (open.value) void nextTick(positionMenu) }
watch(open, value => {
  if (value) activeId.value = props.options.find(option => !option.disabled && option.id === props.modelValue)?.id || props.options.find(option => !option.disabled)?.id || null
  updateMenuPosition()
})
watch(() => props.options, updateMenuPosition, { deep: true })
watch(() => props.disabled, disabled => { if (disabled) open.value = false })
watch(menuRef, element => {
  observer?.disconnect()
  if (element && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(positionMenu)
    observer.observe(element)
  }
}, { flush: 'post' })
function close() { open.value = false; void nextTick(() => trigger.value?.focus()) }
function select(option: PerformanceAssessmentSelectOption) {
  if (props.disabled || option.disabled) return
  emit('update:modelValue', option.id)
  close()
}
function onKeydown(event: KeyboardEvent) {
  if (props.disabled || event.isComposing || !['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape'].includes(event.key)) return
  event.preventDefault()
  event.stopPropagation()
  if (event.key === 'Escape') { close(); return }
  if (!open.value) { open.value = true; return }
  const options = props.options.filter(option => !option.disabled)
  if (!options.length) return
  if (event.key === 'Enter' || event.key === ' ') {
    const option = options.find(option => option.id === activeId.value)
    if (option) select(option)
    return
  }
  const index = options.findIndex(option => option.id === activeId.value)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length
  activeId.value = options[Math.max(0, next)].id
  void nextTick(() => menuRef.value?.querySelector<HTMLElement>('.active')?.scrollIntoView?.({ block: 'nearest' }))
}
function onOutside(event: PointerEvent) {
  if (event.target instanceof Node && !root.value?.contains(event.target) && !menuRef.value?.contains(event.target)) open.value = false
}
onMounted(() => {
  document.addEventListener('pointerdown', onOutside)
  window.addEventListener('resize', updateMenuPosition)
  window.addEventListener('scroll', updateMenuPosition, true)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  document.removeEventListener('pointerdown', onOutside)
  window.removeEventListener('resize', updateMenuPosition)
  window.removeEventListener('scroll', updateMenuPosition, true)
})
</script>

<style scoped>
.performance-assessment-select{display:block;min-width:0}.performance-assessment-select.inside-select{margin:var(--performance-input-field-gap) var(--spacing-5)}.field-label{display:block;margin-bottom:var(--performance-input-label-gap);font-weight:600}.field-label i{margin-left:var(--performance-required-mark-gap);color:var(--performance-field-error-color);font-style:normal}
.select-shell{position:relative;border:1px solid var(--performance-field-border);border-radius:var(--performance-control-radius)}.select-shell:hover,.select-shell.open{border-color:var(--performance-field-border-focus)}.select-shell.invalid{border-color:var(--performance-field-border-invalid)}.select-shell>button{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;height:30px;padding:1px var(--performance-select-padding-x);border:0;border-radius:var(--performance-control-radius);background:var(--color-bg-card);color:var(--color-text-primary);font:400 var(--font-size-md)/28px var(--font-sans);text-align:left;cursor:pointer}.select-shell>button>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.select-shell>button>svg{flex:0 0 12px;color:var(--performance-select-icon-color)}.select-shell>button:focus-visible{outline:0;box-shadow:var(--performance-field-focus-ring)}.select-shell>button:disabled{background:var(--performance-field-disabled-background);color:var(--performance-field-disabled-text);cursor:not-allowed}.placeholder{color:var(--color-text-placeholder)}
.option-menu{position:fixed;display:flex;flex-direction:column;box-sizing:border-box;max-height:calc(var(--performance-select-popup-max-height) + 6px);overflow:auto;padding:2px 0;border:var(--performance-popover-border-width) solid var(--performance-popover-border);border-radius:var(--performance-select-popup-radius);background:var(--performance-popover-background);box-shadow:var(--performance-popover-shadow);font:400 var(--font-size-md)/22px var(--font-sans);color:var(--color-text-primary)}.option-menu>button{position:relative;display:flex;flex-shrink:0;align-items:center;gap:8px;box-sizing:border-box;width:calc(100% - 6px);min-height:var(--performance-select-option-height);margin:1px 3px;padding:4px var(--performance-select-option-padding-x);border:0;border-radius:var(--radius-sm);background:transparent;color:inherit;text-align:left;font:inherit;cursor:pointer}.option-menu>button.has-description{min-height:var(--performance-select-option-detailed-height)}.option-menu>button.active,.option-menu>button:hover:not(:disabled){background:var(--performance-select-option-hover)}.option-menu>button.selected{color:var(--performance-select-check-color)}.option-menu>button:disabled{color:var(--performance-field-disabled-text);cursor:not-allowed}.option-body{display:flex;flex:1;min-width:0;flex-direction:column}.option-menu strong{font-weight:400}.option-menu small{color:var(--performance-select-option-description-color);font-size:var(--font-size-xs);line-height:var(--performance-select-option-description-line-height)}.option-menu em{flex:none;font-size:12px;font-style:normal}.option-check-slot{display:flex;align-items:center;flex:0 0 var(--performance-select-check-size);width:var(--performance-select-check-size);height:22px}.option-check{width:var(--performance-select-check-size);height:var(--performance-select-check-size)}.option-empty{padding:8px;color:var(--color-text-placeholder);text-align:center}.field-error{display:block;margin-top:var(--performance-field-error-gap);color:var(--performance-field-error-color);font-size:var(--performance-field-error-font-size);line-height:var(--performance-field-error-line-height)}
</style>
