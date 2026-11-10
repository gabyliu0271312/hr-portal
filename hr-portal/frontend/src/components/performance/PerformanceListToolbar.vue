<script setup lang="ts">
import PerformanceFilterButton from './PerformanceFilterButton.vue'
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
  searchFill: false,
  gap: 'var(--page-gap-toolbar-items)',
})

const emit = defineEmits<{
  'update:keyword': [value: string]
  filter: []
  search: []
  clear: []
}>()
</script>

<template>
  <div class="list-toolbar" :class="{ 'is-search-fill': searchFill }" :style="{ gap: typeof gap === 'number' ? `${gap}px` : gap }">
    <div v-if="$slots.left" class="toolbar-group toolbar-left"><slot name="left" /></div>
    <div v-if="!searchFill" class="toolbar-spacer"></div>
    <PerformanceSearchInput
      :model-value="keyword"
      class="search-input"
      :class="{ 'search-input--fill': searchFill }"
      :width="searchFill ? 'auto' : searchWidth"
      :placeholder="searchPlaceholder"
      :aria-label="searchAriaLabel"
      :variant="searchVariant"
      @update:model-value="emit('update:keyword', $event)"
      @search="emit('search')"
      @clear="emit('clear')"
    />
    <PerformanceFilterButton v-if="showFilter" class="filter-button" :label="filterLabel" :variant="filterVariant" :disabled="filterDisabled" @click="emit('filter')" />
    <div v-if="$slots.actions" class="toolbar-group toolbar-actions"><slot name="actions" /></div>
  </div>
</template>

<style scoped>
.list-toolbar {
  display: flex;
  align-items: center;
  min-width: 0;
  margin-bottom: var(--page-gap-toolbar-table);
}
.toolbar-group {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: inherit;
}
.toolbar-group > :deep(*) {
  flex-shrink: 0;
}
.toolbar-spacer {
  flex: 1 1 0;
  min-width: 0;
}
.search-input {
  flex: 0 0 auto;
  min-width: 0;
}
.search-input--fill {
  flex: 1 1 0;
}
.filter-button {
  flex-shrink: 0;
}
</style>
