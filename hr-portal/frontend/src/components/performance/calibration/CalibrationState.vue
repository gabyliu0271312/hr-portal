<script setup lang="ts">
import UiButton from '@/components/ui/UiButton.vue'
withDefaults(defineProps<{ loading?: boolean; error?: string }>(), { loading: false, error: '' })
const emit = defineEmits<{ retry: [] }>()
</script>
<template>
  <div class="calibration-state" :role="error ? 'alert' : 'status'">
    <template v-if="loading">正在加载校准任务…</template>
    <template v-else-if="error"><p>{{ error }}</p><UiButton @click="emit('retry')">重新加载</UiButton></template>
    <template v-else><img src="/performance-no-submit.svg" alt=""><span>暂无数据</span></template>
  </div>
</template>
<style scoped>
.calibration-state { display: flex; min-height: var(--ui-table-empty-height); align-items: center; justify-content: center; flex-direction: column; gap: var(--spacing-4); color: var(--color-text-secondary); }
.calibration-state img { width: var(--performance-calibration-empty-size); height: var(--performance-calibration-empty-size); }
p { margin: 0; }
</style>
