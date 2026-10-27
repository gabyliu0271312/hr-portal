<template>
  <div ref="root" class="performance-select-shell" :class="{ 'is-open': open }">
    <div class="performance-select-shell__selector" :class="[$attrs.class, { 'has-value': selectedItems.length, disabled, 'disabled-white': disabledSurface === 'white', 'is-plain': selectionStyle === 'plain' }]" :aria-invalid="$attrs['aria-invalid'] === true || $attrs['aria-invalid'] === 'true' ? 'true' : undefined" @click="openMenu">
      <div ref="content" class="performance-select-shell__content">
        <span v-if="!selectedItems.length && !query" class="performance-select-shell__placeholder">{{ placeholder }}</span>
        <PerformanceSelectTag v-for="item in visibleItems" :key="item.value" :label="item.label" :closable="selectionStyle !== 'plain'" :disabled="disabled" @remove="removeValue(item.value)" />
        <ElPopover v-if="overflowItems.length" placement="top" trigger="hover" :width="'auto'" :show-after="0" :hide-after="100" :teleported="true" :popper-style="{ zIndex: 'calc(var(--performance-popover-z-index) + 1)' }" popper-class="performance-select-overflow-popper">
          <template #reference><button class="performance-select-shell__overflow-count" type="button" :aria-label="`${ariaLabel}还有${overflowItems.length}项`" @click.stop>+{{ overflowItems.length }}</button></template>
          <div class="performance-select-shell__overflow-items" :aria-label="`${ariaLabel}已选隐藏项`" @pointerdown.stop>
            <PerformanceSelectTag v-for="item in overflowItems" :key="item.value" :label="item.label" :disabled="disabled" @remove="removeValue(item.value, false)" />
          </div>
        </ElPopover>
        <input ref="searchInput" v-model="query" class="performance-select-shell__input" type="search" role="combobox" autocomplete="off" :disabled="disabled" :readonly="selectionStyle === 'plain'" :aria-label="ariaLabel" :aria-invalid="$attrs['aria-invalid'] === true || $attrs['aria-invalid'] === 'true' ? 'true' : undefined" :aria-expanded="open" :placeholder="selectedItems.length ? undefined : placeholder" :style="{ width: query ? `${Math.max(6, query.length * 14)}px` : '6px' }" @focus="openOnFocus && openMenu()" @keydown.esc.stop="close" />
      </div>
      <button v-if="selectedItems.length && selectionStyle !== 'plain'" class="performance-select-shell__clear" type="button" :disabled="disabled" :aria-label="clearLabel" @click.stop="clearAll">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor" /><path d="m8 8 8 8M16 8l-8 8" stroke="white" stroke-width="2" /></svg>
      </button>
      <DownBoldOutlinedIcon :size="12" class="performance-select-shell__arrow" />
    </div>
    <div ref="measureRoot" class="performance-select-shell__measure" aria-hidden="true" inert>
      <span v-for="item in selectedItems" :key="item.value" class="performance-select-shell__measure-tag"><PerformanceSelectTag :label="item.label" :closable="selectionStyle !== 'plain'" measuring /></span>
      <span v-for="count in selectedItems.length" :key="`count-${count}`" class="performance-select-shell__overflow-count">+{{ count }}</span>
    </div>
    <Teleport to="body">
      <div v-if="open" ref="popup" class="performance-select-shell__popup" :style="{ ...popupStyle, height: popupHeightStyle, maxHeight: `${popupMaxHeight}px` }">
        <section class="performance-select-shell__dialog" role="dialog" :aria-label="popupLabel"><slot :query="query" :close="close" :focus="focusSearch" /></section>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElPopover } from 'element-plus'
import DownBoldOutlinedIcon from './DownBoldOutlinedIcon.vue'
import PerformanceSelectTag from './PerformanceSelectTag.vue'

