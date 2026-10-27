<template>
  <PerformanceSortableList :items="regions" item-key="id" :gap="16" :disabled="disabled" class="content-region-list" @reorder="(from, to) => $emit('reorder', from, to)">
    <template #default="{ item: region, index, dragging, itemStyle }">
      <section class="result-view-section content-region" :class="{ 'reference-content-group': region.kind === 'reference', 'is-dragging': dragging }" :style="itemStyle" :data-sortable-index="index" :data-region-id="region.id" :aria-label="region.name">
        <PerformanceHorizontalDragHandle :label="`拖拽${region.name}区域`" :dragging="dragging" :disabled="disabled || regions.length < 2" />
        <slot v-if="region.kind === 'result'" name="result" />
        <slot v-else name="reference" :group="region" />
      </section>
    </template>
  </PerformanceSortableList>
</template>

<script setup lang="ts">
import PerformanceHorizontalDragHandle from './PerformanceHorizontalDragHandle.vue'
import PerformanceSortableList from './PerformanceSortableList.vue'
defineProps<{ regions: Array<{ id: string; kind: string; name: string }>; disabled?: boolean }>()
defineEmits<{ reorder: [from: number, to: number] }>()
</script>

<style scoped>
.content-region-list{display:flex;flex-direction:column;gap:var(--spacing-4)}
.content-region{position:relative;width:100%;max-width:100%;border-radius:var(--radius-sm);background:var(--color-bg-card)}
.content-region>.performance-horizontal-drag-handle{position:absolute;top:0;left:0;z-index:31}
.content-region.is-dragging{opacity:.8}
</style>
