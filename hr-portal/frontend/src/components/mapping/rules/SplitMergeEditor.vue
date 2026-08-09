<template>
  <div class="rule-editor">
    <el-form-item label="操作"><el-radio-group v-model="config.action" @change="changed"><el-radio-button value="split">拆分</el-radio-button><el-radio-button value="merge">合并</el-radio-button></el-radio-group></el-form-item>
    <div class="field-grid">
      <el-form-item label="源字段"><el-select v-model="sourceFieldSelection" multiple filterable allow-create collapse-tags placeholder="选择或输入源字段" @change="changed"><el-option v-for="field in sourceFields" :key="fieldCode(field)" :label="fieldLabel(field)" :value="fieldCode(field)" /></el-select></el-form-item>
      <el-form-item label="目标字段"><el-select v-model="targetFieldSelection" multiple filterable allow-create collapse-tags placeholder="选择或输入目标字段" @change="changed"><el-option v-for="field in targetFields" :key="fieldCode(field)" :label="fieldLabel(field)" :value="fieldCode(field)" /></el-select></el-form-item>
    </div>
    <el-form-item label="分隔符"><el-input v-model="config.delimiter" placeholder="例如：, 或 |" @input="changed" /></el-form-item>
    <el-form-item label="空值处理"><el-select v-model="config.nullBehavior" @change="changed"><el-option label="保留空值" value="keep_null" /><el-option label="跳过空值" value="skip_null" /><el-option label="视为空字符串" value="empty_string" /></el-select></el-form-item>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ rule: any; sourceFields: any[]; targetFields: any[]; policy: any }>()
const emit = defineEmits<{ change: [] }>()
const config = props.rule.config || (props.rule.config = { action: 'merge', delimiter: '', nullBehavior: 'keep_null' })
const sourceFieldSelection = computed({ get: () => props.rule.sourceFields || [], set: (v: string[]) => { props.rule.sourceFields = v; changed() } })
const targetFieldSelection = computed({ get: () => props.rule.targetFields || [], set: (v: string[]) => { props.rule.targetFields = v; changed() } })
function fieldCode(field: any) { return typeof field === 'string' ? field : field.code }
function fieldLabel(field: any) { return typeof field === 'string' ? field : (field.label || field.code) }
function changed() { emit('change') }
</script>

<style scoped>
.field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }.rule-editor :deep(.el-form-item) { margin-bottom: 12px; }
@media (max-width: 640px) { .field-grid { grid-template-columns: 1fr; } }
</style>
