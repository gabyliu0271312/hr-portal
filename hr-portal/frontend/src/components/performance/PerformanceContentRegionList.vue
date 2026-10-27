<template>
  <PerformanceSortableList :items="regions" item-key="id" :gap="16" :disabled="disabled" class="content-region-list" @reorder="(from, to) => $emit('reorder', from, to)">
    <template #default="{ item: region, index, dragging, itemStyle }">
      <PerformanceContentSelectionFrame
        tag="section"
        variant="root"
        class="result-view-section content-region"
        :class="{ 'reference-content-group': region.kind === 'reference', 'is-dragging': dragging }"
        :selected="selectedRegionId === region.id"
        :style="itemStyle"
        :data-sortable-index="index"
        :data-region-id="region.id"
        :aria-label="region.name"
        @mouseenter="hoveredRegionId = region.id"
        @mouseleave="leaveRegion(region.id)"
        role="button"
        tabindex="0"
        :aria-pressed="selectedRegionId === region.id"
        @keydown.enter.self.prevent="emit('activate', region.id)"
        @keydown.space.self.prevent="emit('activate', region.id)"
        @click="activateRegion(region.id, $event)"
      >
        <PerformanceHorizontalDragHandle :label="`拖拽${region.name}区域`" :dragging="dragging" :disabled="disabled || regions.length < 2" :visible="hoveredRegionId === region.id || selectedRegionId === region.id || dragging" @click.stop />
        <slot v-if="region.kind === 'result'" name="result" />
        <slot v-else name="reference" :group="region" />
      </PerformanceContentSelectionFrame>
    </template>
  </PerformanceSortableList>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import PerformanceHorizontalDragHandle from './PerformanceHorizontalDragHandle.vue'
import PerformanceContentSelectionFrame from './PerformanceContentSelectionFrame.vue'
import PerformanceSortableList from './PerformanceSortableList.vue'
defineProps<{ regions: Array<{ id: string; kind: string; name: string }>; disabled?: boolean; selectedRegionId?: string | null }>()
const emit = defineEmits<{ reorder: [from: number, to: number]; activate: [regionId: string] }>()
const hoveredRegionId = ref<string | null>(null)
function leaveRegion(regionId: string) { if (hoveredRegionId.value === regionId) hoveredRegionId.value = null }
function activateRegion(regionId: string, event: MouseEvent) {
  if ((event.target as Element).closest('button, input, textarea, select, a, [data-drag-handle], [role="toolbar"]')) return
  emit('activate', regionId)
}
</script>

<style scoped>
.content-region-list{display:flex;flex-direction:column;gap:var(--spacing-4)}
.content-region{position:relative;width:100%;max-width:100%;border-radius:var(--radius-sm);background:var(--color-bg-card)}
.content-region>.performance-horizontal-drag-handle{position:absolute;top:0;left:0;z-index:31}
.content-region:not(.is-selected):not(.is-dragging):has(.configured-content-card:hover)>.performance-horizontal-drag-handle:not(:focus-visible){opacity:0;pointer-events:none}
.content-region:not(.is-selected):has(.configured-content-card:hover){outline-color:transparent}
.content-region::after{content:"";position:absolute;inset:0;z-index:30;border-radius:inherit;pointer-events:none}
.content-region.is-selected:not(:has(.performance-content-selection-frame--item:hover))::after{box-shadow:var(--performance-content-selected-shadow)}
.content-region:not(.is-selected):hover:not(:has(.configured-content-card:hover))::after{outline:var(--performance-content-hover-outline);outline-offset:var(--performance-content-hover-outline-offset)}
.content-region.is-dragging{opacity:.8}
</style>
