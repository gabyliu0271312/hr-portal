<template>
  <div class="rule-editor lookup-editor">
    <div class="lookup-hint">每个配置按优先级依次匹配；同一 Lookup 规则只写入一个共享目标字段。</div>
    <div v-for="(item, index) in config.lookupConfigs" :key="item.id" class="lookup-card">
      <div class="lookup-card__header"><span>配置 {{ index + 1 }}</span><el-button link type="danger" :disabled="config.lookupConfigs.length === 1" @click="removeConfig(index)">删除</el-button></div>
      <div class="field-grid">
        <el-form-item label="优先级"><el-input-number v-model="item.priority" :min="1" controls-position="right" @change="changed" /></el-form-item>
        <el-form-item label="参考数据表"><el-select v-model="item.referenceDatasetId" filterable clearable placeholder="选择 DWD 数据表" @change="changedDataset(item)"><el-option v-for="dataset in referenceDatasets" :key="dataset.id" :label="dataset.name" :value="dataset.id" /></el-select></el-form-item>
        <el-form-item label="ODS 源字段"><el-select v-model="item.sourceField" filterable clearable placeholder="选择 ODS 源字段" @change="changed"><el-option v-for="field in uniqueFields(sourceFields)" :key="fieldCode(field)" :label="fieldLabel(field)" :value="fieldCode(field)" /></el-select></el-form-item>
        <el-form-item label="参考匹配字段"><el-select v-model="item.referenceMatchField" filterable clearable :loading="isLoading(item.referenceDatasetId)" placeholder="选择参考匹配字段" @change="changed"><el-option v-for="field in referenceFields(item.referenceDatasetId)" :key="field" :label="field" :value="field" /></el-select></el-form-item>
        <el-form-item label="参考返回字段"><el-select v-model="item.referenceReturnField" filterable clearable :loading="isLoading(item.referenceDatasetId)" placeholder="选择参考返回字段" @change="changed"><el-option v-for="field in referenceFields(item.referenceDatasetId)" :key="field" :label="field" :value="field" /></el-select></el-form-item>
        <el-form-item label="目标 DWD 字段"><el-select v-model="item.targetField" filterable clearable :disabled="index > 0" placeholder="选择目标 DWD 字段" @change="syncTarget(item.targetField)"><el-option v-for="field in uniqueFields(targetFields)" :key="fieldCode(field)" :label="fieldLabel(field)" :value="fieldCode(field)" /></el-select></el-form-item>
      </div>
      <div class="conditions"><div class="conditions__title">参考条件（可选）</div>
        <div v-for="(_value, field) in item.conditions" :key="String(field)" class="condition-row"><el-select v-model="conditionKeys[item.id][String(field)]" filterable placeholder="参考条件字段" @change="renameCondition(item, String(field), conditionKeys[item.id][String(field)])"><el-option v-for="referenceField in referenceFields(item.referenceDatasetId)" :key="referenceField" :label="referenceField" :value="referenceField" /></el-select><span>=</span><el-input v-model="item.conditions[String(field)]" placeholder="固定值" @input="changed" /><el-button link type="danger" @click="removeCondition(item, String(field))">删除</el-button></div>
        <el-button link type="primary" @click="addCondition(item)">+ 添加条件</el-button>
      </div>
    </div>
    <el-button plain type="primary" @click="addConfig">+ 添加优先级配置</el-button>
    <el-divider />
    <el-form-item label="未匹配处理"><el-select v-model="config.unmatched" @change="changed"><el-option v-for="option in unmatchedOptions" :key="option.value" :label="option.label" :value="option.value" /></el-select></el-form-item>
    <el-form-item v-if="config.unmatched === 'set_default'" label="默认值"><el-input v-model="config.defaultValue" placeholder="未匹配时写入的默认值" @input="changed" /></el-form-item>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { listAssetColumns } from '@/api/warehouse'

