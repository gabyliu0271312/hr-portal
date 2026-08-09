<template>
  <div class="warehouse-sink-config">
    <el-alert v-if="config.write_mode === 'replace'" title="危险：每次运行会清空目标资产全部数据后重写。" type="error" :closable="false" style="margin-bottom:12px" />
    <el-alert v-if="config.write_mode === 'period_full_snapshot'" title="本批次会替换目标期间数据，并删除该期间未出现的业务键；历史期间保持不变。" type="warning" :closable="false" style="margin-bottom:12px" />
    <el-form-item label="目标资产"><el-select :model-value="modelValue.target_asset" filterable placeholder="选择已发布数据资产" style="width:100%" @change="selectAsset"><el-option v-for="asset in assets" :key="asset.table_name" :label="asset.table_label" :value="asset.table_name" /></el-select></el-form-item>
    <IngestionModeSelect v-model="ingestionMode" :is-period="assetIsPeriod" :period-label="periodLabel" :key-labels="businessKeyLabels" />
    <el-form-item v-if="config.write_mode === 'period_full_snapshot'" label="期间字段"><el-input :model-value="config.period_field" disabled /></el-form-item>
    <el-form-item label="业务主键"><el-tag v-for="column in columns.filter(item => item.is_pk_part)" :key="column.column_code" size="small" style="margin-right:6px">{{ column.column_label }}</el-tag></el-form-item>
    <el-form-item label="允许写入字段"><el-select v-model="config.field_whitelist" multiple filterable style="width:100%"><el-option v-for="column in columns" :key="column.column_code" :label="column.column_label" :value="column.column_code" /></el-select></el-form-item>
    <el-form-item label="事件补充字段"><el-select v-model="config.event_fields" multiple allow-create filterable default-first-option placeholder="例如 period" style="width:100%" /></el-form-item>
    <el-divider content-position="left">字段映射</el-divider>
    <el-alert v-if="lossyWriteBlocked" class="lossy-write-blocked" type="error" :closable="false" show-icon>
      <template #title>lossy_write_blocked：{{ mappingSaveState.message }}</template>
    </el-alert>
    <MappingWorkspace
      :model-value="mappingDocument"
      :policy="mappingPolicy"
      :compatibility="compatibility"
      :source-fields="sourceFields"
      :target-fields="targetFields"
      @update:model-value="handleMappingDocumentUpdate"
      @dirty="handleMappingDirty"
    />
    <el-divider content-position="left">聚合校验</el-divider>
    <div v-for="(rule, index) in config.validations" :key="index" class="mapping-row"><el-input v-model="rule.group_by_text" placeholder="分组字段，逗号分隔" @change="syncRules" /><el-select v-model="rule.sum_field" placeholder="汇总字段"><el-option v-for="column in columns" :key="column.column_code" :label="column.column_label" :value="column.column_code" /></el-select><el-input-number v-model="rule.expected" :precision="4" /><el-input-number v-model="rule.tolerance" :precision="4" :step="0.0001" /><el-button link type="danger" @click="config.validations.splice(index, 1)">删除</el-button></div>
    <el-button size="small" @click="config.validations.push({ type: 'group_sum_equals', group_by_text: '', sum_field: '', expected: 1, tolerance: 0.0001 })">添加聚合校验</el-button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  RULE_TYPES,
  type MappingCallerPolicy,
  type MappingCompatibility,
  type MappingDocument,
  type MappingRule,
} from '@/api/mapping'
import MappingWorkspace from '@/components/mapping/MappingWorkspace.vue'
import { getAsset, listAssets, listAssetColumns, type Asset, type AssetColumn } from '@/api/warehouse'
import IngestionModeSelect, { type IngestionMode } from '@/components/warehouse/IngestionModeSelect.vue'

interface MappingSaveState {
  canSave: boolean
  code: 'lossy_write_blocked' | null
  message: string
  lossyFields: string[]
}

type LegacyMapping = Record<string, any>