defineOptions({ inheritAttrs: false })
export type PerformanceSelectItem = { value: string; label: string }
const props = withDefaults(defineProps<{
  modelValue: string[]
  selectedItems?: PerformanceSelectItem[]
  placeholder?: string
  ariaLabel?: string
  popupLabel?: string
  clearLabel?: string
  popupHeight?: number | 'auto'
  popupWidth?: number
  popupMaxHeight?: number
  selectionStyle?: 'tags' | 'plain'
  openOnFocus?: boolean
  disabledSurface?: 'muted' | 'white'
  disabled?: boolean
}>(), {
  selectedItems: () => [], placeholder: '请选择', ariaLabel: '选择器', popupLabel: '选项', clearLabel: '清空已选',
  popupHeight: 'auto', popupWidth: undefined, popupMaxHeight: 320, selectionStyle: 'tags', openOnFocus: true, disabledSurface: 'muted', disabled: false,
})
const emit = defineEmits<{ 'update:modelValue': [value: string[]]; 'update:query': [value: string]; open: []; close: [] }>()
const root = ref<HTMLElement | null>(null)
const content = ref<HTMLElement | null>(null)
const measureRoot = ref<HTMLElement | null>(null)
const popup = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const open = ref(false)
const visibleCount = ref(props.selectedItems.length)
const query = defineModel<string>('query', { default: '' })
const popupStyle = ref<Record<string, string>>({ visibility: 'hidden' })
const popupHeightStyle = computed(() => props.popupHeight === 'auto' ? 'auto' : `${props.popupHeight}px`)
const visibleItems = computed(() => props.selectedItems.slice(0, props.selectionStyle === 'plain' ? 1 : visibleCount.value))
const overflowItems = computed(() => props.selectionStyle === 'plain' ? [] : props.selectedItems.slice(visibleCount.value))

function measureVisibleItems() {
  const width = content.value?.getBoundingClientRect().width
  if (!width || props.selectionStyle === 'plain') { visibleCount.value = props.selectedItems.length; return }
  const tags = Array.from(measureRoot.value?.querySelectorAll<HTMLElement>('.performance-select-shell__measure-tag') || [])
  const counters = Array.from(measureRoot.value?.querySelectorAll<HTMLElement>('.performance-select-shell__overflow-count') || [])
  const available = width - (searchInput.value?.getBoundingClientRect().width || 6)
  const widths = tags.map(tag => tag.getBoundingClientRect().width)
  if (widths.reduce((sum, width) => sum + width, 0) <= available) { visibleCount.value = tags.length; return }
  let used = 0
  let count = 0
  for (; count < tags.length; count += 1) {
    const next = used + widths[count]
    const remaining = tags.length - count - 1
    const counter = counters[remaining - 1]
    const reserve = remaining && counter ? counter.getBoundingClientRect().width + (Number.parseFloat(getComputedStyle(counter).marginRight) || 0) : 0
    if (next + reserve > available) break
    used = next
  }
  visibleCount.value = count
}
function updatePosition() {
  if (!open.value || !root.value) return
  const box = root.value.getBoundingClientRect()
  const gap = 4
  const margin = 8
  const popupContentHeight = props.popupHeight === 'auto' ? Math.min(props.popupMaxHeight, popup.value?.getBoundingClientRect().height || props.popupMaxHeight) : props.popupHeight
  const top = box.bottom + gap + popupContentHeight <= window.innerHeight - margin ? box.bottom + gap : Math.max(margin, box.top - popupContentHeight - gap)
  const width = props.popupWidth ?? box.width
  const left = Math.max(margin, Math.min(box.left, window.innerWidth - width - margin))
  popupStyle.value = { position: 'fixed', top: `${top}px`, left: `${left}px`, width: `${width}px`, visibility: 'visible' }
}
function openMenu() {
  if (props.disabled || open.value) return
  open.value = true
  popupStyle.value = { visibility: 'hidden' }
  emit('open')
  void nextTick(() => { measureVisibleItems(); updatePosition(); focusSearch() })
}
function close() {
  if (!open.value) return
  open.value = false
  query.value = ''
  emit('close')
  popupStyle.value = { visibility: 'hidden' }
}
function focusSearch() { void nextTick(() => searchInput.value?.focus()) }
function removeValue(value: string, focus = true) {
  if (props.disabled) return
  emit('update:modelValue', props.modelValue.filter(item => item !== value))
  if (focus) focusSearch()
}
function clearAll() { if (!props.disabled) { emit('update:modelValue', []); focusSearch() } }
function onOutside(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof Node) || root.value?.contains(target) || popup.value?.contains(target)) return
  close()
}
function onViewportChange() { if (open.value) updatePosition() }
watch([() => props.selectedItems, () => props.selectionStyle, query], () => { visibleCount.value = props.selectedItems.length; void nextTick(measureVisibleItems) }, { deep: true })
watch(() => props.disabled, disabled => { if (disabled) close() })
onMounted(() => {
  void nextTick(measureVisibleItems)
  document.addEventListener('pointerdown', onOutside)
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('scroll', onViewportChange, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutside)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
})
</script>

