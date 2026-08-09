<template>
  <div class="rule-editor">
    <div class="field-grid">
      <el-form-item label="源字段"><el-select v-model="sourceField" placeholder="选择源字段" filterable clearable><el-option v-for="field in sourceFields" :key="fieldCode(field)" :label="fieldLabel(field)" :value="fieldCode(field)" /></el-select></el-form-item>
      <el-form-item label="目标字段"><el-select v-model="targetField" placeholder="选择目标字段" filterable clearable><el-option v-for="field in targetFields" :key="fieldCode(field)" :label="fieldLabel(field)" :value="fieldCode(field)" /></el-select></el-form-item>
    </div>
    <el-form-item label="默认行为"><el-tag type="info">保留源值（keep_source）</el-tag></el-form-item>
    <div class="section-title">覆盖规则</div>
    <div v-for="(value, key) in config.overrides" :key="key" class="mapping-row">
      <el-input v-model="overrideKeys[key]" placeholder="源值" @change="renameOverride(key, overrideKeys[key])" /><span>→</span>
      <el-input v-model="config.overrides[key]" placeholder="覆盖值" @input="changed" /><el-button link type="danger" @click="removeOverride(key)">删除</el-button>
    </div>
    <el-button link type="primary" @click="addOverride">+ 添加覆盖</el-button>
    <el-form-item label="未匹配处理" class="unmatched"><el-select v-model="config.unmatched" @change="changed"><el-option v-for="item in unmatchedOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
const props = defineProps<{ rule: any; sourceFields: any[]; targetFields: any[]; policy: any }>()
const emit = defineEmits<{ change: [] }>()
const config = props.rule.config || (props.rule.config = { defaultBehavior: 'keep_source', overrides: {}, unmatched: 'keep' })
config.defaultBehavior = 'keep_source'; config.overrides = config.overrides || {}
const overrideKeys = reactive<Record<string, string>>({ ...Object.fromEntries(Object.keys(config.overrides).map((key) => [key, key])) })
const unmatchedOptions = [{ value: 'keep', label: '保留原值' }, { value: 'set_default', label: '设置默认值' }, { value: 'set_null', label: '设置为空' }, { value: 'flag', label: '标记未匹配' }, { value: 'reject', label: '拒绝' }]
const sourceField = computed({ get: () => props.rule.sourceFields?.[0] || '', set: (v: string) => { props.rule.sourceFields = v ? [v] : []; changed() } })
const targetField = computed({ get: () => props.rule.targetFields?.[0] || '', set: (v: string) => { props.rule.targetFields = v ? [v] : []; changed() } })
function fieldCode(field: any) { return typeof field === 'string' ? field : field.code }
function fieldLabel(field: any) { return typeof field === 'string' ? field : (field.label || field.code) }
function addOverride() { let key = ''; let i = 1; while (Object.prototype.hasOwnProperty.call(config.overrides, key)) key = `源值${i++}`; config.overrides[key] = ''; overrideKeys[key] = key; changed() }
function removeOverride(key: string | number) { const oldKey = String(key); delete config.overrides[oldKey]; delete overrideKeys[oldKey]; changed() }
function renameOverride(oldKeyValue: string | number, newKeyValue: string | number) { const oldKey = String(oldKeyValue); const key = String(newKeyValue || '').trim(); if (!key || key === oldKey || Object.prototype.hasOwnProperty.call(config.overrides, key)) { overrideKeys[oldKey] = oldKey; return } config.overrides[key] = config.overrides[oldKey]; delete config.overrides[oldKey]; overrideKeys[key] = key; delete overrideKeys[oldKey]; changed() }
function changed() { emit('change') }
</script>

<style scoped>
.field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }.mapping-row { display: grid; grid-template-columns: 1fr auto 1fr auto; gap: 8px; align-items: center; margin-bottom: 8px; }.section-title { margin: 4px 0 8px; font-size: 13px; font-weight: 600; }.rule-editor :deep(.el-form-item) { margin-bottom: 12px; }
@media (max-width: 640px) { .field-grid { grid-template-columns: 1fr; } .mapping-row { grid-template-columns: 1fr; } }
</style>
