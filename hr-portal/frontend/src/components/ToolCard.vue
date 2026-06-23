<script setup lang="ts">
import { Right } from '@element-plus/icons-vue'
import type { ToolItem } from '@/constants/toolsCatalog'

defineProps<{ tool: ToolItem }>()
const emit = defineEmits<{ (e: 'open', path: string): void }>()
</script>

<template>
  <div class="tool-card" @click="emit('open', tool.path)">
    <div class="tool-icon">
      <el-icon><component :is="tool.icon" /></el-icon>
    </div>
    <div style="flex: 1">
      <div class="tool-title">{{ tool.title }}</div>
      <div class="tool-desc">{{ tool.desc }}</div>
    </div>
    <el-icon class="tool-arrow"><Right /></el-icon>
  </div>
</template>

<style scoped>
.tool-card {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 18px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-card);
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-standard), background var(--duration-fast) var(--ease-standard);
}
.tool-card:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-subtle);
}
.tool-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-size: 22px;
}
.tool-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}
.tool-desc {
  margin-top: 8px;
  color: var(--color-text-regular);
  font-size: 13px;
  line-height: 1.6;
}
.tool-arrow {
  margin-top: 4px;
  color: var(--color-text-placeholder);
}
</style>