const props = defineProps<{ modelValue: Record<string, any> }>()
const emit = defineEmits<{
  'update:modelValue': [value: Record<string, any>]
  'lossy-write-blocked': [state: MappingSaveState]
  'save-state': [state: MappingSaveState]
}>()
const assets = ref<Asset[]>([])
const columns = ref<AssetColumn[]>([])
const assetIsPeriod = ref(false)
const periodLabel = ref<string | null>(null)
const config = computed(() => props.modelValue)
const businessKeyLabels = computed(() => columns.value.filter(column => column.is_pk_part).map(column => column.column_label))
const modeByWriteMode: Record<string, IngestionMode> = { upsert: 'incremental_upsert', append: 'append', period_full_snapshot: 'period_full_snapshot', replace: 'current_snapshot' }
const writeModeByMode: Record<IngestionMode, string> = { current_snapshot: 'upsert', incremental_upsert: 'upsert', append: 'append', period_full_snapshot: 'period_full_snapshot' }
const ingestionMode = computed<IngestionMode | null>({
  get: () => modeByWriteMode[config.value.write_mode] || 'incremental_upsert',
  set: (mode) => {
    if (!mode) return
    config.value.write_mode = writeModeByMode[mode]
    if (mode === 'period_full_snapshot') {
      config.value.period_field = periodLabel.value
      const keys = columns.value.filter(column => column.is_pk_part).map(column => column.column_code)
      config.value.field_whitelist = [...new Set([...(config.value.field_whitelist || []), ...keys])]
      delete config.value.primary_key
    }
  },
})

const issuedAt = new Date().toISOString()
const legacyMappingSnapshot = ref<any[]>([])
const adapterUnknownFields = ref<Record<string, any>>({})
const adapterReadLossyFields = ref<string[]>([])
const mappingDocument = ref<MappingDocument>(emptyMappingDocument())
const compatibility = ref<MappingCompatibility>(emptyCompatibility())
const mappingSaveState = ref<MappingSaveState>({ canSave: true, code: null, message: '', lossyFields: [] })
const lossyWriteBlocked = computed(() => !mappingSaveState.value.canSave)
const canSave = computed(() => mappingSaveState.value.canSave)

const fieldWhitelist = computed<string[]>(() => Array.isArray(config.value.field_whitelist) ? config.value.field_whitelist : [])
const protectedKeyFields = computed(() => {
  const configuredKeys = Array.isArray(config.value.primary_key) ? config.value.primary_key : []
  return [...new Set([...columns.value.filter(column => column.is_pk_part).map(column => column.column_code), ...configuredKeys])]
})
const readonlyFields = computed(() => columns.value.filter(column => column.is_computed || (!column.is_pk_part && !fieldWhitelist.value.includes(column.column_code))).map(column => column.column_code))
const sourceFields = computed(() => {
  const codes = new Set<string>(Array.isArray(config.value.event_fields) ? config.value.event_fields : [])
  mappingDocument.value.ruleSet.rules.forEach(rule => rule.sourceFields.forEach(field => field && codes.add(field)))
  return Array.from(codes).map(code => ({ code, label: code }))
})
const targetFields = computed(() => columns.value
  .filter(column => fieldWhitelist.value.includes(column.column_code))
  .map(column => ({ code: column.column_code, label: column.column_label, type: column.data_type })))
const mappingPolicy = computed<MappingCallerPolicy>(() => ({
  caller: 'warehouse_sink',
  allowedRuleTypes: [...RULE_TYPES],
  source: {
    assetId: null,
    schemaHash: '',
    allowedFieldIds: sourceFields.value.map(field => field.code),
  },
  target: {
    assetId: config.value.target_asset || null,
    schemaHash: '',
    allowedFieldIds: [...fieldWhitelist.value],
    readonlyFieldIds: readonlyFields.value,
    protectedKeyFieldIds: protectedKeyFields.value,
  },
  referenceLookup: { allowedDatasetIds: [], allowedFieldIds: [], maxRules: 20 },
  effects: {
    allowPreview: true,
    allowSave: canSave.value,
    allowPublish: false,
    allowExecute: false,
    allowRebuild: false,
  },
  legacy: {
    sourceFormat: 'warehouse_asset_sink_legacy',
    allowLegacyRead: true,
    allowLegacyWrite: true,
    allowMigration: false,
  },
  metadata: { policyVersion: 1, permissionScope: 'ucp.pipelines', issuedAt },
}))

