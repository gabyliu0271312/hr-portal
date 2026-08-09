<template>
  <div class="rule-editor">
    <div class="field-grid">
      <el-form-item label="源字段">
        <el-select v-model="sourceField" placeholder="选择源字段" filterable clearable><el-option v-for="field in sourceFields" :key="fieldCode(field)" :label="fieldLabel(field)" :value="fieldCode(field)" /></el-select>
      </el-form-item>
      <el-form-item label="目标字段">
        <el-select v-model="targetField" placeholder="选择目标字段" filterable clearable><el-option v-for="field in targetFields" :key="fieldCode(field)" :label="fieldLabel(field)" :value="fieldCode(field)" /></el-select>
      </el-form-item>
    </div>
    <el-form-item label="参考数据集">
      <el-select v-model="config.referenceDatasetId" placeholder="选择受控参考数据集" filterable clearable @change="changedReferenceDataset">
        <el-option v-for="dataset in referenceDatasets" :key="dataset.id" :label="dataset.name || dataset.id" :value="dataset.id" />
      </el-select>
    </el-form-item>
    <div class="section-title">输出字段映射</div>
    <div v-for="(value, key) in config.outputMap" :key="key" class="mapping-row">
      <el-input v-model="outputKeys[key]" placeholder="输出字段" @change="renameOutput(key, outputKeys[key])" /><span>←</span>
        <el-select v-model="config.outputMap[key]" placeholder="参考字段" filterable clearable @change="changed">
          <el-option v-for="field in allowedReferenceFields" :key="field" :label="field" :value="field" />
        </el-select><el-button link type="danger" @click="removeOutput(key)">删除</el-button>
    </div>
    <el-button link type="primary" @click="addOutput">+ 添加输出映射</el-button>
    <div class="section-title rule-title">匹配规则</div>
    <div v-for="(matchRule, index) in config.matchRules" :key="matchRule.id || index" class="match-card">
      <div class="field-grid">
        <el-input-number v-model="matchRule.priority" :min="0" controls-position="right" placeholder="优先级" @change="changed" />
        <el-select v-model="matchRule.sourceField" placeholder="源字段" filterable @change="changed"><el-option v-for="field in sourceFields" :key="fieldCode(field)" :label="fieldLabel(field)" :value="fieldCode(field)" /></el-select>
        <el-select v-model="matchRule.referenceField" placeholder="参考字段" filterable clearable @change="changed">
          <el-option v-for="field in allowedReferenceFields" :key="field" :label="field" :value="field" />
        </el-select>
        <el-select v-model="matchRule.onMatch" placeholder="命中后处理" @change="changed"><el-option label="使用并停止" value="use_and_stop" /><el-option label="继续匹配" value="continue" /><el-option label="仅填充空值" value="only_fill_empty" /></el-select>
      </div>
      <el-input v-model="matchRule.conditionsText" type="textarea" :rows="2" placeholder="条件 JSON，例如 {&quot;op&quot;:&quot;eq&quot;}" @change="updateConditions(matchRule)" />
      <el-button link type="danger" @click="removeRule(index)">删除匹配规则</el-button>
    </div>
    <el-button link type="primary" @click="addRule">+ 添加匹配规则</el-button>
    <el-form-item label="未匹配处理">
      <el-select v-model="config.unmatched" @change="changed"><el-option v-for="item in unmatchedOptions" :key="item.value" v-bind="item" /></el-select>
    </el-form-item>
    <el-form-item v-if="config.unmatched === 'set_default'" label="默认值"><el-input v-model="config.defaultValue" placeholder="未匹配时使用的值" @input="changed" /></el-form-item>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'

