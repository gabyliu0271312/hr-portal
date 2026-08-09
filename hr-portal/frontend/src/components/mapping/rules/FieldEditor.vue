<template>
  <div class="rule-editor">
    <el-form label-position="top" size="small">
      <div class="field-grid">
        <el-form-item label="源字段">
          <el-select v-model="sourceField" placeholder="选择源字段" filterable clearable>
            <el-option v-for="field in sourceFields" :key="fieldCode(field)" :label="fieldLabel(field)" :value="fieldCode(field)" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标字段">
          <el-select v-model="targetField" placeholder="选择目标字段" filterable clearable>
            <el-option v-for="field in targetFields" :key="fieldCode(field)" :label="fieldLabel(field)" :value="fieldCode(field)" />
          </el-select>
        </el-form-item>
      </div>
      <el-form-item label="映射方式">
        <el-radio-group v-model="rule.config.mode" @update:model-value="changed">
          <el-radio-button value="rename">重命名</el-radio-button>
          <el-radio-button value="copy">复制</el-radio-button>
        </el-radio-group>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  rule: any
  sourceFields: any[]
  targetFields: any[]
  policy: any
}>()
const emit = defineEmits<{ change: [] }>()

if (!props.rule.sourceFields) props.rule.sourceFields = []
if (!props.rule.targetFields) props.rule.targetFields = []
if (!props.rule.config) props.rule.config = { mode: 'rename' }

const sourceField = computed({
  get: () => props.rule.sourceFields[0] || '',
  set: (value: string) => {
    props.rule.sourceFields = value ? [value] : []
    changed()
  },
})
const targetField = computed({
  get: () => props.rule.targetFields[0] || '',
  set: (value: string) => {
    props.rule.targetFields = value ? [value] : []
    changed()
  },
})

function fieldCode(field: any) { return typeof field === 'string' ? field : field.code }
function fieldLabel(field: any) { return typeof field === 'string' ? field : (field.label || field.code) }
function changed() { emit('change') }
</script>

<style scoped>
.field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.rule-editor :deep(.el-form-item) { margin-bottom: 12px; }
@media (max-width: 640px) { .field-grid { grid-template-columns: 1fr; } }
</style>
