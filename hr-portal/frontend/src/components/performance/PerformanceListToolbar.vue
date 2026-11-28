<script setup lang="ts">
import { ref } from 'vue'
import PerformanceFilterButton from './PerformanceFilterButton.vue'
import UiListToolbar from '@/components/ui/UiListToolbar.vue'
import PerformanceSearchInput from './PerformanceSearchInput.vue'

withDefaults(defineProps<{
  keyword: string
  searchPlaceholder?: string
  searchAriaLabel?: string
  searchWidth?: string
  searchVariant?: 'default' | 'compact'
  showFilter?: boolean
  filterVariant?: 'default' | 'icon-only'
  filterLabel?: string
  filterDisabled?: boolean
  filterActive?: boolean
  filterCount?: number
  searchFill?: boolean
  gap?: number | string
}>(), {
  searchPlaceholder: '通过名称、备注搜索',
  searchAriaLabel: '搜索',
  searchWidth: 'var(--search-input-width)',
  searchVariant: 'default',
  showFilter: true,
  filterVariant: 'default',
  filterLabel: '筛选',
  filterDisabled: false,
  filterActive: false,
  filterCount: 0,
  searchFill: false,
  gap: 'var(--page-gap-toolbar-items)',
})

const emit = defineEmits<{
  'update:keyword': [value: string]
  filter: [anchor?: HTMLElement]
  search: []
  clear: []
}>()

const filterButton = ref<InstanceType<typeof PerformanceFilterButton> | null>(null)

function onFilterClick() {
  const target = filterButton.value?.$el
  emit('filter', target instanceof HTMLElement ? target : undefined)
}
</script>

<template>
  <UiListToolbar
    :keyword="keyword"
    :search-placeholder="searchPlaceholder"
    :search-aria-label="searchAriaLabel"
    :search-width="searchWidth"
    :search-variant="searchVariant"
    :search-fill="searchFill"
    :gap="gap"
    @update:keyword="emit('update:keyword', $event)"
    @search="emit('search')"
    @clear="emit('clear')"
  >
    <template v-if="$slots.left" #left><slot name="left" /></template>
    <template #search>
      <slot v-if="$slots.search" name="search" />
      <PerformanceSearchInput v-else :model-value="keyword" class="search-input" :class="{ 'search-input--fill': searchFill }" :width="searchFill ? 'auto' : searchWidth" :placeholder="searchPlaceholder" :aria-label="searchAriaLabel" :variant="searchVariant" @update:model-value="emit('update:keyword', $event)" @search="emit('search')" @clear="emit('clear')" />
    </template>
    <template #filters>
      <PerformanceFilterButton v-if="showFilter" ref="filterButton" class="filter-button" :label="filterLabel" :variant="filterVariant" :disabled="filterDisabled" :active="filterActive" :count="filterCount" @click="onFilterClick" />
    </template>
    <template v-if="$slots.actions" #actions><slot name="actions" /></template>
  </UiListToolbar>
</template>
