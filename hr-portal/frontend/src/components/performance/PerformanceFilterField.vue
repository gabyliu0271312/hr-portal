<template>
  <PerformanceFormItem compact :label="field.label">
    <PerformanceSearchSelect
      v-if="selectField"
      :model-value="selectValue"
      :options="selectField.options"
      :multiple="selectField.multiple"
      :placeholder="selectField.placeholder || '请选择'"
      :selection-style="selectField.selectionStyle || 'tags'"
      :auto-height="selectField.autoHeight"
      :aria-label="field.label"
      @update:model-value="updateValue"
    />
    <PerformancePersonSelect
      v-else
      :model-value="selectValue"
      :options="personOptions"
      :multiple="personMultiple"
      :placeholder="personPlaceholder"
      :loading="personLoading"
      :loading-text="personLoadingText"
      :empty-text="personEmptyText"
      :remote-search="hasRemoteLoader"
      :tag-shape="personMultiple ? 'round' : 'default'"
      :auto-height="field.autoHeight"
      :highlight-query="true"
      :aria-label="field.label"
      @update:model-value="updateValue"
      @search="onSearch"
    />
  </PerformanceFormItem>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformancePersonSelect from './PerformancePersonSelect.vue'
import PerformanceSearchSelect, { type PerformanceSearchSelectOption } from './PerformanceSearchSelect.vue'
import type { PerformanceFilterField } from './performanceFilterTypes'

const props = defineProps<{ field: PerformanceFilterField; modelValue: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const SEARCH_DEBOUNCE_MS = 250
const loadedOptions = ref<PerformanceSearchSelectOption[]>([])
const personLoading = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | undefined
let searchSequence = 0

const selectField = computed(() => props.field.type === 'select' ? props.field : null)
const personField = computed(() => props.field.type === 'person' ? props.field : null)
const selectValue = computed(() => props.field.multiple ? props.modelValue : (props.modelValue[0] ?? null))
const personOptions = computed(() => personField.value?.options ?? loadedOptions.value)
const personMultiple = computed(() => personField.value?.multiple ?? false)
const personPlaceholder = computed(() => personField.value?.placeholder || '请搜索')
const personEmptyText = computed(() => personField.value?.emptyText || '暂无可选人员')
const personLoadingText = computed(() => personField.value?.loadingText || '搜索中')
const hasRemoteLoader = computed(() => Boolean(personField.value?.loadOptions))

function updateValue(value: string | string[] | null) {
  emit('update:modelValue', Array.isArray(value) ? value : value ? [value] : [])
}

function onSearch(keyword: string) {
  const loader = personField.value?.loadOptions
  if (!loader) return
  if (searchTimer) clearTimeout(searchTimer)
  const query = keyword.trim()
  const current = ++searchSequence
  if (!query) {
    loadedOptions.value = []
    personLoading.value = false
    return
  }
  searchTimer = setTimeout(() => void loadOptions(query, loader, current), SEARCH_DEBOUNCE_MS)
}

async function loadOptions(query: string, loader: (keyword: string) => Promise<PerformanceSearchSelectOption[]>, current: number) {
  personLoading.value = true
  try {
    const options = await loader(query)
    if (current === searchSequence) loadedOptions.value = options
  } catch {
    if (current === searchSequence) loadedOptions.value = []
  } finally {
    if (current === searchSequence) personLoading.value = false
  }
}

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
  searchSequence += 1
})
</script>
