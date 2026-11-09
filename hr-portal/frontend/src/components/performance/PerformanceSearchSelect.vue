<template>
  <PerformanceSelectShell
    :model-value="selectedValues"
    :selected-items="selectedItems"
    :placeholder="placeholder"
    :aria-label="ariaLabel"
    :popup-label="`${ariaLabel}选项`"
    :clear-label="`${ariaLabel}清空已选`"
    :selection-style="selectionStyle"
    :disabled-surface="disabledSurface"
    :hide-arrow="hideArrow"
    :open-on-search="remoteSearch"
    class="performance-search-select__trigger"
    :disabled="disabled"
    @update:query="onQueryChange"
    @open="$emit('open')"
    @update:model-value="updateValues"
  >
    <template #default="{ query, close, focus }">
      <div class="performance-flat-option-list" :class="{ 'performance-flat-option-list--checkmark': optionStyle === 'checkmark', 'performance-flat-option-list--detailed': optionLayout === 'detailed' }" role="listbox" :aria-label="`${ariaLabel}选项`">
        <button
          v-for="option in filteredOptions(query)"
          :key="option.value"
          class="performance-flat-option-list__option"
          :class="[
            { 'is-selected': selectedValues.includes(option.value), 'is-disabled': option.disabled, 'has-avatar': Boolean(option.avatarUrl), 'has-sublabel': Boolean(option.subLabel) },
            option.optionClass,
          ]"
          type="button"
          role="option"
          :aria-selected="selectedValues.includes(option.value)"
          :disabled="option.disabled"
          @click="select(option.value, close, focus)"
        >
          <img v-if="option.avatarUrl" class="performance-flat-option-list__avatar" :src="option.avatarUrl" alt="" aria-hidden="true" />
          <span v-else-if="option.avatarFallback" class="performance-flat-option-list__avatar performance-flat-option-list__avatar--fallback" aria-hidden="true">{{ option.avatarFallback }}</span>
          <span class="performance-flat-option-list__body">
            <span class="performance-flat-option-list__name" :class="{ 'has-sub': Boolean(option.subLabel) }">{{ option.label }}</span>
            <span v-if="option.subLabel" class="performance-flat-option-list__sub">{{ option.subLabel }}</span>
          </span>
          <svg v-if="optionStyle === 'checkmark' && selectedValues.includes(option.value)" class="performance-flat-option-list__checkmark" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
          <span v-if="option.disabled && option.disabledText" class="performance-flat-option-list__disabled-reason">{{ option.disabledText }}</span>
        </button>
        <div v-if="!filteredOptions(query).length" class="performance-flat-option-list__empty">{{ loading ? loadingText : emptyText }}</div>
      </div>
      <div v-if="$slots.footer" class="performance-flat-option-list__footer"><slot name="footer" :close="close" /></div>
    </template>
  </PerformanceSelectShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
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
  disabledSurface?: 'muted' | 'white'
  hideArrow?: boolean
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
  disabledSurface: 'muted',
  hideArrow: false,
  ariaLabel: '选择器',
})
const emit = defineEmits<{ 'update:modelValue': [value: SelectValue]; search: [value: string]; open: [] }>()
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
function onQueryChange(query: unknown) {
  if (props.remoteSearch && typeof query === 'string' && query.trim()) emit('search', query)
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
.performance-flat-option-list { min-width: 0; max-height: var(--performance-select-popup-max-height); overflow: auto; padding: 0; }
.performance-flat-option-list__option { display: flex; align-items: center; gap: var(--spacing-2); width: 100%; min-height: var(--performance-select-option-height); padding: 0 var(--performance-select-option-padding-x); border: 0; background: transparent; color: var(--color-text-primary); font: 400 var(--font-size-md)/22px var(--font-sans); text-align: left; cursor: pointer; }
.performance-flat-option-list__option.is-selected { background: var(--performance-select-option-selected); color: var(--performance-select-check-color); }
.performance-flat-option-list__option:hover { background: var(--performance-select-option-hover); }
.performance-flat-option-list__option.is-disabled { color: var(--performance-field-disabled-text); cursor: not-allowed; }
/* REA 员工搜索项（ud__select__list__item 441×52）：头像 32 圆 + 姓名 14 + 部门 12 */
.performance-flat-option-list__option.has-avatar, .performance-flat-option-list__option.has-sublabel { min-height: var(--performance-scope-search-item-height, 52px); }
.performance-flat-option-list__avatar { display: inline-flex; width: var(--performance-scope-search-avatar-size, 32px); height: var(--performance-scope-search-avatar-size, 32px); flex: 0 0 var(--performance-scope-search-avatar-size, 32px); align-items: center; justify-content: center; border-radius: 50%; background: var(--performance-member-avatar-background, #e5eaf5); color: var(--performance-member-avatar-color, #3b5b92); font-size: var(--performance-member-avatar-font-size, 13px); }
.performance-flat-option-list__avatar--fallback { background: var(--performance-member-avatar-background, #e5eaf5); }
.performance-flat-option-list__body { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.performance-flat-option-list__name { overflow: hidden; color: var(--color-text-primary); font-size: var(--font-size-md); line-height: var(--performance-scope-search-name-line-height, 22px); text-overflow: ellipsis; white-space: nowrap; }
.performance-flat-option-list__name.has-sub { line-height: var(--performance-scope-search-name-line-height, 22px); }
.performance-flat-option-list__sub { overflow: hidden; color: var(--performance-scope-search-dept-color, #8f959e); font-size: var(--font-size-xs); line-height: var(--performance-scope-search-dept-line-height, 22px); text-overflow: ellipsis; white-space: nowrap; }
.performance-flat-option-list__checkmark { flex: 0 0 var(--performance-select-check-size); width: var(--performance-select-check-size); height: var(--performance-select-check-size); margin-left: auto; color: var(--performance-select-check-color); }
.performance-flat-option-list__disabled-reason { flex: none; margin-left: auto; color: var(--performance-scope-search-dept-color, #8f959e); font-size: var(--font-size-md); line-height: 22px; white-space: nowrap; }
.performance-flat-option-list__empty { padding: var(--spacing-2) var(--performance-select-option-padding-x); color: var(--color-text-placeholder); line-height: 22px; }
.performance-flat-option-list--detailed { flex: 0 1 auto; padding-block: var(--performance-select-option-margin-block); }
.performance-flat-option-list--detailed .performance-flat-option-list__option { box-sizing: border-box; width: calc(100% - var(--performance-select-option-margin-inline) * 2); min-height: var(--performance-select-option-detailed-height); margin: var(--performance-select-option-margin-block) var(--performance-select-option-margin-inline); padding: var(--performance-select-option-padding-block) var(--performance-select-option-detailed-padding-inline); border-radius: var(--radius-sm); }
.performance-flat-option-list--detailed .performance-flat-option-list__option:hover, .performance-flat-option-list--detailed .performance-flat-option-list__option.is-selected { background: var(--performance-select-option-active-background); }
.performance-flat-option-list--detailed .performance-flat-option-list__sub { color: var(--performance-select-option-description-color); line-height: var(--performance-select-option-description-line-height); }
.performance-flat-option-list__footer { flex-shrink: 0; padding: var(--performance-select-footer-padding); border-top: var(--performance-popover-border-width) solid var(--performance-popover-border); }
.performance-flat-option-list__footer :deep(button) { display: flex; justify-content: flex-start; width: 100%; height: var(--performance-select-footer-height); }
</style>
