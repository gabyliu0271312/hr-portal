<template>
  <div class="warehouse-sink-config">
    <el-button type="primary" plain @click="openDialog">配置资产写入</el-button>

    <UiFullScreenModal v-if="dialogVisible" title="资产写入配置" :show-footer="false" @back="closeDialog">
      <template #subtitle>配置目标资产、上游字段映射与聚合校验；字段映射支持七类规则，运行时统一按公共映射文档执行。</template>
      <template #actions>
        <UiStepFlow :steps="dialogSteps" :current-step="dialogStep" aria-label="资产写入配置步骤" />
        <el-button v-if="dialogStep > 0" @click="prevStep">上一步</el-button>
        <el-button v-if="dialogStep < dialogSteps.length - 1" type="primary" @click="nextStep">下一步</el-button>
        <el-button v-else type="primary" :disabled="!canSave" @click="finishDialog">完成配置</el-button>
      </template>

      <div class="sink-onboarding-body">
        <section class="sink-onboarding-panel" :style="{ maxWidth: dialogPanelWidth }">
          <header class="panel-header">
            <h2>{{ currentStep.label }}</h2>
            <p>{{ currentStep.hint }}</p>
          </header>

          <div v-show="dialogStep === 0" class="panel-body">
            <el-alert v-if="config.write_mode === 'replace'" title="危险：每次运行会清空目标资产全部数据后重写。" type="error" :closable="false" />
            <el-alert v-if="config.write_mode === 'period_full_snapshot'" title="本批次会替换目标期间数据，并删除该期间未出现的业务键；历史期间保持不变。" type="warning" :closable="false" />

            <div class="field-grid">
              <label class="field field--wide">
                <span class="field-label">目标资产<i class="required">*</i></span>
                <el-select :model-value="modelValue.target_asset" filterable placeholder="选择已发布数据资产" style="width:100%" @change="selectAsset">
                  <el-option v-for="asset in assets" :key="asset.table_name" :label="asset.table_label" :value="asset.table_name" />
                </el-select>
              </label>
            </div>

            <div class="field-grid">
              <label class="field">
                <span class="field-label">写入模式<i class="required">*</i></span>
                <IngestionModeSelect v-model="ingestionMode" :is-period="assetIsPeriod" :period-label="periodLabel" :key-labels="businessKeyLabels" />
              </label>
              <label v-if="config.write_mode === 'period_full_snapshot'" class="field">
                <span class="field-label">期间字段</span>
                <el-input :model-value="config.period_field" disabled />
              </label>
            </div>

            <label class="field field--wide">
              <span class="field-label">业务主键</span>
              <div class="tag-list">
                <el-tag v-for="column in columns.filter(item => item.is_pk_part)" :key="column.column_code" size="small">{{ column.column_label }}</el-tag>
              </div>
            </label>

            <label class="field field--wide">
              <span class="field-label">允许写入字段<i class="required">*</i></span>
              <el-select v-model="config.field_whitelist" multiple filterable style="width:100%">
                <el-option v-for="column in columns" :key="column.column_code" :label="column.column_label" :value="column.column_code" />
              </el-select>
              <span class="field-hint">仅白名单内字段可写入目标资产；映射后的目标字段必须都在此名单内。</span>
            </label>

            <label class="field field--wide">
              <span class="field-label">事件补充字段</span>
              <el-select v-model="config.event_fields" multiple allow-create filterable default-first-option placeholder="例如 period" style="width:100%" />
              <span class="field-hint">来自触发事件的附加字段（如期间、来源标识），可参与字段映射。</span>
            </label>
          </div>

          <div v-show="dialogStep === 1" class="panel-body panel-body--mapping">
            <div v-if="upstreamSummary" class="upstream-banner">
              <el-icon><Connection /></el-icon>
              <span>上游字段目录：{{ upstreamSummary }}</span>
            </div>
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
            <div v-if="componentV1Hint" class="component-v1-hint">
              {{ componentV1Hint }}
            </div>
          </div>

          <div v-show="dialogStep === 2" class="panel-body">
            <div class="panel-actions">
              <el-button size="small" @click="config.validations.push({ type: 'group_sum_equals', group_by_text: '', sum_field: '', expected: 1, tolerance: 0.0001 })">添加聚合校验</el-button>
              <span class="field-hint">校验写入行按分组汇总值是否与期望一致，保障入仓数据质量。</span>
            </div>
            <div v-for="(rule, index) in config.validations" :key="index" class="validation-row">
              <el-input v-model="rule.group_by_text" placeholder="分组字段，逗号分隔" @change="syncRules" />
              <el-select v-model="rule.sum_field" placeholder="汇总字段">
                <el-option v-for="column in columns" :key="column.column_code" :label="column.column_label" :value="column.column_code" />
              </el-select>
              <el-input-number v-model="rule.expected" :precision="4" />
              <el-input-number v-model="rule.tolerance" :precision="4" :step="0.0001" />
              <el-button link type="danger" @click="config.validations.splice(index, 1)">删除</el-button>
            </div>
            <el-empty v-if="!config.validations.length" description="暂未配置聚合校验" :image-size="48" />
          </div>
        </section>
      </div>
    </UiFullScreenModal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Connection } from '@element-plus/icons-vue'
