<template>
  <div class="metric-template-actions" :class="`metric-template-actions--${placement}`">
    <PerformancePermissionButton
      allowed
      op="C"
      variant="primary"
      class="metric-template-action-button"
      aria-label="新建模板"
      @click="emit('create')"
    >
      <AddOutlinedIcon />
      <span>新建模板</span>
    </PerformancePermissionButton>
    <PerformancePermissionButton
      allowed
      op="C"
      variant="secondary"
      class="metric-template-action-button metric-template-action-button--import"
      aria-label="通过导入新建"
      @click="emit('import')"
    >
      <PerformanceImportIcon />
      <span>通过导入新建</span>
    </PerformancePermissionButton>
  </div>
</template>

<script setup lang="ts">
import AddOutlinedIcon from './AddOutlinedIcon.vue'
import PerformanceImportIcon from './PerformanceImportIcon.vue'
import PerformancePermissionButton from './PerformancePermissionButton.vue'

withDefaults(defineProps<{ placement?: 'toolbar' | 'empty' }>(), { placement: 'toolbar' })
const emit = defineEmits<{
  create: []
  import: []
}>()
</script>

<style scoped>
.metric-template-actions { display: inline-flex; align-items: center; gap: 12px; }
.metric-template-action-button { gap: 4px; }
.metric-template-action-button :deep(svg) { width: 14px; height: 14px; }
.metric-template-action-button--import { border-color: var(--color-primary); color: var(--color-primary); }
.metric-template-actions--empty { justify-content: center; margin-top: 16px; }
</style>