function clone<T>(value: T): T {
  if (value === undefined) return value
  return JSON.parse(JSON.stringify(value)) as T
}

function emptyMappingDocument(): MappingDocument {
  return {
    mappingSchemaVersion: 1,
    ruleSet: {
      code: 'warehouse_asset_sink',
      name: 'Warehouse Asset Sink',
      sourceAsset: null,
      targetAsset: null,
      sourceSchemaHash: '',
      targetSchemaHash: '',
      rules: [],
    },
  }
}

function emptyCompatibility(): MappingCompatibility {
  return {
    sourceFormat: 'warehouse_asset_sink_legacy',
    readable: true,
    writable: true,
    requiresMigration: false,
    lossyFields: [],
    unknownFields: {},
  }
}

function ensureConfig(): void {
  config.value.event_fields ||= []
  config.value.mapping ||= []
  config.value.validations ||= []
  config.value.field_whitelist ||= []
}

function legacyRuleToPublic(rawRule: unknown, index: number, lossyFields: string[]): MappingRule | null {
  const path = `mapping[${index}]`
  if (!rawRule || typeof rawRule !== 'object' || Array.isArray(rawRule)) {
    lossyFields.push(path)
    return null
  }
  const legacy = rawRule as LegacyMapping
  const source = legacy.source
  const target = legacy.target
  const transform = legacy.transform == null || legacy.transform === '' ? 'identity' : legacy.transform
  if (typeof source !== 'string' || !source || typeof target !== 'string' || !target || typeof transform !== 'string') {
    lossyFields.push(path)
    return null
  }
  const base = {
    id: String(index),
    enabled: true,
    displayOrder: index,
    sourceFields: [source],
    targetFields: [target],
  }
  if (transform === 'identity') return { ...base, type: 'field', config: { mode: 'rename' } } as MappingRule
  if (transform === 'string' || transform === 'decimal') {
    return { ...base, type: 'type_convert', config: { targetType: transform === 'string' ? 'string' : 'number', onError: 'reject' } } as MappingRule
  }
  if (transform === 'decimal_divide_100') {
    return { ...base, type: 'format', config: { formatType: 'unit_convert', options: { multiplier: 0.01 }, onError: 'reject' } } as MappingRule
  }
  if (transform === 'trim' || transform === 'yyyy_mm_to_yyyymm') {
    return { ...base, type: 'format', config: { formatType: transform, options: {}, onError: 'reject' } } as MappingRule
  }
  lossyFields.push(path)
  return null
}

function collectUnknownFields(snapshot: Record<string, any>, rawMapping: any[]): Record<string, any> {
  const unknown: Record<string, any> = {}
  const sinkContractKeys = ['target_asset', 'write_mode', 'primary_key', 'field_whitelist', 'batch_key', 'period_field']
  sinkContractKeys.forEach((key) => {
    if (key in snapshot) unknown[key] = clone(snapshot[key])
  })
  if ('validations' in snapshot) unknown.validations = clone(snapshot.validations)
  const knownTopLevel = new Set(['mapping', 'validations', ...sinkContractKeys])
  Object.entries(snapshot).forEach(([key, value]) => {
    if (!knownTopLevel.has(key)) unknown[key] = clone(value)
  })
  rawMapping.forEach((rawRule, index) => {
    if (!rawRule || typeof rawRule !== 'object' || Array.isArray(rawRule)) return
    Object.entries(rawRule).forEach(([key, value]) => {
      if (!['source', 'target', 'transform'].includes(key)) unknown[`mapping[${index}].${key}`] = clone(value)
    })
  })
  unknown.__legacy_sink_snapshot__ = clone(snapshot)
  unknown.__legacy_mapping_snapshot__ = clone(snapshot)
  return unknown
}