import {
  RULE_TYPES,
  mappingApi,
  type MappingCallerPolicy,
  type MappingCompatibility,
  type MappingDocument,
  type MappingRule,
} from '@/api/mapping'
import MappingWorkspace from '@/components/mapping/MappingWorkspace.vue'
import { getAsset, listAssets, listAssetColumns, type Asset, type AssetColumn } from '@/api/warehouse'
import IngestionModeSelect, { type IngestionMode } from '@/components/warehouse/IngestionModeSelect.vue'
import UiFullScreenModal from '@/components/ui/UiFullScreenModal.vue'
import UiStepFlow from '@/components/ui/UiStepFlow.vue'

interface MappingSaveState {
  canSave: boolean
  code: 'lossy_write_blocked' | null
  message: string
  lossyFields: string[]
}

type LegacyMapping = Record<string, any>

const props = defineProps<{
  modelValue: Record<string, any>
  upstreamFields?: Array<{ code: string; label: string; type?: string }>
}>()
const emit = defineEmits<{
  'update:modelValue': [value: Record<string, any>]
  'lossy-write-blocked': [state: MappingSaveState]
  'save-state': [state: MappingSaveState]
}>()

const dialogVisible = ref(false)
const dialogStep = ref(0)
const dialogSteps = [
  { key: 'target', label: '目标资产与写入模式', hint: '选择已发布数据资产，确定写入模式与允许写入字段；白名单即目标字段全集。' },
  { key: 'mapping', label: '字段映射', hint: '上游字段映射到目标字段；每条规则可升级为值映射、参考 Lookup、类型/格式转换、拆分合并等。' },
  { key: 'validation', label: '聚合校验', hint: '可选配置分组汇总校验，保障入仓数据质量；不配置也可直接完成。' },
]
const currentStep = computed(() => dialogSteps[dialogStep.value])
const dialogPanelWidth = computed(() => (dialogStep.value === 1 ? '1040px' : '720px'))
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
  const codes = new Map<string, { code: string; label: string; type?: string }>()
  ;(props.upstreamFields || []).forEach((field) => {
    if (field?.code) codes.set(field.code, { code: field.code, label: field.label || field.code, type: field.type })
  })
  ;(Array.isArray(config.value.event_fields) ? config.value.event_fields : []).forEach((code) => {
    if (code && !codes.has(code)) codes.set(code, { code, label: code })
  })
  mappingDocument.value.ruleSet.rules.forEach((rule) => rule.sourceFields.forEach((field) => {
    if (field && !codes.has(field)) codes.set(field, { code: field, label: field })
  }))
  return Array.from(codes.values())
})
const upstreamSummary = computed(() => {
  const fields = props.upstreamFields || []
  return fields.length ? `${fields.length} 个上游字段（来自上游节点）` : '未识别到上游字段，可从事件补充字段手动添加'
})
const componentV1Hint = computed(() => {
  if (!isComponentV1.value) return ''
  const ruleCount = mappingDocument.value.ruleSet.rules.length
  return `当前使用公共映射文档（component_v1）存储，${ruleCount} 条规则完整保留，支持七类规则（字段映射、值映射、参考 Lookup、默认映射+例外、类型转换、格式转换、拆分/合并）。`
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
  // 优先读 component_v1（已保存的新流程）；否则读 legacy mapping 兼容旧流程。
  const component = config.value.mapping_component
  if (component && typeof component === 'object') {
    mappingDocument.value = clone(component) as MappingDocument
    legacyMappingSnapshot.value = Array.isArray(config.value.mapping) ? clone(config.value.mapping) : []
    adapterReadLossyFields.value = []
    adapterUnknownFields.value = collectUnknownFields(clone(config.value), legacyMappingSnapshot.value)
    compatibility.value = {
      sourceFormat: 'warehouse_asset_sink_component_v1',
      readable: true,
      writable: true,
      requiresMigration: false,
      lossyFields: [],
      unknownFields: adapterUnknownFields.value,
    }
    syncDocumentToLegacy(false)
    return
  }
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

const isComponentV1 = computed(() => dialogVisible.value && Boolean(config.value.mapping_component && typeof config.value.mapping_component === 'object'))

/** 目标字段业务校验（与存储模式无关）：目标必须在白名单、非只读、不得覆盖主键既有映射。 */
function validateTargetContract(document: MappingDocument): string[] {
  const problems: string[] = []
  document.ruleSet.rules.forEach((rule) => {
    rule.targetFields.forEach((target) => {
      if (!target) return
      if (!fieldWhitelist.value.includes(target)) {
        problems.push(`目标字段 ${target} 不在 Sink field_whitelist 中`)
        return
      }
      if (readonlyFields.value.includes(target)) {
        problems.push(`目标字段 ${target} 是 Sink 只读字段，Workspace 不得写入`)
        return
      }
      if (protectedKeyFields.value.includes(target)) {
        const original = legacyMappingSnapshot.value.find((raw: LegacyMapping, index: number) => String(index) === String(rule.id))
        // 首次建立主键映射允许；已有主键映射更换源字段才视为覆盖并阻断。
        const changedExistingMapping = original
          && (original.source !== rule.sourceFields[0] || original.target !== target)
        if (changedExistingMapping) problems.push(`目标字段 ${target} 是 Sink 主键，Workspace 不得覆盖既有映射`)
      }
    })
  })
  return problems
}

function updateSaveState(lossyFields: string[]): void {
  // component_v1 模式下，legacy 表达的有损不阻断（component 可表达），但目标字段业务校验仍执行。
  const contractProblems = isComponentV1.value ? validateTargetContract(mappingDocument.value) : []
  const next: MappingSaveState = isComponentV1.value
    ? contractProblems.length
      ? { canSave: false, code: 'lossy_write_blocked', message: contractProblems.join('；'), lossyFields: contractProblems }
      : { canSave: true, code: null, message: '', lossyFields: [] }
    : lossyFields.length
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
  // component_v1 运行时来源仅在弹窗打开时同步（旧流程保持 legacy 不受影响）。
  if (isComponentV1.value) {
    config.value.mapping_component = clone(mappingDocument.value)
    config.value.storageMode = 'component_v1'
  }
  if (result.mapping) config.value.mapping.splice(0, config.value.mapping.length, ...clone(result.mapping))
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
  // 同步 component_v1 文档的目标资产，保证运行时 source/target 校验一致。
  if (config.value.mapping_component && typeof config.value.mapping_component === 'object') {
    config.value.mapping_component.ruleSet.targetAsset = value
    mappingDocument.value.ruleSet.targetAsset = value
  }
  await syncServerSchemaHash(value)
  if (asset.is_period) ingestionMode.value = 'period_full_snapshot'
}

async function syncServerSchemaHash(targetAsset: string): Promise<void> {
  // 服务端 /validate 会用资产元数据算 target schema hash 并要求 document 匹配；
  // 前端必须从 /data-mappings/policy 取服务端签发的 hash 回填，否则校验报
  // 「缺少目标 Schema hash / 目标 Schema hash 不匹配」。
  if (!targetAsset) return
  try {
    const serverPolicy = await mappingApi.resolvePolicy('warehouse_sink', null, targetAsset)
    const targetHash = serverPolicy?.target?.schemaHash || ''
    const sourceHash = serverPolicy?.source?.schemaHash || ''
    mappingDocument.value.ruleSet.targetSchemaHash = targetHash
    mappingDocument.value.ruleSet.sourceSchemaHash = sourceHash
    if (config.value.mapping_component && typeof config.value.mapping_component === 'object') {
      config.value.mapping_component.ruleSet.targetSchemaHash = targetHash
      config.value.mapping_component.ruleSet.sourceSchemaHash = sourceHash
    }
  } catch { /* 服务端 policy 获取失败不阻断；校验时再暴露 */ }
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
    await syncServerSchemaHash(value)
  }
}, { immediate: true })
listAssets({ asset_status: 'published', page_size: 200 }).then((result: any) => { assets.value = result.items || result }).catch(() => { assets.value = [] })