const props = defineProps<{ rule: any; sourceFields: any[]; targetFields: any[]; policy: any }>()
const emit = defineEmits<{ change: [] }>()
const config = props.rule.config || (props.rule.config = { lookupConfigs: [], unmatched: 'keep' })
config.lookupConfigs = config.lookupConfigs || []
const fieldCache = reactive<Record<string, string[]>>({ ...(props.policy?.referenceLookup?.datasetFields || {}) })
const loading = ref(new Set<string>())
const conditionKeys = reactive<Record<string, Record<string, string>>>({})
const referenceDatasets = computed(() => Array.from(new Set<string>((props.policy?.referenceLookup?.allowedDatasetIds || []) as string[])).map((id) => ({ id, name: props.policy?.referenceLookup?.datasetLabels?.[id] || id })).sort((left, right) => String(left.name).localeCompare(String(right.name))))
const allowedReferenceDatasetIds = computed(() => new Set(referenceDatasets.value.map((dataset) => dataset.id)))
const unmatchedOptions = [{ label: '保留原值', value: 'keep' }, { label: '设置默认值', value: 'set_default' }, { label: '置空', value: 'set_null' }, { label: '标记未匹配', value: 'flag' }, { label: '阻断执行', value: 'reject' }]
//参考字段', value: 'keep' }, { label: '参考字段?', value: 'set_default' }, { label: '??', value: 'set_null' }, { label: '参考字段?', value: 'flag' }, { label: '参考字段', value: 'reject' }]
const fieldCode = (field: any) => field.code || field.column_code || field.id || field
const fieldLabel = (field: any) => field.label || field.column_label || fieldCode(field)
const uniqueFields = (fields: any[]) => Array.from(new Map(fields.map((field) => [fieldCode(field), field])).values())
const referenceFields = (datasetId: string) => fieldCache[datasetId] || []
const isLoading = (datasetId: string) => loading.value.has(datasetId)
function changed() { emit('change') }
async function ensureReferenceFields(datasetId: string) {
  if (!datasetId || fieldCache[datasetId] || loading.value.has(datasetId)) return
  loading.value.add(datasetId)
  try { const response = await listAssetColumns(datasetId); fieldCache[datasetId] = response.columns.map((column: any) => column.column_code) } finally { loading.value.delete(datasetId) }
}
function newConfig() { return { id: `lookup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, priority: (config.lookupConfigs.length + 1) * 10, referenceDatasetId: '', sourceField: '', referenceMatchField: '', referenceReturnField: '', targetField: config.lookupConfigs[0]?.targetField || '', conditions: {} } }
function addConfig() { config.lookupConfigs.push(newConfig()); changed() }
function removeConfig(index: number) { config.lookupConfigs.splice(index, 1); changed() }
function syncTarget(targetField: string) { config.lookupConfigs.forEach((item: any) => { item.targetField = targetField }); props.rule.targetFields = targetField ? [targetField] : []; changed() }
function resetDatasetFields(item: any) { item.referenceMatchField = ''; item.referenceReturnField = '' }
function normalizeDataset(item: any): boolean {
  if (!item.referenceDatasetId || allowedReferenceDatasetIds.value.has(item.referenceDatasetId)) return false
  item.referenceDatasetId = ''
  resetDatasetFields(item)
  return true
}
async function changedDataset(item: any) { normalizeDataset(item); resetDatasetFields(item); await ensureReferenceFields(item.referenceDatasetId); changed() }
function addCondition(item: any) { const key = `condition_${Object.keys(item.conditions).length + 1}`; item.conditions[key] = ''; (conditionKeys[item.id] ||= {})[key] = key; changed() }
function removeCondition(item: any, field: string) { delete item.conditions[field]; delete (conditionKeys[item.id] || {})[field]; changed() }
function renameCondition(item: any, oldField: string, nextField: string) { if (!nextField || nextField === oldField) return; const value = item.conditions[oldField]; delete item.conditions[oldField]; item.conditions[nextField] = value; delete conditionKeys[item.id][oldField]; conditionKeys[item.id][nextField] = nextField; changed() }
if (!config.lookupConfigs.length) addConfig()
let normalizedLegacyConfig = false
for (const item of config.lookupConfigs) { normalizedLegacyConfig = normalizeDataset(item) || normalizedLegacyConfig; conditionKeys[item.id] = Object.fromEntries(Object.keys(item.conditions || {}).map((field) => [field, field])); ensureReferenceFields(item.referenceDatasetId) }
if (normalizedLegacyConfig) changed()
</script>

<style scoped>
.lookup-hint { margin-bottom: 12px; color: var(--el-text-color-secondary); font-size: 13px; }
.lookup-card { padding: 14px; margin-bottom: 12px; border: 1px solid var(--el-border-color); border-radius: 8px; background: var(--el-fill-color-lighter); }
.lookup-card__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-weight: 600; }
.field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 14px; }
.conditions { padding-top: 4px; }.conditions__title { margin-bottom: 6px; font-size: 13px; color: var(--el-text-color-secondary); }.condition-row { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto; gap: 8px; align-items: center; margin-bottom: 8px; }
@media (max-width: 760px) { .field-grid { grid-template-columns: 1fr; }.condition-row { grid-template-columns: 1fr auto 1fr; }.condition-row .el-button { grid-column: 3; justify-self: end; } }
</style>
