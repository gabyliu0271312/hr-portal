<template>
  <PerformanceSelectShell
    ref="shell"
    :model-value="selectedValues"
    :selected-items="selectedItems"
    :placeholder="placeholder"
    :aria-label="ariaLabel"
    :popup-label="`${ariaLabel}选项`"
    :clear-label="`${ariaLabel}清空已选`"
    :selection-style="selectionStyle"
    :tag-shape="tagShape"
    :search-prefix="searchPrefix"
    :tag-closable="tagClosable"
    :disabled-surface="disabledSurface"
    :hide-arrow="hideArrow"
    :auto-height="autoHeight"
    :open-on-search="remoteSearch"
    class="performance-search-select__trigger"
    :disabled="disabled"
    @update:query="onQueryChange"
    @open="onOpen"
    @close="onClose"
    @keydown="onKeydown"
    @update:model-value="updateValues"
  >
    <template #default="{ query, close, focus }">
      <div ref="optionList" class="performance-flat-option-list" :class="{ 'performance-flat-option-list--checkmark': optionStyle === 'checkmark', 'performance-flat-option-list--detailed': optionLayout === 'detailed' }" role="listbox" :aria-label="`${ariaLabel}选项`">
        <button
          v-for="option in visibleOptions"
          :key="option.value"
          class="performance-flat-option-list__option"
          :class="[
            { 'is-selected': selectedValues.includes(option.value), 'is-active': activeValue === option.value, 'is-disabled': option.disabled, 'has-avatar': Boolean(option.avatarUrl), 'has-sublabel': Boolean(option.subLabel) },
            option.optionClass,
          ]"
          type="button"
          role="option"
          :aria-selected="selectedValues.includes(option.value)"
          :disabled="option.disabled"
          @mouseenter="activeValue = option.disabled ? activeValue : option.value"
          @click="select(option.value, close, focus)"
        >
          <img v-if="option.avatarUrl" class="performance-flat-option-list__avatar" :src="option.avatarUrl" alt="" aria-hidden="true" />
          <span v-else-if="option.avatarFallback" class="performance-flat-option-list__avatar performance-flat-option-list__avatar--fallback" aria-hidden="true">{{ option.avatarFallback }}</span>
          <span class="performance-flat-option-list__body">
            <span class="performance-flat-option-list__name" :class="{ 'has-sub': Boolean(option.subLabel) }">
              <template v-if="highlightQuery && searchQuery">
                <template v-for="(part, index) in highlightParts(option.label)" :key="index">
                  <mark v-if="part.match" class="performance-flat-option-list__highlight">{{ part.text }}</mark>
                  <template v-else>{{ part.text }}</template>
                </template>
              </template>
              <template v-else>{{ option.label }}</template>
            </span>
            <span v-if="option.subLabel" class="performance-flat-option-list__sub">{{ option.subLabel }}</span>
          </span>
          <span v-if="optionStyle === 'checkmark'" class="performance-flat-option-list__check" aria-hidden="true"><svg v-if="selectedValues.includes(option.value)" class="performance-flat-option-list__checkmark" width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M4 11.293a1 1 0 0 1 1.414 0l4.072 4.07 9.07-9.07a1 1 0 0 1 1.415 0l.706.707a1 1 0 0 1 0 1.414L10.193 18.9a1 1 0 0 1-1.415 0l-5.485-5.485a1 1 0 0 1 0-1.414L4 11.293Z" fill="currentColor" /></svg></span>
          <span v-if="option.disabled && option.disabledText" class="performance-flat-option-list__disabled-reason">{{ option.disabledText }}</span>
        </button>
        <div v-if="!visibleOptions.length" class="performance-flat-option-list__empty">{{ loading ? loadingText : emptyText }}</div>
      </div>
      <div v-if="$slots.footer" class="performance-flat-option-list__footer"><slot name="footer" :close="close" /></div>
    </template>
  </PerformanceSelectShell>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import PerformanceSelectShell, { type PerformanceSelectItem } from './PerformanceSelectShell.vue'

export type PerformanceSearchSelectOption = PerformanceSelectItem & {
  display_name?: string
  searchText?: string
  disabled?: boolean
  /** 选项头像 URL（REA 员工搜索项 32 圆头像） */
  avatarUrl?: string
  /** 无头像时的文字兜底（成员列表约定：取名字末字） */
  avatarFallback?: string
  /** 副标签（REA 员工搜索项部门行 12px #8F959E） */
  subLabel?: string
  /** 附加选项 class（如高亮关键词） */
  optionClass?: string
  /** 禁用条目右侧展示原因（REA 员工搜索项「已在项目中」） */
  disabledText?: string
}
type SelectValue = string | string[] | null

