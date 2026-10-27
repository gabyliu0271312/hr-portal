<template>
  <div class="performance-horizontal-drag-handle" :class="{ 'is-dragging': dragging, 'is-disabled': disabled }" role="button" :tabindex="disabled ? -1 : 0" :aria-label="label" :aria-disabled="disabled || undefined" :data-drag-state="dragging ? 'grabbing' : 'grab'" data-drag-handle @pointerdown="$emit('pointerdown', $event)" @click.stop>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" data-icon="DragOutlined" aria-hidden="true"><circle v-for="point in points" :key="point.join('-')" :cx="point[0]" :cy="point[1]" r="1.75" /></svg>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ label: string; dragging?: boolean; disabled?: boolean }>(), { dragging: false, disabled: false })
defineEmits<{ pointerdown: [event: PointerEvent] }>()
const points = [[4.75, 8.25], [12, 8.25], [19.25, 8.25], [4.75, 15.75], [12, 15.75], [19.25, 15.75]]
</script>

<style scoped>
.performance-horizontal-drag-handle{display:flex;align-items:center;justify-content:center;width:100%;height:24px;box-sizing:border-box;color:var(--color-text-secondary);cursor:grab;touch-action:none;user-select:none}
.performance-horizontal-drag-handle:focus-visible{outline:var(--performance-content-hover-outline);outline-offset:-1px}
.performance-horizontal-drag-handle.is-dragging,.performance-horizontal-drag-handle:active{cursor:grabbing}
.performance-horizontal-drag-handle.is-disabled{cursor:default;opacity:.5}
</style>
