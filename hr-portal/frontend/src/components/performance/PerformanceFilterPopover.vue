<template>
  <PerformancePopover
    :visible="visible"
    :anchor="anchor"
    :width="width"
    :max-width="'var(--performance-filter-popover-max-width)'"
    align="end"
    side="bottom"
    role="dialog"
    close-on-outside
    content-class="performance-filter-popover__content"
    :aria-label="props['aria-label']"
    @close="emit('close')"
  >
    <div class="performance-filter-popover__body" :style="bodyStyle"><slot /></div>
    <div class="performance-filter-popover__footer"><slot name="footer" /></div>
  </PerformancePopover>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import PerformancePopover from './PerformancePopover.vue'

const props = withDefaults(defineProps<{ visible: boolean; anchor: HTMLElement | null; 'aria-label'?: string; width?: string; bodyPadding?: string }>(), {
  'aria-label': '筛选',
  width: 'var(--performance-filter-popover-width)',
  bodyPadding: undefined,
})
const emit = defineEmits<{ close: [] }>()
const bodyStyle = computed(() => props.bodyPadding ? { padding: props.bodyPadding } : undefined)
</script>

<style scoped>
.performance-filter-popover__body {
  display: flex;
  flex-direction: column;
  gap: var(--performance-filter-field-gap);
  padding: var(--performance-filter-body-padding-block) var(--performance-filter-body-padding-inline);
}
</style>