const props = withDefaults(defineProps<{
  modelValue: SelectValue
  options?: PerformanceSearchSelectOption[]
  placeholder?: string
  emptyText?: string
  /** 远程搜索请求进行中（结果未返回时列表显示 loadingText 而非空态） */
  loading?: boolean
  loadingText?: string
  multiple?: boolean
  optionStyle?: 'checkmark' | 'none'
  optionLayout?: 'default' | 'detailed'
  /** 有搜索关键词后才显示结果（REA 员工选择器机制：输入→请求→列表） */
  remoteSearch?: boolean
  disabled?: boolean
  selectionStyle?: 'tags' | 'plain'
  /** 已选标签形态：员工多选使用 round（REA 实测胶囊 chip） */
  tagShape?: 'default' | 'round'
  /** 前置放大镜（搜索成员 combobox） */
  searchPrefix?: boolean
  /** 是否在标签上渲染单个移除 ×（单选用 false，仅右侧整体清除） */
  tagClosable?: boolean
  disabledSurface?: 'muted' | 'white'
  hideArrow?: boolean
  /** 多选时按内容换行展示全部标签（筛选弹窗多选状态实测行为） */
  autoHeight?: boolean
  /** 远程搜索时高亮匹配关键词（员工搜索项实测行为） */
  highlightQuery?: boolean
  ariaLabel?: string
}>(), {
  options: () => [],
  placeholder: '请选择',
  emptyText: '暂无可选项',
  loading: false,
  loadingText: '搜索中',
  multiple: false,
  optionStyle: 'checkmark',
  optionLayout: 'default',
  remoteSearch: false,
  disabled: false,
  selectionStyle: 'tags',
  tagShape: 'default',
  searchPrefix: false,
  tagClosable: true,
  disabledSurface: 'muted',
  hideArrow: false,
  autoHeight: false,
  highlightQuery: false,
  ariaLabel: '选择器',
})
const emit = defineEmits<{ 'update:modelValue': [value: SelectValue]; search: [value: string]; open: []; close: [] }>()
const shell = ref<InstanceType<typeof PerformanceSelectShell> | null>(null)
const activeValue = ref<string | null>(null)
const optionList = ref<HTMLElement | null>(null)
const searchQuery = ref('')
const selectedValues = computed(() => props.multiple ? (Array.isArray(props.modelValue) ? props.modelValue : []) : (typeof props.modelValue === 'string' && props.modelValue ? [props.modelValue] : []))
const selectedItems = computed(() => selectedValues.value.map(value => props.options.find(option => option.value === value) || { value, label: value }))

