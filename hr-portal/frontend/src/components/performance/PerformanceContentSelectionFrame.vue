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
  tag?: 'div' | 'article'
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
  outline: 1px dashed transparent;
  outline-offset: -1px;
}
.performance-content-selection-frame--root:hover:not(:has(.performance-content-selection-frame--item:hover)),
.performance-content-selection-frame--item:hover {
  outline-color: #3370ff;
}
.performance-content-selection-frame.is-selected {
  outline: none;
  box-shadow: inset 0 0 0 2px #3370ff;
}
.performance-content-selection-frame--root.is-selected:has(.performance-content-selection-frame--item:hover) {
  box-shadow: none;
}
.performance-content-selection-frame--root.is-selected {
  border-bottom-color: transparent !important;
}
</style>