function initializeMappingAdapter(): void {
  ensureConfig()
  const rawMapping = clone(Array.isArray(config.value.mapping) ? config.value.mapping : [])
  const lossyFields: string[] = []
  const rules = rawMapping.map((rule, index) => legacyRuleToPublic(rule, index, lossyFields)).filter((rule): rule is MappingRule => rule !== null)
  legacyMappingSnapshot.value = rawMapping
  adapterReadLossyFields.value = lossyFields
  adapterUnknownFields.value = collectUnknownFields(clone(config.value), rawMapping)
  mappingDocument.value = {
    mappingSchemaVersion: 1,
    ruleSet: {
      code: config.value.target_asset || 'warehouse_asset_sink',
      name: config.value.target_asset || 'Warehouse Asset Sink',
      sourceAsset: null,
      targetAsset: config.value.target_asset || null,
      sourceSchemaHash: '',
      targetSchemaHash: '',
      rules,
    },
  }
  compatibility.value = {
    sourceFormat: 'warehouse_asset_sink_legacy',
    readable: true,
    writable: lossyFields.length === 0,
    requiresMigration: lossyFields.length > 0,
    lossyFields: [...lossyFields],
    unknownFields: adapterUnknownFields.value,
  }
  syncDocumentToLegacy(false)
}

function normalizedLegacyTransform(rawRule: LegacyMapping): string {
  return rawRule.transform == null || rawRule.transform === '' ? 'identity' : String(rawRule.transform)
}

function publicRuleToLegacy(rule: MappingRule, originalRule?: LegacyMapping): { source: string; target: string; transform: string } | string {
  if (!rule.enabled) return `规则 ${rule.id} 已禁用，legacy Sink 无法表达 disabled rule`
  if (rule.sourceFields.length !== 1 || rule.targetFields.length !== 1 || !rule.sourceFields[0] || !rule.targetFields[0]) {
    return `规则 ${rule.id} 只支持非空的单一 source/target`
  }
  const source = rule.sourceFields[0]
  const target = rule.targetFields[0]
  let transform: string | null = null
  if (rule.type === 'field' && (rule.config as any).mode === 'rename') transform = 'identity'
  if (rule.type === 'type_convert' && (rule.config as any).onError === 'reject') {
    if ((rule.config as any).targetType === 'string') transform = 'string'
    if ((rule.config as any).targetType === 'number') transform = 'decimal'
  }
  if (rule.type === 'format' && (rule.config as any).onError === 'reject') {
    const formatType = (rule.config as any).formatType
    const options = (rule.config as any).options || {}
    if (['trim', 'yyyy_mm_to_yyyymm'].includes(formatType) && Object.keys(options).length === 0) transform = formatType
    if (formatType === 'unit_convert' && Object.keys(options).length === 1 && options.multiplier === 0.01) transform = 'decimal_divide_100'
  }
  if (!transform) return `公共规则 ${rule.id} 无法由 Warehouse Asset Sink legacy transform 表达`
  if (!fieldWhitelist.value.includes(target)) return `目标字段 ${target} 不在 Sink field_whitelist 中`

  if (readonlyFields.value.includes(target)) return `目标字段 ${target} 是 Sink 只读字段，Workspace 不得写入`
  if (protectedKeyFields.value.includes(target)) {
    const unchanged = originalRule
      && originalRule.source === source
      && originalRule.target === target
      && normalizedLegacyTransform(originalRule) === transform
    if (!unchanged) return `目标字段 ${target} 是 Sink 主键，Workspace 不得覆盖既有映射`
  }
  return { source, target, transform }
}

function buildLegacyMapping(document: MappingDocument): { mapping?: LegacyMapping[]; lossyFields: string[] } {
  const lossyFields = [...adapterReadLossyFields.value]
  if (document.mappingSchemaVersion !== 1) lossyFields.push('mappingSchemaVersion')
  if (document.ruleSet.targetAsset !== (config.value.target_asset || null)) lossyFields.push('target_asset')
  if (lossyFields.length) return { lossyFields }

  const originalById = new Map<string, LegacyMapping>()
  legacyMappingSnapshot.value.forEach((rawRule, index) => {
    if (rawRule && typeof rawRule === 'object' && !Array.isArray(rawRule)) originalById.set(String(index), rawRule as LegacyMapping)
  })
  const retainedIds = new Set<string>()
  const output: LegacyMapping[] = []
  document.ruleSet.rules.forEach((rule) => {
    const original = originalById.get(rule.id)
    const converted = publicRuleToLegacy(rule, original)
    if (typeof converted === 'string') {
      lossyFields.push(converted)
      return
    }
    const outputRule = original ? clone(original) : {}
    outputRule.source = converted.source
    outputRule.target = converted.target
    const originalTransform = original ? normalizedLegacyTransform(original) : null
    if (!original || originalTransform !== converted.transform) {
      if (converted.transform !== 'identity' || 'transform' in outputRule) outputRule.transform = converted.transform
    }
    output.push(outputRule)
    if (original) retainedIds.add(rule.id)
  })
  originalById.forEach((rawRule, id) => {
    if (retainedIds.has(id)) return
    const protectedFields = Object.keys(rawRule).filter(key => !['source', 'target', 'transform'].includes(key))
    if (protectedFields.length) lossyFields.push(`删除 mapping[${id}] 会丢失 ${protectedFields.join(', ')}`)
  })
  return lossyFields.length ? { lossyFields } : { mapping: output, lossyFields: [] }
}

