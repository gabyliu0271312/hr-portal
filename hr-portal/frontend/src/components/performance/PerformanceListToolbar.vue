<script setup lang="ts">
import PerformanceFilterButton from './PerformanceFilterButton.vue'
import PerformanceSearchInput from './PerformanceSearchInput.vue'

withDefaults(defineProps<{
  keyword: string
  searchPlaceholder?: string
  searchAriaLabel?: string
  searchWidth?: string
  showFilter?: boolean
  filterLabel?: string
  searchFill?: boolean
}>(), {
  searchPlaceholder: '通过名称、备注搜索',
  searchAriaLabel: '搜索',
  searchWidth: '224px',
  showFilter: true,
  filterLabel: '筛选',
  searchFill: false,
})

const emit = defineEmits<{
  'update:keyword': [value: string]
  filter: []
  search: []
  clear: []
}>()
</script>

<template>
  <div class="list-toolbar">
    <slot name="left" />
    <div v-if="!searchFill" class="toolbar-spacer"></div>
    <PerformanceSearchInput
      :model-value="keyword"
      class="search-input"
      :width="searchWidth"
      :placeholder="searchPlaceholder"
      :aria-label="searchAriaLabel"
      @update:model-value="emit('update:keyword', $event)"
      @search="emit('search')"
      @clear="emit('clear')"
    />
    <PerformanceFilterButton v-if="showFilter" class="filter-button" :label="filterLabel" @click="emit('filter')" />
    <slot name="actions" />
  </div>
</template>

<style scoped>
.list-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.toolbar-spacer {
  flex: 1;
}
.search-input {
  width: 224px;
}
.search-icon {
  width: 16px;
  height: 16px;
}
</style>