function filteredOptions(query: string) {
  const keyword = query.trim().toLowerCase()
  let result: PerformanceSearchSelectOption[]
  if (props.remoteSearch) {
    // 远程搜索：未输入关键词不显示结果（REA 实测行为）；
    // 输入关键词后先按本地 options 过滤（未接远程搜索的使用方仍可输入过滤；
    // 接远程搜索的使用方外部更新 options 后此处二次过滤结果一致）
    result = !keyword ? [] : props.options.filter(option => (option.searchText || option.label).toLowerCase().includes(keyword))
  } else {
    result = !keyword ? props.options : props.options.filter(option => (option.searchText || option.label).toLowerCase().includes(keyword))
  }
  return result
}
function highlightParts(label: string) {
  const query = searchQuery.value.trim()
  if (!query) return [{ text: label, match: false }]
  const index = label.toLowerCase().indexOf(query.toLowerCase())
  if (index < 0) return [{ text: label, match: false }]
  const parts: Array<{ text: string; match: boolean }> = []
  if (index > 0) parts.push({ text: label.slice(0, index), match: false })
  parts.push({ text: label.slice(index, index + query.length), match: true })
  if (index + query.length < label.length) parts.push({ text: label.slice(index + query.length), match: false })
  return parts
}
const visibleOptions = computed(() => filteredOptions(searchQuery.value))
watch(visibleOptions, options => {
  if (!options.some(option => option.value === activeValue.value && !option.disabled)) {
    activeValue.value = options.find(option => !option.disabled)?.value || null
  }
})
function onOpen() {
  const enabled = visibleOptions.value.filter(option => !option.disabled)
  activeValue.value = enabled.find(option => selectedValues.value.includes(option.value))?.value || enabled[0]?.value || null
  emit('open')
}
function onClose() {
  activeValue.value = null
  searchQuery.value = ''
  emit('close')
}
function onKeydown(event: KeyboardEvent) {
  if (props.disabled || event.defaultPrevented || event.isComposing) return
  if (!(event.target instanceof HTMLElement) || !event.target.matches('[role="combobox"], [role="option"]')) return
  const inputTarget = event.target instanceof HTMLInputElement && !event.target.readOnly
  if (event.key === ' ' && inputTarget) return
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape'].includes(event.key)) return
  if ((event.key === 'Home' || event.key === 'End') && inputTarget) return
  if (!shell.value?.isOpen) {
    if (!['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) return
    event.preventDefault()
    shell.value?.openMenu()
    return
  }
  event.preventDefault()
  event.stopPropagation()
  if (event.key === 'Escape') { shell.value.close(); return }
  const options = visibleOptions.value.filter(option => !option.disabled)
  if (!options.length) return
  const current = options.findIndex(option => option.value === activeValue.value)
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length
    activeValue.value = options[Math.max(0, next)].value
    void nextTick(() => optionList.value?.querySelector<HTMLElement>('.is-active')?.scrollIntoView?.({ block: 'nearest' }))
    return
  }
  const option = options.find(item => item.value === activeValue.value)
  if (option) select(option.value, () => shell.value?.close(), () => shell.value?.focusSearch())
}
function onQueryChange(query: unknown) {
  if (typeof query !== 'string') return
  searchQuery.value = query
  if (props.remoteSearch && query.trim()) emit('search', query)
}
function updateValues(values: string[]) {
  emit('update:modelValue', props.multiple ? values : (values[0] || null))
}
function select(value: string, close: () => void, focus: () => void) {
  if (props.multiple) {
    const values = new Set(selectedValues.value)
    if (values.has(value)) values.delete(value)
    else values.add(value)
    emit('update:modelValue', [...values])
    focus()
  } else {
    emit('update:modelValue', value)
    close()
  }
}
</script>

<style scoped>
.performance-flat-option-list { display: flex; flex-direction: column; min-width: 0; max-height: var(--performance-select-popup-max-height); overflow: auto; padding: 2px 0; }
.performance-flat-option-list__option { position: relative; display: flex; flex-shrink: 0; align-items: center; gap: var(--spacing-2); width: calc(100% - 6px); min-height: var(--performance-select-option-height); margin: 1px 3px; padding: 4px var(--performance-select-option-padding-x); box-sizing: border-box; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-primary); font: 400 var(--font-size-md)/22px var(--font-sans); text-align: left; cursor: pointer; }
.performance-flat-option-list__option.is-selected { color: var(--performance-select-check-color); }
.performance-flat-option-list__option.is-active { background: var(--performance-select-option-hover); }
.performance-flat-option-list__option:hover:not(:disabled) { background: var(--performance-select-option-hover); }
.performance-flat-option-list__option.is-disabled { color: var(--performance-field-disabled-text); cursor: not-allowed; }
/* REA 员工搜索项（ud__select__list__item 441×52）：头像 32 圆 + 姓名 14 + 部门 12 */
.performance-flat-option-list__option.has-avatar, .performance-flat-option-list__option.has-sublabel { min-height: var(--performance-scope-search-item-height); }
.performance-flat-option-list__avatar { display: inline-flex; width: var(--performance-scope-search-avatar-size); height: var(--performance-scope-search-avatar-size); flex: 0 0 var(--performance-scope-search-avatar-size); align-items: center; justify-content: center; border-radius: 50%; background: var(--performance-member-avatar-background); color: var(--performance-member-avatar-color); font-size: var(--performance-member-avatar-font-size); }
.performance-flat-option-list__avatar--fallback { background: var(--performance-member-avatar-background); }
.performance-flat-option-list__body { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.performance-flat-option-list__name { overflow: hidden; color: inherit; font-size: var(--font-size-md); line-height: var(--performance-scope-search-name-line-height); text-overflow: ellipsis; white-space: nowrap; }
.performance-flat-option-list__name.has-sub { line-height: var(--performance-scope-search-name-line-height); }
.performance-flat-option-list__highlight { background: transparent; color: var(--performance-select-check-color); }
.performance-flat-option-list__sub { overflow: hidden; color: var(--performance-scope-search-dept-color); font-size: var(--font-size-xs); line-height: var(--performance-scope-search-dept-line-height); text-overflow: ellipsis; white-space: nowrap; }
.performance-flat-option-list__check { display: flex; align-items: center; flex: 0 0 var(--performance-select-check-size); width: var(--performance-select-check-size); height: 22px; margin-left: auto; color: var(--performance-select-check-color); }
.performance-flat-option-list__checkmark { width: var(--performance-select-check-size); height: var(--performance-select-check-size); }
.performance-flat-option-list__disabled-reason { flex: none; margin-left: auto; color: var(--performance-scope-search-dept-color); font-size: var(--font-size-md); line-height: var(--performance-scope-search-name-line-height); white-space: nowrap; }
.performance-flat-option-list__empty { padding: var(--spacing-2) var(--performance-select-option-padding-x); color: var(--color-text-placeholder); line-height: 22px; }
.performance-flat-option-list--detailed { flex: 0 1 auto; padding-block: var(--performance-select-option-margin-block); }
.performance-flat-option-list--detailed .performance-flat-option-list__option { box-sizing: border-box; width: calc(100% - var(--performance-select-option-margin-inline) * 2); min-height: var(--performance-select-option-detailed-height); margin: var(--performance-select-option-margin-block) var(--performance-select-option-margin-inline); padding: var(--performance-select-option-padding-block) var(--performance-select-option-detailed-padding-inline); border-radius: var(--radius-sm); }
.performance-flat-option-list--detailed .performance-flat-option-list__option.is-active { background: var(--performance-select-option-active-background); }
.performance-flat-option-list--detailed .performance-flat-option-list__sub { color: var(--performance-select-option-description-color); line-height: var(--performance-select-option-description-line-height); }
.performance-flat-option-list__footer { flex-shrink: 0; padding: var(--performance-select-footer-padding); border-top: var(--performance-popover-border-width) solid var(--performance-popover-border); }
.performance-flat-option-list__footer :deep(button) { display: flex; justify-content: flex-start; width: 100%; height: var(--performance-select-footer-height); }
</style>