function updateSaveState(lossyFields: string[]): void {
  const next: MappingSaveState = lossyFields.length
    ? { canSave: false, code: 'lossy_write_blocked', message: lossyFields.join('；'), lossyFields: [...lossyFields] }
    : { canSave: true, code: null, message: '', lossyFields: [] }
  const changed = JSON.stringify(next) !== JSON.stringify(mappingSaveState.value)
  mappingSaveState.value = next
  compatibility.value = {
    ...compatibility.value,
    writable: next.canSave,
    requiresMigration: !next.canSave,
    lossyFields: [...next.lossyFields],
    unknownFields: adapterUnknownFields.value,
  }
  if (!changed) return
  emit('save-state', clone(next))
  if (!next.canSave) emit('lossy-write-blocked', clone(next))
}

function syncDocumentToLegacy(emitUpdate = true): void {
  const result = buildLegacyMapping(mappingDocument.value)
  updateSaveState(result.lossyFields)
  if (!result.mapping) return
  config.value.mapping.splice(0, config.value.mapping.length, ...clone(result.mapping))
  if (emitUpdate) emit('update:modelValue', config.value)
}

function handleMappingDocumentUpdate(document: MappingDocument): void {
  mappingDocument.value = document
  syncDocumentToLegacy()
}

function handleMappingDirty(dirty: boolean): void {
  if (dirty) syncDocumentToLegacy()
}

async function selectAsset(value: string): Promise<void> {
  columns.value = (await listAssetColumns(value)).columns
  const asset = await getAsset(value)
  assetIsPeriod.value = asset.is_period
  periodLabel.value = asset.period_col
  config.value.target_asset = value
  config.value.period_field = null
  config.value.field_whitelist = []
  config.value.mapping = []
  config.value.validations = []
  if (asset.is_period) ingestionMode.value = 'period_full_snapshot'
}

function syncRules(): void {
  config.value.validations.forEach((rule: any) => {
    rule.group_by = String(rule.group_by_text || '').split(',').map((item) => item.trim()).filter(Boolean)
  })
}

watch([() => props.modelValue.target_asset, () => props.modelValue.mapping], initializeMappingAdapter, { immediate: true })
watch([fieldWhitelist, readonlyFields, protectedKeyFields], () => syncDocumentToLegacy(false), { deep: true })
watch(() => props.modelValue.target_asset, async (value) => {
  ensureConfig()
  if (value) {
    columns.value = (await listAssetColumns(value)).columns
    const asset = await getAsset(value)
    assetIsPeriod.value = asset.is_period
    periodLabel.value = asset.period_col
    if (asset.is_period) ingestionMode.value = 'period_full_snapshot'
  }
}, { immediate: true })
listAssets({ asset_status: 'published', page_size: 200 }).then((result: any) => { assets.value = result.items || result }).catch(() => { assets.value = [] })

defineExpose({
  canSave,
  lossyWriteBlocked,
  mappingSaveState,
  mappingDocument,
  mappingPolicy,
  compatibility,
  syncDocumentToLegacy,
})
</script>

<style scoped>
.mapping-row { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-bottom:8px }
.mapping-row .el-input,.mapping-row .el-select { flex:1; min-width:140px }
.lossy-write-blocked { margin-bottom: 10px }
@media (max-width: 768px) { .mapping-row > * { flex: 1 1 100% } }
</style>
