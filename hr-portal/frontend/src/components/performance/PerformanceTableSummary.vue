<template>
  <div class="performance-table-summary">
    <span>{{ total }}个结果</span>
    <button class="performance-table-summary__columns" type="button" @click="emit('columns')">
      <PerformanceColumnVisibilityIcon />
      <span>{{ hiddenColumnCount }} 列被隐藏</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import PerformanceColumnVisibilityIcon from './PerformanceColumnVisibilityIcon.vue'

defineProps<{ total: number; hiddenColumnCount: number }>()
const emit = defineEmits<{ columns: [] }>()
</script>

<style scoped>
.performance-table-summary{display:flex;align-items:center;justify-content:space-between;height:22px;margin:0 0 12px;color:#1f2329;font-size:14px;line-height:22px}.performance-table-summary__columns{display:inline-flex;align-items:center;height:22px;padding:2px 4px;border:0;border-radius:6px;background:transparent;color:#1456f0;cursor:pointer;font:inherit}.performance-table-summary__columns:hover,.performance-table-summary__columns:focus-visible{outline:0;background:#eff0f1}.performance-table-summary__columns svg{width:16px;height:16px;margin-right:4px}
</style>
