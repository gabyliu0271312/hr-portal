<template>
  <PerformancePersonSelect
    :model-value="values"
    :options="mergedOptions"
    multiple
    remote-search
    option-style="none"
    tag-shape="round"
    :loading="loading"
    :placeholder="placeholder"
    :aria-label="props['aria-label']"
    @search="onSearch"
    @update:model-value="onChange"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { projectManagementApi } from '@/api/performance'
import PerformancePersonSelect from './PerformancePersonSelect.vue'

export interface PerformancePersonFilterOption {
  value: string
  label: string
  subLabel?: string
  searchText?: string
  avatarFallback?: string
}

const props = withDefaults(defineProps<{
  modelValue: PerformancePersonFilterOption[]
  cycleId: number
  placeholder?: string
  'aria-label': string
}>(), { placeholder: '搜索成员' })
const emit = defineEmits<{ 'update:modelValue': [value: PerformancePersonFilterOption[]] }>()

const loading = ref(false)
const known = ref(new Map<string, PerformancePersonFilterOption>())
const cache = new Map<string, PerformancePersonFilterOption[]>()
const SEARCH_DEBOUNCE_MS = 250
let searchTimer: ReturnType<typeof setTimeout> | undefined
let sequence = 0

watch(() => props.modelValue, items => {
  for (const item of items) known.value.set(item.value, item)
}, { immediate: true, deep: true })

const values = computed(() => props.modelValue.map(item => item.value))
const mergedOptions = computed(() => [...known.value.values()])

function remember(options: PerformancePersonFilterOption[]) {
  for (const option of options) known.value.set(option.value, option)
}

function onChange(value: string | string[] | null) {
  const selected = Array.isArray(value) ? value : value ? [value] : []
  emit('update:modelValue', selected.map(item => known.value.get(item) || props.modelValue.find(option => option.value === item) || { value: item, label: item }))
}

function onSearch(keyword: string) {
  if (searchTimer) clearTimeout(searchTimer)
  const query = keyword.trim()
  if (!query) return
  searchTimer = setTimeout(() => void load(query), SEARCH_DEBOUNCE_MS)
}

async function load(query: string) {
  const cached = cache.get(query)
  if (cached) { remember(cached); return }
  const current = ++sequence
  loading.value = true
  try {
    const result = await projectManagementApi.authorizationRecordEmployeeOptions(props.cycleId, query)
    if (current !== sequence) return
    const options = result.items.map(item => ({
      value: item.value,
      label: item.label,
      subLabel: item.sub_label || undefined,
      searchText: `${item.label} ${item.value} ${item.sub_label || ''}`,
      avatarFallback: item.label.slice(-1),
    }))
    if (cache.size > 50) cache.clear()
    cache.set(query, options)
    remember(options)
  } catch {
    if (current !== sequence) return
  } finally {
    if (current === sequence) loading.value = false
  }
}

onBeforeUnmount(() => { if (searchTimer) clearTimeout(searchTimer); ++sequence })
</script>