function openDialog(): void {
  ensureConfig()
  ensureComponentV1()
  dialogStep.value = 0
  dialogVisible.value = true
}
function closeDialog(): void { dialogVisible.value = false }
function prevStep(): void { if (dialogStep.value > 0) dialogStep.value -= 1 }
function nextStep(): void { if (dialogStep.value < dialogSteps.length - 1) dialogStep.value += 1 }
function finishDialog(): void { dialogVisible.value = false }

/** 确保 sink 配置以 component_v1 存储：mapping_component 为运行时来源，legacy mapping 保留为快照。
 * 仅当 legacy 映射可无损表达时升级；有损 legacy（含无法表达的自定义 transform）保持 legacy 模式并阻断保存，不静默丢字段。 */
function ensureComponentV1(): void {
  if (config.value.mapping_component && typeof config.value.mapping_component === 'object') return
  if (config.value.storageMode === 'component_v1') return
  if (adapterReadLossyFields.value.length) return
  const legacyResult = buildLegacyMapping(mappingDocument.value)
  if (legacyResult.lossyFields.length) return
  const snapshot = Array.isArray(config.value.mapping) ? clone(config.value.mapping) : []
  config.value.mapping_component = clone(mappingDocument.value)
  config.value.legacy_mapping_snapshot = snapshot.length ? snapshot : null
  config.value.storageMode = 'component_v1'
}

