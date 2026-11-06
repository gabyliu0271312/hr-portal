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
/* item hover：自身虚线框显示；root 悬停（且非 item hover）时显示 root 虚线框 */
.performance-content-selection-frame--item:hover::before {
  opacity: 1;
  border-color: var(--performance-content-hover-border);
}
/* root 选中态独立：选中后内部 item hover 不再切换（REA：选中与 hover 互不干扰） */
.performance-content-selection-frame--root.is-selected :deep(.performance-content-selection-frame--item:hover::before) {
  opacity: 0;
}
.performance-content-selection-frame--root:hover:not(:has(.performance-content-selection-frame--item:hover))::before {
  opacity: 1;
  border-color: var(--performance-content-hover-border);
}
/* 选中态独立：root 选中为 2px solid，保持不动；即使内部 item hover 也不再切换（REA：选中与 hover 互不干扰） */
.performance-content-selection-frame.is-selected::before {
  opacity: 1;
  border-width: var(--performance-content-item-border-width);
  border-style: solid;
  border-color: var(--performance-content-hover-border);
}
.performance-content-selection-frame--root.is-selected {
  border-bottom-color: transparent !important;
}
</style>
