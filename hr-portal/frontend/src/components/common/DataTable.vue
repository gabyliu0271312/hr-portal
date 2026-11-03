<template>
  <div class="data-table">
    <div v-if="$slots.toolbar" class="data-table__toolbar">
      <slot name="toolbar" />
    </div>
    <div class="data-table__body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineSlots<{
  toolbar?: () => any
  default: () => any
}>()
</script>

<style scoped>
.data-table { display: flex; flex-direction: column; flex: 1 1; min-width: 0; min-height: 0; }
.data-table__toolbar { display: flex; align-items: center; gap: var(--page-gap-title-desc); margin-bottom: var(--page-gap-toolbar-table); }
.data-table__body { display: flex; flex: 1 1; min-width: 0; min-height: 0; }
</style>
