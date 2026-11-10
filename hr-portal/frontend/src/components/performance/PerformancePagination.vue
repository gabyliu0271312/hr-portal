<template>
  <UiPagination class="performance-pagination" :page="page" :page-size="pageSize" :total="total" :aria-label="ariaLabel" :show-size="false" :show-jump="false" @page-change="emit('page-change', $event)" />
</template>

<script setup lang="ts">
import UiPagination from '../ui/UiPagination.vue'

withDefaults(defineProps<{ page: number; pageSize: number; total: number; ariaLabel?: string }>(), { ariaLabel: '分页' })
const emit = defineEmits<{ 'page-change': [page: number] }>()
</script>
