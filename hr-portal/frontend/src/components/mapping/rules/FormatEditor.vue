<template>
  <div class="rule-editor">
    <div class="field-grid">
      <el-form-item label="源字段"><el-select v-model="sourceField" placeholder="选择源字段" filterable clearable><el-option v-for="field in sourceFields" :key="fieldCode(field)" :label="fieldLabel(field)" :value="fieldCode(field)" /></el-select></el-form-item>
      <el-form-item label="目标字段"><el-select v-model="targetField" placeholder="选择目标字段" filterable clearable><el-option v-for="field in targetFields" :key="fieldCode(field)" :label="fieldLabel(field)" :value="fieldCode(field)" /></el-select></el-form-item>
    </div>
    <el-form-item label="格式类型"><el-select v-model="config.formatType" filterable @change="changed"><el-option v-for="item in formatTypes" :key="item.value" v-bind="item" /></el-select></el-form-item>
    <div class="section-title">格式选项</div>
    <div class="option-grid">
      <el-checkbox v-model="config.options.trim" @change="changed">去除首尾空格（trim）</el-checkbox>
      <el-checkbox v-model="config.options.lower" @change="changed">转小写（lower）</el-checkbox>
      <el-checkbox v-model="config.options.upper" @change="changed">转大写（upper）</el-checkbox>
      <el-input v-model="config.options.date" placeholder="日期格式，如 YYYY-MM-DD" @input="changed"><template #prepend>日期</template></el-input>
      <el-input-number v-model="config.options.pad" :min="0" controls-position="right" @change="changed"><template #prefix>补齐长度</template></el-input-number>
      <el-input-number v-model="config.options.truncate" :min="0" controls-position="right" @change="changed"><template #prefix>截断长度</template></el-input-number>
      <el-input v-model="config.options.unit_convert" placeholder="单位转换规则" @input="changed"><template #prepend>单位转换</template></el-input>
    </div>
    <el-form-item label="格式化失败处理"><el-select v-model="config.onError" @change="changed"><el-option v-for="item in errorOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ rule: any; sourceFields: any[]; targetFields: any[]; policy: any }>()
const emit = defineEmits<{ change: [] }>()
const config = props.rule.config || (props.rule.config = { formatType: 'trim', options: {}, onError: 'reject' })
config.options = config.options || {}
const formatTypes = [{ value: 'trim', label: '去除首尾空格' }, { value: 'lower', label: '转小写' }, { value: 'upper', label: '转大写' }, { value: 'date', label: '日期格式化' }, { value: 'pad', label: '补齐' }, { value: 'truncate', label: '截断' }, { value: 'unit_convert', label: '单位转换' }]
const errorOptions = [{ value: 'keep', label: '保留原值' }, { value: 'set_null', label: '设置为空' }, { value: 'flag', label: '标记错误' }, { value: 'reject', label: '拒绝' }]
const sourceField = computed({ get: () => props.rule.sourceFields?.[0] || '', set: (v: string) => { props.rule.sourceFields = v ? [v] : []; changed() } })
const targetField = computed({ get: () => props.rule.targetFields?.[0] || '', set: (v: string) => { props.rule.targetFields = v ? [v] : []; changed() } })
function fieldCode(field: any) { return typeof field === 'string' ? field : field.code }
function fieldLabel(field: any) { return typeof field === 'string' ? field : (field.label || field.code) }
function changed() { emit('change') }
</script>

<style scoped>
.field-grid, .option-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }.section-title { margin: 4px 0 8px; font-size: 13px; font-weight: 600; }.option-grid { margin-bottom: 12px; }.rule-editor :deep(.el-form-item) { margin-bottom: 12px; }
@media (max-width: 640px) { .field-grid, .option-grid { grid-template-columns: 1fr; } }
</style>
