<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Delete } from '@element-plus/icons-vue'

export interface FieldItem {
  field: string
  alias?: string
  sensitive?: boolean
}

const props = defineProps<{
  modelValue: FieldItem[]
  availableFields?: string[]
}>()

const emit = defineEmits<{ 'update:modelValue': [v: FieldItem[]] }>()

const fields = ref<FieldItem[]>([...props.modelValue])

function add() { fields.value.push({ field: '', alias: '' }) }
function remove(idx: number) { fields.value.splice(idx, 1); emitChange() }
function emitChange() { emit('update:modelValue', [...fields.value]) }

watch(() => props.modelValue, (v) => { fields.value = v ? [...v] : [] }, { deep: true })
</script>

<template>
  <div class="field-selector">
    <div v-for="(f, i) in fields" :key="i" class="field-row">
      <el-input
        v-model="f.field"
        placeholder="字段名"
        style="width: 160px"
        :list="availableFields?.length ? `field-datalist-${i}` : undefined"
        @change="emitChange()"
      />
      <el-input v-model="f.alias" placeholder="别名" style="width: 140px" @change="emitChange()" />
      <el-checkbox v-model="f.sensitive" style="margin-left: 8px" @change="emitChange()">脱敏</el-checkbox>
      <el-button :icon="Delete" circle size="small" type="danger" text @click="remove(i)" />
    </div>
    <el-button :icon="Plus" size="small" type="primary" text @click="add">添加字段</el-button>
    <div v-if="fields.length === 0" style="color: #909399; font-size: 13px; margin-top: 4px">
      至少添加一个返回字段
    </div>
  </div>
</template>

<style scoped>
.field-row { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
</style>