defineExpose({
  canSave,
  lossyWriteBlocked,
  mappingSaveState,
  mappingDocument,
  mappingPolicy,
  compatibility,
  syncDocumentToLegacy,
  openDialog,
})
</script>

<style scoped>
.warehouse-sink-config { min-width: 0 }
.sink-onboarding-body {
  display: flex;
  flex: 1 1 auto;
  justify-content: center;
  align-items: flex-start;
  padding: var(--spacing-6);
  box-sizing: border-box;
}
.sink-onboarding-panel {
  width: 100%;
  padding: var(--spacing-7) var(--spacing-8) var(--spacing-8);
  box-sizing: border-box;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  background: var(--color-surface-card);
  box-shadow: var(--shadow-card);
}
.panel-header h2 {
  margin: 0;
  color: var(--color-text-primary);
  font-size: var(--font-size-xl);
  font-weight: 600;
  line-height: var(--line-height-tight);
}
.panel-header p {
  margin: var(--spacing-2) 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-md);
  line-height: var(--line-height-base);
}
.panel-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-5);
  margin-top: var(--spacing-6);
}
.panel-body--mapping { gap: var(--spacing-4) }
.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-5) var(--spacing-6);
}
.field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  min-width: 0;
}
.field--wide { grid-column: 1 / -1 }
.field :deep(.el-select) { width: 100% }
.field-label {
  color: var(--color-text-primary);
  font-size: var(--font-size-md);
  font-weight: 600;
  line-height: 22px;
}
.required {
  margin-left: var(--spacing-1);
  color: var(--color-text-danger-strong);
  font-style: normal;
}
.field-hint {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.6;
}
.tag-list { display: flex; flex-wrap: wrap; gap: var(--spacing-2); align-items: center; min-height: var(--control-height) }
.upstream-banner {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  border: 1px solid var(--performance-tag-blue-background);
  border-radius: var(--radius-md);
  background: var(--performance-notice-info-background);
  color: var(--performance-text-secondary);
  font-size: var(--font-size-md);
  line-height: 22px;
}
.component-v1-hint {
  padding: var(--spacing-2) var(--spacing-3);
  border-radius: var(--radius-md);
  background: var(--performance-tag-blue-background);
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
  line-height: 1.6;
}
.panel-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  flex-wrap: wrap;
}
.validation-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-2);
  align-items: center;
  padding: var(--spacing-2) var(--spacing-3);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  background: var(--color-surface-card);
}
.validation-row .el-input,
.validation-row .el-select { flex: 1; min-width: 140px }
.lossy-write-blocked { margin-bottom: var(--spacing-2) }
@media (max-width: 900px) {
  .field-grid { grid-template-columns: minmax(0, 1fr) }
  .sink-onboarding-body { padding: var(--spacing-3) }
  .sink-onboarding-panel { padding: var(--spacing-5) }
}
@media (max-width: 768px) { .validation-row > * { flex: 1 1 100% } }
</style>
