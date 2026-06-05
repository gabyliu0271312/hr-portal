<script setup lang="ts">
import { Plus, Delete } from '@element-plus/icons-vue'
import type { SortCond } from '@/api/reports'
import type { ColumnInfo } from '@/api/data'

const props = defineProps<{
  sorts: SortCond[]
  allColumns: ColumnInfo[]
}>()

const emit = defineEmits<{
  'update:sorts': [v: SortCond[]]
}>()

function addSort() {
  emit('update:sorts', [...props.sorts, { column: '', order: 'asc' }])
}

function removeSort(i: number) {
  const next = [...props.sorts]
  next.splice(i, 1)
  emit('update:sorts', next)
}
</script>

<template>
  <div>
    <div v-for="(s, i) in sorts" :key="i" class="rule-row">
      <el-select v-model="s.column" placeholder="字段" style="width: 240px" filterable>
        <el-option v-for="c in allColumns" :key="c.code" :label="c.label" :value="c.code" />
      </el-select>
      <el-radio-group v-model="s.order">
        <el-radio-button value="asc">升序</el-radio-button>
        <el-radio-button value="desc">降序</el-radio-button>
      </el-radio-group>
      <el-button link type="danger" @click="removeSort(i)">
        <el-icon><Delete /></el-icon>
      </el-button>
    </div>
    <el-button link type="primary" @click="addSort">
      <el-icon style="margin-right: 4px"><Plus /></el-icon>添加排序
    </el-button>
  </div>
</template>

<style scoped>
.rule-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
</style>
