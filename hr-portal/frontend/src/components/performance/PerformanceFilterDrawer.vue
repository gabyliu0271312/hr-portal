<template>
  <UiDrawerShell
    v-model="visible"
    :title="title"
    width="var(--drawer-width)"
    hide-close
    z-index="var(--performance-filter-drawer-z-index)"
    class="performance-filter-drawer"
    :aria-label="title"
    @close="cancel"
  >
    <form class="performance-filter-drawer__form" novalidate @submit.prevent="confirm">
      <div v-for="field in fields" :key="field.key" class="performance-filter-drawer__field">
        <span class="performance-filter-drawer__label">{{ field.label }}</span>
        <PerformancePersonSelect
          v-if="field.type === 'person'"
          :model-value="draft[field.key] || []"
          :options="personOptions[field.key] || []"
          :loading="personLoading[field.key] || false"
          :multiple="field.multiple !== false"
          :remote-search="true"
          :tag-shape="'round'"
          :placeholder="field.placeholder || '请选择'"
          :aria-label="field.label"
          @search="keyword => searchPeople(field, keyword)"
          @update:model-value="value => setValue(field.key, Array.isArray(value) ? value : value ? [value] : [])"
        />
        <PerformanceOrganizationTreeSelect
          v-else-if="field.type === 'tree'"
          :model-value="draft[field.key] || []"
          :nodes="field.nodes"
          :selection-indicator="field.selectionIndicator || 'checkmark'"
          :selected-surface="field.selectedSurface || 'filled'"
          :max-visible-tags="field.maxVisibleTags ?? 0"
          :placeholder="field.placeholder || '请选择'"
          :aria-label="field.label"
          :popup-label="`${field.label}选项`"
          @update:model-value="value => setValue(field.key, value)"
        />
        <PerformanceDateRangePicker
          v-else
          :model-value="draft[field.key] || []"
          :aria-label="field.label"
          :start-placeholder="field.placeholder || '开始日期'"
          :end-placeholder="'结束日期'"
          @update:model-value="value => setValue(field.key, value)"
        />
      </div>
    </form>
    <template #footer>
      <footer class="performance-filter-drawer__footer">
        <UiButton variant="primary" @click="confirm">确定</UiButton>
        <UiButton variant="secondary" @click="cancel">取消</UiButton>
        <UiButton variant="link" @click="clear">清除</UiButton>
      </footer>
    </template>
  </UiDrawerShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PerformanceHrbpOrganizationNode } from '@/api/performance'
import type { PerformanceSearchSelectOption } from './PerformanceSearchSelect.vue'
import PerformancePersonSelect from './PerformancePersonSelect.vue'
import PerformanceOrganizationTreeSelect from './PerformanceOrganizationTreeSelect.vue'
import PerformanceDateRangePicker from './PerformanceDateRangePicker.vue'
import UiDrawerShell from '@/components/ui/UiDrawerShell.vue'
import UiButton from '@/components/ui/UiButton.vue'

export type PerformanceFilterDrawerField =
  | { key: string; label: string; type: 'person'; multiple?: boolean; placeholder?: string; loadOptions: (keyword: string) => Promise<PerformanceSearchSelectOption[]> }
  | { key: string; label: string; type: 'tree'; nodes: PerformanceHrbpOrganizationNode[]; placeholder?: string; selectionIndicator?: 'checkmark' | 'checkbox'; selectedSurface?: 'plain' | 'filled'; maxVisibleTags?: number }
  | { key: string; label: string; type: 'dateRange'; placeholder?: string }

export type PerformanceFilterDrawerValues = Record<string, string[]>

const props = withDefaults(defineProps<{
  modelValue: boolean
  fields: PerformanceFilterDrawerField[]
  initialValues?: PerformanceFilterDrawerValues
  title?: string
}>(), {
  initialValues: () => ({}),
  title: '筛选成员',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  apply: [values: PerformanceFilterDrawerValues]
}>()

const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const draft = ref<PerformanceFilterDrawerValues>({})
const personOptions = ref<Record<string, PerformanceSearchSelectOption[]>>({})
const personLoading = ref<Record<string, boolean>>({})
const searchSequence: Record<string, number> = {}

function cloneValues(values: PerformanceFilterDrawerValues) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, [...value]]))
}

watch(() => props.modelValue, open => {
  if (!open) return
  draft.value = cloneValues(props.initialValues || {})
  personOptions.value = {}
}, { immediate: true })

function setValue(key: string, value: string[]) {
  draft.value = { ...draft.value, [key]: value }
}

async function searchPeople(field: Extract<PerformanceFilterDrawerField, { type: 'person' }>, keyword: string) {
  const sequence = (searchSequence[field.key] || 0) + 1
  searchSequence[field.key] = sequence
  personLoading.value = { ...personLoading.value, [field.key]: true }
  try {
    const options = await field.loadOptions(keyword)
    if (searchSequence[field.key] !== sequence) return
    personOptions.value = { ...personOptions.value, [field.key]: options }
  } finally {
    if (searchSequence[field.key] === sequence) personLoading.value = { ...personLoading.value, [field.key]: false }
  }
}

function confirm() {
  emit('apply', cloneValues(draft.value))
  emit('update:modelValue', false)
}

function cancel() {
  emit('update:modelValue', false)
}

function clear() {
  const next: PerformanceFilterDrawerValues = {}
  for (const field of props.fields) next[field.key] = []
  draft.value = next
}
</script>

<style scoped>
.performance-filter-drawer__form { display: flex; flex: 1; flex-direction: column; gap: var(--performance-filter-drawer-field-gap); min-height: 0; padding: var(--spacing-5) var(--spacing-4); overflow-y: auto; box-sizing: border-box; }
.performance-filter-drawer__field { display: flex; flex-direction: column; min-width: 0; }
.performance-filter-drawer__label { display: block; padding-bottom: var(--performance-field-label-gap); color: var(--color-text-primary); font-size: var(--font-size-md); font-weight: var(--performance-filter-drawer-label-weight); line-height: var(--performance-input-line-height); }
.performance-filter-drawer__footer { display: flex; align-items: center; gap: var(--spacing-3); height: var(--performance-filter-drawer-footer-height); padding: var(--spacing-6); box-sizing: border-box; }
.performance-filter-drawer__footer :deep(.performance-button) { min-width: var(--performance-button-min-width); }
.performance-filter-drawer__footer :deep(.performance-button--link) { min-width: 0; }
:deep(.performance-drawer__panel) { box-shadow: var(--performance-filter-drawer-shadow); }
:deep(.performance-drawer__header) { flex-basis: var(--performance-filter-drawer-header-height); height: var(--performance-filter-drawer-header-height); border-bottom-color: var(--performance-filter-drawer-header-border); }
</style>
