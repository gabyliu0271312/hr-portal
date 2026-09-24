<template>
  <Teleport to="body">
    <div v-if="modelValue" class="performance-task-overlay">
      <section class="performance-task-overlay__panel" role="dialog" aria-modal="true" :aria-label="title">
        <PerformanceTaskHeader :title="title" @back="close" />
        <div class="performance-task-overlay__body"><slot /></div>
        <slot name="footer" />
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import PerformanceTaskHeader from './PerformanceTaskHeader.vue'

const props = defineProps<{ modelValue: boolean; title: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; close: [] }>()

function close() {
  emit('close')
  emit('update:modelValue', false)
}
</script>

<style scoped>
.performance-task-overlay{position:fixed;inset:0;z-index:var(--performance-drawer-z-index);overflow:hidden;background:#f5f6f7}.performance-task-overlay__panel{position:relative;display:flex;width:100%;height:100%;min-width:0;min-height:0;flex-direction:column;padding-top:var(--layout-topbar-height);box-sizing:border-box;background:#f5f6f7;color:#1f2329}.performance-task-overlay__body{display:flex;min-width:0;min-height:0;flex:1;flex-direction:column;overflow:auto;padding:20px 24px 60px;box-sizing:border-box}
</style>