const props = defineProps<{ rule: any; sourceFields: any[]; targetFields: any[]; policy: any }>()
const referenceDatasets = computed(() => {
  const allowed = new Set(props.policy?.referenceLookup?.allowedDatasetIds || [])
  return Array.from(allowed).map((id) => ({ id, name: id }))
})
const allowedReferenceFields = computed(() => props.policy?.referenceLookup?.allowedFieldIds || [])
function isAllowedReferenceField(value: unknown) {
  return typeof value === 'string' && allowedReferenceFields.value.includes(value)
}
function changedReferenceDataset() {
  if (config.referenceDatasetId && !referenceDatasets.value.some((item) => item.id === config.referenceDatasetId)) {
    config.referenceDatasetId = ''
    config.outputMap = {}
    config.matchRules = []
  }
  changed()
}
const emit = defineEmits<{ change: [] }>()
const config = props.rule.config || (props.rule.config = { referenceDatasetId: '', outputMap: {}, matchRules: [], unmatched: 'keep' })
config.outputMap = config.outputMap || {}; config.matchRules = config.matchRules || []
const outputKeys = reactive<Record<string, string>>({ ...Object.fromEntries(Object.keys(config.outputMap).map((key) => [key, key])) })
const unmatchedOptions = [{ value: 'keep', label: '保留原值' }, { value: 'set_default', label: '设置默认值' }, { value: 'set_null', label: '设置为空' }, { value: 'flag', label: '标记未匹配' }, { value: 'reject', label: '拒绝' }]
const sourceField = computed({ get: () => props.rule.sourceFields?.[0] || '', set: (v: string) => { props.rule.sourceFields = v ? [v] : []; changed() } })
const targetField = computed({ get: () => props.rule.targetFields?.[0] || '', set: (v: string) => { props.rule.targetFields = v ? [v] : []; changed() } })
function fieldCode(field: any) { return typeof field === 'string' ? field : field.code }
function fieldLabel(field: any) { return typeof field === 'string' ? field : (field.label || field.code) }
function addOutput() { let key = ''; let i = 1; while (Object.prototype.hasOwnProperty.call(config.outputMap, key)) key = `输出字段${i++}`; config.outputMap[key] = ''; outputKeys[key] = key; changed() }
function removeOutput(key: string | number) { const oldKey = String(key); delete config.outputMap[oldKey]; delete outputKeys[oldKey]; changed() }
function renameOutput(oldKeyValue: string | number, newKeyValue: string | number) { const oldKey = String(oldKeyValue); const key = String(newKeyValue || '').trim(); if (!key || key === oldKey || Object.prototype.hasOwnProperty.call(config.outputMap, key)) { outputKeys[oldKey] = oldKey; return } config.outputMap[key] = config.outputMap[oldKey]; delete config.outputMap[oldKey]; outputKeys[key] = key; delete outputKeys[oldKey]; changed() }
function addRule() { config.matchRules.push({ id: `match_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, priority: config.matchRules.length, sourceField: '', referenceField: '', conditions: {}, conditionsText: '{}', onMatch: 'use_and_stop' }); changed() }
function removeRule(index: number) { config.matchRules.splice(index, 1); changed() }
function updateConditions(matchRule: any) { try { matchRule.conditions = matchRule.conditionsText ? JSON.parse(matchRule.conditionsText) : {}; changed() } catch { /* 简化输入暂保留原条件 */ } }
function changed() { emit('change') }
config.matchRules.forEach((matchRule: any) => { if (matchRule.conditionsText === undefined) matchRule.conditionsText = JSON.stringify(matchRule.conditions || {}) })
</script>

<style scoped>
.field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.mapping-row { display: grid; grid-template-columns: 1fr auto 1fr auto; gap: 8px; align-items: center; margin-bottom: 8px; }
.section-title { margin: 4px 0 8px; font-size: 13px; font-weight: 600; }.rule-title { margin-top: 16px; }
.match-card { padding: 10px; margin-bottom: 8px; border: 1px solid var(--el-border-color-lighter); border-radius: 4px; }.match-card .el-input, .match-card .el-select, .match-card .el-input-number { width: 100%; margin-bottom: 8px; }
.rule-editor :deep(.el-form-item) { margin-bottom: 12px; }
@media (max-width: 640px) { .field-grid { grid-template-columns: 1fr; } .mapping-row { grid-template-columns: 1fr; } }
</style>
