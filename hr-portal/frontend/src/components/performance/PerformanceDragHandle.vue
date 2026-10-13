<template>
  <div
    class="performance-drag-handle"
    :class="[`is-${variant}`, { 'is-dragging': dragging, 'is-disabled': disabled }]"
    role="button"
    :tabindex="disabled ? -1 : 0"
    :aria-label="label"
    :aria-disabled="disabled || undefined"
    :data-drag-state="dragging ? 'grabbing' : 'grab'"
    data-drag-handle
    @pointerdown="$emit('pointerdown', $event)"
  >
    <span class="universe-icon align-top text-16 text-N-600">
      <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" data-icon="DragOutlined" aria-hidden="true">
        <path d="M10 4.75a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 1 1 3.5 0ZM18.25 4.75a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 1 1 3.5 0ZM10 12a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 1 1 3.5 0ZM18.25 12a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 1 1 3.5 0ZM10 19.25a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 1 1 3.5 0ZM18.25 19.25a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 1 1 3.5 0Z" fill="currentColor" />
      </svg>
    </span>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  dragging?: boolean
  disabled?: boolean
  variant?: 'compact' | 'strip'
}>(), {
  dragging: false,
  disabled: false,
  variant: 'compact',
})

defineEmits<{ pointerdown: [event: PointerEvent] }>()
</script>

<style scoped>
.performance-drag-handle { display: inline-flex; align-self: stretch; align-items: center; justify-content: center; width: auto; max-width: 100%; height: 32px; color: #1f2329; margin-right: 4px; cursor: grab; touch-action: none; user-select: none; }
.performance-drag-handle.is-compact { flex: 0 0 16px; width: 16px; }
.performance-drag-handle.is-strip { width: 100%; height: 24px; }
.universe-icon { display: block; box-sizing: border-box; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif; font-size: 16px; font-weight: 400; line-height: 16px; text-align: center; color: #646a73; cursor: grab; }
.universe-icon svg { display: inline-block; overflow: hidden; width: 16px; height: 16px; min-width: 0; min-height: 0; box-sizing: border-box; }
.performance-drag-handle:focus-visible { outline: 2px solid #3370ff; outline-offset: 1px; }
.performance-drag-handle:active, .performance-drag-handle[data-drag-state='grabbing'] { cursor: grabbing; }
.performance-drag-handle.is-disabled { color: #8f959e; cursor: default; opacity: .5; }
</style>
