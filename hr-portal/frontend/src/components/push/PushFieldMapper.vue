<!-- 字段映射配置组件：源字段（中文）→ 目标字段（英文） -->
<script setup lang="ts">
import { Plus, Delete } from '@element-plus/icons-vue'
import type { ColumnInfo } from '@/api/data'

defineProps<{
  mappings: { source: string; target: string }[]
  sourceColumns: ColumnInfo[]
}>()

const emit = defineEmits<{
  'update:mappings': [v: { source: string; target: string }[]]
}>()

function add(mappings: { source: string; target: string }[]) {
  emit('update:mappings', [...mappings, { source: '', target: '' }])
}

function remove(mappings: { source: string; target: string }[], i: number) {
  const next = [...mappings]
  next.splice(i, 1)
  emit('update:mappings', next)
}
</script>

<template>
  <div>
    <div style="font-size: 12px; color: var(--color-text-placeholder); margin-bottom: 8px">
      配置源字段（本系统中文名）→ 目标字段（对方字段名）的映射。不配置则原样推送。
    </div>
    <div v-for="(m, i) in mappings" :key="i" style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px">
      <el-select v-model="m.source" placeholder="源字段" style="flex: 1" filterable>
        <el-option v-for="c in sourceColumns" :key="c.code" :label="c.label" :value="c.code" />
      </el-select>
      <span style="color: var(--color-text-secondary)">→</span>
      <el-input v-model="m.target" placeholder="目标字段名（如 cost_period）" style="flex: 1" />
      <el-button link type="danger" @click="remove(mappings, i)">
        <el-icon><Delete /></el-icon>
      </el-button>
    </div>
    <el-button link type="primary" @click="add(mappings)">
      <el-icon style="margin-right: 4px"><Plus /></el-icon>添加映射
    </el-button>
  </div>
</template>
