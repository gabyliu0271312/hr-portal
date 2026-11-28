<template>
  <PerformancePopover
    :visible="visible"
    :anchor="anchor"
    width="var(--performance-filter-popover-width)"
    :max-width="'var(--performance-filter-popover-max-width)'"
    align="end"
    side="bottom"
    role="dialog"
    close-on-outside
    content-class="performance-filter-popover__content"
    :aria-label="props['aria-label']"
    @close="emit('close')"
  >
    <div class="performance-filter-popover__body"><slot /></div>
    <div class="performance-filter-popover__footer"><slot name="footer" /></div>
  </PerformancePopover>
</template>

<script setup lang="ts">
import PerformancePopover from './PerformancePopover.vue'

const props = withDefaults(defineProps<{ visible: boolean; anchor: HTMLElement | null; 'aria-label'?: string }>(), { 'aria-label': '筛选' })
const emit = defineEmits<{ close: [] }>()
</script>

<style scoped>
.performance-filter-popover__body {
  display: flex;
  flex-direction: column;
  gap: var(--performance-filter-field-gap);
  padding: var(--performance-filter-body-padding-block) var(--performance-filter-body-padding-inline);
}
</style>
