<template>
  <component
    :is="tag"
    class="performance-content-selection-frame"
    :class="[`performance-content-selection-frame--${variant}`, { 'is-selected': selected }]"
  >
    <slot />
  </component>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  tag?: 'div' | 'article' | 'section'
  variant: 'root' | 'item'
  selected?: boolean
}>(), {
  tag: 'div',
  selected: false,
})
</script>

<style scoped>
.performance-content-selection-frame {
  position: relative;
}
.performance-content-selection-frame::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 22;
  border: 1px dashed transparent;
  border-radius: var(--performance-content-frame-radius);
  box-sizing: border-box;
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease, border-color 120ms ease, border-width 120ms ease;
}
.performance-content-selection-frame--root:hover:not(:has(.performance-content-selection-frame--item:hover))::before,
.performance-content-selection-frame--item:hover::before {
  opacity: 1;
  border-color: var(--performance-content-hover-border);
}
.performance-content-selection-frame.is-selected::before {
  opacity: 1;
  border-width: var(--performance-content-item-border-width);
  border-style: solid;
  border-color: var(--performance-content-hover-border);
}
.performance-content-selection-frame--root.is-selected:has(.performance-content-selection-frame--item:hover)::before {
  border-style: dashed;
  border-color: var(--performance-content-hover-border);
}
.performance-content-selection-frame--root.is-selected {
  border-bottom-color: transparent !important;
}
</style>
