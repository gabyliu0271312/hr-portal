<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { projectManagementApi, type PerformanceMemberFilterField, type PerformanceMemberFilterOption, type PerformanceHrbpOrganizationNode } from '@/api/performance'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import PerformanceOrganizationSelect from './PerformanceOrganizationSelect.vue'
import PerformanceDateTimeField from './PerformanceDateTimeField.vue'
import PerformanceSelectShell from './PerformanceSelectShell.vue'
import PerformanceRatingTag from './PerformanceRatingTag.vue'
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import UiButton from '@/components/ui/UiButton.vue'

const props = defineProps<{ modelValue: string[]; field: PerformanceMemberFilterField; cycleId: number }>()
const emit = defineEmits<{ 'update:modelValue': [values: string[]]; 'options-loaded': [options: PerformanceMemberFilterOption[]] }>()
const options = ref<PerformanceMemberFilterOption[]>([])
const loading = ref(false)
const error = ref('')
let sequence = 0
let timer: ReturnType<typeof setTimeout> | undefined
let lastQuery = ''
watch(() => [props.field, props.cycleId], () => { ++sequence; clearTimeout(timer); options.value = [...props.field.options]; error.value = ''; loading.value = false }, { immediate: true })
onBeforeUnmount(() => { ++sequence; clearTimeout(timer) })
async function search(query: string) {
  clearTimeout(timer)
  lastQuery = query
  const request = ++sequence
  loading.value = true
  error.value = ''
  timer = setTimeout(async () => {
    try {
      const result = await projectManagementApi.cycleMemberFilterOptions(props.cycleId, props.field.key, query)
      if (request !== sequence) return
      const incoming = result.fields.find(field => field.key === props.field.key)?.options || []
      options.value = [...options.value.filter(option => props.modelValue.includes(option.value)), ...incoming.filter(option => !props.modelValue.includes(option.value))]
      emit('options-loaded', options.value)
    } catch { if (request === sequence) error.value = '人员搜索失败，请重试' }
    finally { if (request === sequence) loading.value = false }
  }, 250)
}
const selected = computed(() => props.modelValue.map(value => options.value.find(option => option.value === value) || { value, label: value }))
const nodes = computed(() => {
  function convert(items: PerformanceMemberFilterOption[], level = 0): PerformanceHrbpOrganizationNode[] {
    return items.map(item => ({ value: item.value, label: item.label, level, children: convert(item.children || [], level + 1) }))
  }
  if (options.value.some(option => option.children?.length)) return convert(options.value)
  const roots: PerformanceHrbpOrganizationNode[] = []
  for (const option of options.value) {
    const parts = option.value.split('/').filter(Boolean)
    let siblings = roots
    parts.forEach((label, level) => {
      const value = parts.slice(0, level + 1).join('/')
      let node = siblings.find(item => item.value === value)
      if (!node) { node = { value, label: level === parts.length - 1 ? option.label.split('/').pop() || label : label, level, children: [] }; siblings.push(node) }
      siblings = node.children
    })
  }
  return roots
})
const allSelected = computed(() => options.value.length > 0 && options.value.every(option => props.modelValue.includes(option.value)))
function toggle(value: string) { emit('update:modelValue', props.modelValue.includes(value) ? props.modelValue.filter(item => item !== value) : [...props.modelValue, value]) }
function dateValue(index: number, value: string) { const next = [...props.modelValue]; next[index] = value; emit('update:modelValue', next) }
</script>

<template>
  <div class="member-filter-value">
    <div v-if="field.kind === 'date'" class="member-filter-value__dates">
      <PerformanceDateTimeField :model-value="modelValue[0] || ''" date-only placeholder="开始日期" :aria-label="`${field.label}开始日期`" @update:model-value="dateValue(0, $event)" />
      <span aria-hidden="true">—</span>
      <PerformanceDateTimeField :model-value="modelValue[1] || ''" date-only placeholder="结束日期" :aria-label="`${field.label}结束日期`" @update:model-value="dateValue(1, $event)" />
    </div>
    <PerformanceOrganizationSelect v-else-if="field.kind === 'organization'" :model-value="modelValue" :nodes="nodes" :aria-label="field.label" placeholder="请选择" selection-indicator="checkbox" @update:model-value="emit('update:modelValue', $event)" />
    <PerformanceSearchSelect v-else-if="field.kind === 'person'" :model-value="modelValue" :options="options" multiple remote-search :loading="loading" :aria-label="field.label" placeholder="搜索成员" @search="search" @update:model-value="emit('update:modelValue', Array.isArray($event) ? $event : [])" />
    <PerformanceSelectShell v-else :model-value="modelValue" :selected-items="selected" :aria-label="field.label" :popup-label="`${field.label}选项`" placeholder="请选择" @update:model-value="emit('update:modelValue', $event)">
      <template #default="{ query }">
        <div role="listbox" aria-multiselectable="true" :aria-label="`${field.label}选项`" class="member-filter-value__options">
          <UiButton v-for="option in options.filter(item => `${item.label} ${item.subLabel || ''}`.toLowerCase().includes(query.trim().toLowerCase()))" :key="option.value" variant="text" role="option" :aria-selected="modelValue.includes(option.value)" class="member-filter-value__option" @click="toggle(option.value)">
            <PerformanceRatingTag v-if="field.key.startsWith('rating:')" :label="option.label" :color="option.color || undefined" />
            <span v-else>{{ option.label }}</span>
            <span v-if="option.subLabel" class="member-filter-value__description">{{ option.subLabel }}</span>
            <span v-if="modelValue.includes(option.value)" class="member-filter-value__check" aria-hidden="true">✓</span>
          </UiButton>
          <p v-if="!options.length" class="member-filter-value__empty">暂无可选项</p>
        </div>
        <div v-if="options.length" class="member-filter-value__footer">
          <PerformanceCheckbox :model-value="allSelected" :indeterminate="modelValue.length > 0 && !allSelected" :label="`全选 (${options.length})`" @update:model-value="emit('update:modelValue', $event ? options.map(option => option.value) : [])" />
        </div>
      </template>
    </PerformanceSelectShell>
    <p v-if="error" role="alert" class="member-filter-value__error">{{ error }} <UiButton variant="text" @click="search(lastQuery)">重试</UiButton></p>
  </div>
</template>

<style scoped>
.member-filter-value{min-width:0;flex:1}
.member-filter-value__dates{display:flex;align-items:center;gap:var(--spacing-2);min-width:0}
.member-filter-value__dates>*{min-width:0}
.member-filter-value__options{display:flex;flex-direction:column;max-height:var(--performance-select-popup-max-height);overflow:auto;padding:var(--spacing-1)}
.member-filter-value__option{display:flex;justify-content:flex-start;width:100%;min-height:var(--performance-select-option-height);gap:var(--spacing-3);text-align:left;font-size:var(--font-size-md);line-height:var(--performance-popover-line-height);color:var(--color-text-primary)}
.member-filter-value__option:hover{background:var(--performance-select-option-hover)}
.member-filter-value__description{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--color-text-secondary)}
.member-filter-value__check{margin-left:auto;color:var(--color-primary)}
.member-filter-value__footer{padding:var(--performance-select-footer-padding);border-top:var(--performance-popover-border-width) solid var(--performance-popover-border)}
.member-filter-value__empty{margin:0;padding:var(--spacing-2);color:var(--color-text-placeholder)}
.member-filter-value__error{margin:0;color:var(--color-danger);font-size:var(--font-size-sm)}
</style>