<style scoped>
.performance-select-shell { position: relative; width: 100%; min-width: 0; }
.performance-select-shell__selector { position: relative; display: flex; align-items: center; overflow: hidden; width: 100%; height: var(--performance-select-height); padding: 1px var(--performance-select-padding-x); box-sizing: border-box; border: 1px solid var(--performance-field-border); border-radius: var(--performance-control-radius); background: var(--color-bg-card); color: var(--color-text-primary); font: 400 var(--font-size-md)/22px var(--font-sans); cursor: pointer; }
.performance-select-shell__selector.has-value { padding-left: var(--performance-select-padding-value-left); }
.performance-select-shell__selector.is-plain.has-value { padding-left: var(--performance-select-padding-x); }
.performance-select-shell__selector.is-plain :deep(.performance-select-shell__tag) { flex-shrink: 1; margin: 0; padding: 0; background: transparent; }
.performance-select-shell__selector.is-plain :deep(.performance-select-shell__tag-content) { max-width: none; }
.performance-select-shell__selector.is-plain .performance-select-shell__input { position: absolute; inset: 0; width: 100% !important; color: transparent; caret-color: transparent; }
.performance-select-shell__selector.is-plain .performance-select-shell__placeholder { position: relative; pointer-events: none; }
.performance-select-shell__selector.is-plain .performance-select-shell__input::placeholder { color: transparent; }
.performance-select-shell__selector.disabled { background: var(--performance-field-disabled-background); color: var(--performance-field-disabled-text); cursor: not-allowed; }
.performance-select-shell__selector.disabled.disabled-white { background: var(--color-bg-card); color: var(--color-text-primary); }
.performance-select-shell__selector:not(.disabled):hover, .performance-select-shell.is-open .performance-select-shell__selector { border-color: var(--performance-field-border-focus); }
.performance-select-shell__selector[aria-invalid="true"] { border-color: var(--performance-field-border-invalid); }
.performance-select-shell__content { position: relative; display: flex; overflow: hidden; min-width: 0; flex: 1; flex-wrap: nowrap; align-items: center; height: var(--performance-select-content-height); }
.performance-select-shell__placeholder { overflow: hidden; min-width: 0; max-width: 100%; color: var(--color-text-placeholder); line-height: var(--performance-select-content-height); text-overflow: ellipsis; white-space: nowrap; }
.performance-select-shell__overflow-count { display: inline-flex; align-items: center; height: var(--performance-select-tag-height); flex: 0 0 auto; margin: 2px var(--performance-select-tag-gap) 2px 0; padding: 0 var(--performance-select-tag-padding-x); border: 0; border-radius: var(--performance-select-tag-radius); background: var(--performance-select-tag-background); color: var(--performance-select-tag-text); font: inherit; white-space: nowrap; cursor: pointer; }
.performance-select-shell__input { height: var(--performance-select-content-height); min-width: 6px; max-width: 100%; flex-shrink: 0; margin: 0; padding: 0; border: 0; outline: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.performance-select-shell__input::-webkit-search-cancel-button { display: none; }
.performance-select-shell__selector:not(.has-value) .performance-select-shell__input { position: absolute; inset: 0; width: 100% !important; }
.performance-select-shell__clear { position: absolute; right: var(--performance-select-padding-x); display: flex; width: 12px; height: 28px; flex: 0 0 12px; align-items: center; margin-left: var(--spacing-2); padding: 0; border: 0; background: transparent; color: var(--performance-select-icon-color); cursor: pointer; opacity: 0; pointer-events: none; }
.performance-select-shell__clear svg { width: 12px; height: 12px; }
.performance-select-shell__selector:hover .performance-select-shell__clear, .performance-select-shell__clear:focus-visible { opacity: 1; pointer-events: auto; }
.performance-select-shell__selector.has-value:not(.is-plain):hover .performance-select-shell__arrow { visibility: hidden; }
.performance-select-shell__arrow { flex: 0 0 12px; margin-left: var(--spacing-2); color: var(--performance-select-icon-color); }
.performance-select-shell__popup { z-index: var(--performance-popover-z-index); display: flex; flex-direction: column; box-sizing: border-box; }
.performance-select-shell__dialog { display: flex; min-width: 0; min-height: 0; flex: 1; flex-direction: column; overflow: hidden; border-radius: var(--performance-popover-radius); outline: 0; background: var(--performance-popover-background); box-shadow: var(--performance-popover-shadow); }
.performance-select-shell__overflow-items { display: flex; flex-wrap: wrap; max-width: min(var(--performance-select-overflow-popup-max-width), calc(100vw - 48px)); }
.performance-select-shell__measure { position: absolute; top: 0; left: 0; display: flex; width: max-content; height: 0; overflow: hidden; visibility: hidden; pointer-events: none; font: 400 var(--font-size-md)/22px var(--font-sans); }
.performance-select-shell__measure-tag { display: inline-flex; }
:global(.performance-select-overflow-popper.el-popover) { min-width: 0; max-width: calc(100vw - 24px); padding: var(--performance-select-overflow-popup-padding); border-radius: var(--performance-popover-radius); background: var(--performance-popover-background); box-shadow: var(--performance-popover-shadow); }
</style>
