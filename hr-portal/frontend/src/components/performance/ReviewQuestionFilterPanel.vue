<script setup lang="ts">
import { Search } from '@element-plus/icons-vue'
import PerformanceFilterButton from './PerformanceFilterButton.vue'

defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="rq-filter-panel">
    <el-input
      :model-value="modelValue"
      placeholder="搜索"
      clearable
      style="width: 240px"
      aria-label="搜索"
      @update:model-value="emit('update:modelValue', $event)"
    >
      <template #prefix><el-icon><Search /></el-icon></template>
    </el-input>
    <PerformanceFilterButton />
  </div>
</template>

<style scoped>
.rq-filter-panel {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
