<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, Top, Bottom, Refresh, VideoPlay, Upload, ArrowRight, Lock } from '@element-plus/icons-vue'
import {
  listAssets, listAssetColumns,
  listStandardizationRules, createStandardizationRule, updateStandardizationRule, deleteStandardizationRule,
  listStandardizationTemplates, createStandardizationTemplate, loadTemplateToAsset, previewStandardization,
  executeStandardization,
  STANDARDIZATION_RULE_TYPES, STANDARDIZATION_RULE_LABELS,
  type Asset,
} from '@/api/warehouse'
import OdsDwdAutomationPanel from '@/components/warehouse/OdsDwdAutomationPanel.vue'
import MappingWorkspace from '@/components/mapping/MappingWorkspace.vue'
import {
  RULE_LABELS,
  RULE_TYPES,
  createEmptyDocument,
  type MappingDocument,
  type MappingRule,
  type MappingRuleType,
  type MappingCallerPolicy,
} from '@/api/mapping'

const userStore = useUserStore()
const automationPanelRef = ref<InstanceType<typeof OdsDwdAutomationPanel> | null>(null)

// ===== 选表 =====
const tables = ref<Asset[]>([])
const referenceDwdAssets = ref<Asset[]>([])
const selectedTable = ref('')
const targetTableName = ref('')
const derivedTargetTable = computed(() => {
  if (!selectedTable.value) return ''
  const name = selectedTable.value
  for (const prefix of ['ods_', 'raw_', 'src_']) {
    if (name.toLowerCase().startsWith(prefix)) return 'dwd_' + name.slice(prefix.length)
  }
  return 'dwd_' + name
})
const tableFields = ref<{ column_code: string; column_label: string; data_type: string }[]>([])
const mappingWorkspaceRef = ref<{ resetDirty: () => void; focusRule: (ruleId: string) => Promise<boolean> } | null>(null)
const transformationWorkspaceRef = ref<{ resetDirty: () => void; focusRule: (ruleId: string) => Promise<boolean> } | null>(null)
const mappingDialogVisible = ref(false)
const transformationDialogVisible = ref(false)
const mappingDirty = ref(false)
const legacyDirty = ref(false)

const PUBLIC_RULE_TYPES = RULE_TYPES
const MAPPING_RULE_TYPES: MappingRuleType[] = ['field', 'value_map', 'reference_lookup', 'identity_with_overrides']
const TRANSFORMATION_RULE_TYPES: MappingRuleType[] = RULE_TYPES.filter((ruleType) => !MAPPING_RULE_TYPES.includes(ruleType))
const TOP_TRANSFORMATION_RULE_TYPES: MappingRuleType[] = ['type_convert', 'format', 'split_merge']
const LEGACY_RULE_TYPES = STANDARDIZATION_RULE_TYPES.filter((rt) => !['rename', 'type_convert', 'value_map', 'split_merge', 'format_standardize', 'reference_lookup', 'identity_with_overrides'].includes(rt))
const mappingRuleTypeByStandard: Record<string, MappingRuleType> = {
  rename: 'field',
  type_convert: 'type_convert',
  value_map: 'value_map',
  split_merge: 'split_merge',
  format_standardize: 'format',
  reference_lookup: 'reference_lookup',
  identity_with_overrides: 'identity_with_overrides',
}
const standardRuleTypeByMapping: Record<string, string> = {
  field: 'rename',
  type_convert: 'type_convert',
  value_map: 'value_map',
  split_merge: 'split_merge',
  format: 'format_standardize',
  reference_lookup: 'reference_lookup',
  identity_with_overrides: 'identity_with_overrides',
}

function schemaHash(fields: typeof tableFields.value): string {
  let hash = 2166136261
  for (const char of JSON.stringify(fields.map((field) => [field.column_code, field.data_type]))) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

function toMappings(value: any): Record<string, string> {
  if (Array.isArray(value)) return Object.fromEntries(value.map((item) => [String(item.from ?? ''), String(item.to ?? '')]))
  return value && typeof value === 'object' ? { ...value } : {}
}

function standardStepToMappingRule(step: Step): MappingRule | null {
  const type = mappingRuleTypeByStandard[step.rule_type]
  if (!type) return null
  const config = { ...step.rule_config }
  if (type === 'field') config.mode = config.mode || 'rename'
  if (type === 'value_map') config.mappings = toMappings(config.mappings)
  if (type === 'reference_lookup') {
    const legacyRules = config.rules || []
    config.lookupConfigs = config.lookupConfigs || config.lookup_configs?.map((item: any, index: number) => ({
      id: item.id || `lookup_${index}`, priority: item.priority ?? (index + 1) * 10, referenceDatasetId: item.referenceDatasetId || item.reference_dataset_id || '', sourceField: item.sourceField || item.source_field || '', referenceMatchField: item.referenceMatchField || item.reference_match_field || '', referenceReturnField: item.referenceReturnField || item.reference_return_field || '', targetField: item.targetField || item.target_field || step.target_field || '', conditions: item.conditions || {},
    })) || legacyRules.map((item: any, index: number) => ({
      id: item.id || `lookup_${index}`, priority: item.priority ?? (index + 1) * 10, referenceDatasetId: config.lookup_table || '', sourceField: item.sourceField || item.source_field || item.src_field || '', referenceMatchField: item.referenceField || item.reference_field || config.value_col || 'value', referenceReturnField: config.result_col || '', targetField: config.target || step.target_field || '', conditions: item.conditions || (item.match_type ? { [config.type_col || 'field_type']: item.match_type } : {}),
    }))
    config.unmatched = config.unmatched || 'keep'
  }
  if (type === 'identity_with_overrides') {
    config.defaultBehavior = config.defaultBehavior || config.default_behavior || 'keep_source'
    config.unmatched = config.unmatched || 'keep'
    config.overrides = config.overrides || {}
  }
  if (type === 'type_convert') config.targetType = config.targetType || config.target_type || config.to_type || 'string'
  if (type === 'format') {
    config.formatType = config.formatType || config.format || config.format_type || 'trim'
    config.options = config.options || Object.fromEntries(Object.entries(config).filter(([key]) => !['format', 'format_type', 'on_error', 'output_enabled', 'output_label', 'output_description'].includes(key)))
    config.onError = config.onError || config.on_error || 'reject'
  }
  if (type === 'split_merge') {
    config.action = config.action || 'merge'
    config.delimiter = config.delimiter ?? config.separator ?? ''
    config.nullBehavior = config.nullBehavior || config.null_behavior || 'keep_null'
  }
  return {
    id: step.id ? `standard_${step.id}` : config.__mappingRuleId || `draft_${step.display_order}_${step.rule_type}`,
    type,
    enabled: step.enabled,
    displayOrder: Math.max(0, step.display_order - 1),
    sourceFields: step.rule_config.source_fields || step.rule_config.sources || (step.source_field ? [step.source_field] : []),
    targetFields: step.rule_config.target_fields || (step.target_field ? [step.target_field] : []),
    config,
  } as MappingRule
}

function mappingRuleToStandardStep(rule: MappingRule): Step {
  const config = { ...(rule.config as Record<string, any>) }
  if (!rule.id.startsWith('standard_')) config.__mappingRuleId = rule.id
  if (rule.type === 'value_map') config.mappings = toMappings(config.mappings)
  if (rule.type === 'reference_lookup') {
    const lookupConfigs = config.lookupConfigs || []
    config.lookup_configs = lookupConfigs.map((item: any) => ({ id: item.id, priority: item.priority, reference_dataset_id: item.referenceDatasetId, source_field: item.sourceField, reference_match_field: item.referenceMatchField, reference_return_field: item.referenceReturnField, target_field: item.targetField, conditions: item.conditions || {} }))
    const first = lookupConfigs[0]
    if (first && lookupConfigs.every((item: any) => item.referenceDatasetId === first.referenceDatasetId && item.referenceReturnField === first.referenceReturnField)) { config.lookup_table = first.referenceDatasetId; config.target = first.targetField; config.result_col = first.referenceReturnField; config.rules = lookupConfigs.map((item: any) => ({ id: item.id, priority: item.priority, source_field: item.sourceField, reference_field: item.referenceMatchField, conditions: item.conditions || {} })) }
    delete config.lookupConfigs; delete config.referenceDatasetId; delete config.outputMap; delete config.matchRules
  }
  if (rule.type === 'identity_with_overrides') {
    config.default_behavior = config.defaultBehavior || 'keep_source'
    delete config.defaultBehavior
  }
  if (rule.type === 'type_convert') { config.target_type = config.targetType; delete config.targetType }
  if (rule.type === 'format') {
    if (config.formatType === 'unit_convert') {
      config.multiplier = config.options?.multiplier ?? 1
      config.decimal_places = config.options?.decimal_places ?? 2
    } else {
      config.format = config.formatType
      Object.assign(config, config.options || {})
    }
    delete config.formatType; delete config.options; delete config.onError
  }
  if (rule.type === 'split_merge') {
    if (config.action === 'merge') {
      config.sources = rule.sourceFields
      config.delimiter = config.delimiter || ''
    } else {
      config.separator = config.delimiter
      config.target_fields = rule.targetFields
      delete config.delimiter
    }
    delete config.nullBehavior
  }
  const id = rule.id.startsWith('standard_') ? Number(rule.id.slice('standard_'.length)) : undefined
  const ruleType = standardRuleTypeByMapping[rule.type]
  if (!ruleType) throw new Error(`不支持的公共规则类型: ${rule.type}`)
  return {
    id: Number.isFinite(id) ? id : undefined,
    rule_type: ruleType,
    source_field: rule.sourceFields[0] || '',
    target_field: rule.targetFields[0] || '',
    rule_config: config,
    enabled: rule.enabled,
    display_order: rule.displayOrder + 1,
    dirty: true,
  }
}

function buildMappingDocument(): MappingDocument {
  const document = createEmptyDocument(selectedTable.value, `${selectedTable.value} ODS→DWD 映射`)
  const hash = schemaHash(tableFields.value)
  document.ruleSet.sourceAsset = selectedTable.value
  document.ruleSet.targetAsset = targetTableName.value.trim() || derivedTargetTable.value
  document.ruleSet.sourceSchemaHash = hash
  document.ruleSet.targetSchemaHash = hash
  document.ruleSet.rules = steps.value.map(standardStepToMappingRule).filter((rule): rule is MappingRule => !!rule)
  return document
}

const mappingDocument = ref<MappingDocument>(createEmptyDocument())
const mappingTargetFields = computed(() => {
  const fields = tableFields.value.map((field) => ({ code: field.column_code, label: field.column_label || field.column_code, type: field.data_type }))
  const known = new Set(fields.map((field) => field.code))
  for (const step of steps.value) {
    for (const code of [step.target_field, ...(step.rule_config.target_fields || [])]) {
      if (code && !known.has(code)) { fields.push({ code, label: code, type: '' }); known.add(code) }
    }
  }
  return fields
})
const mappingPolicy = computed<MappingCallerPolicy>(() => {
  const sourceFieldIds = tableFields.value.map((field) => field.column_code)
  const targetFieldIds = mappingTargetFields.value.map((field) => field.code)
  const hash = schemaHash(tableFields.value)
  return {
    caller: 'warehouse',
    allowedRuleTypes: PUBLIC_RULE_TYPES,
    source: { assetId: selectedTable.value || null, schemaHash: hash, allowedFieldIds: sourceFieldIds },
    target: { assetId: targetTableName.value.trim() || derivedTargetTable.value || null, schemaHash: hash, allowedFieldIds: targetFieldIds, readonlyFieldIds: [], protectedKeyFieldIds: [] },
    referenceLookup: {
      allowedDatasetIds: referenceDwdAssets.value.map((asset) => asset.table_name).filter((tableName) => tableName !== (targetTableName.value.trim() || derivedTargetTable.value)),
      allowedFieldIds: [], datasetLabels: Object.fromEntries(referenceDwdAssets.value.map((asset) => [asset.table_name, asset.table_label || asset.table_name])), maxRules: 20,
    },
    effects: { allowPreview: true, allowSave: true, allowPublish: false, allowExecute: true, allowRebuild: false },
    legacy: { sourceFormat: 'standardization_rules', allowLegacyRead: true, allowLegacyWrite: true, allowMigration: true },
    metadata: { policyVersion: 1, permissionScope: 'warehouse.modeling', issuedAt: new Date().toISOString() },
  }
})
const mappingOnlyPolicy = computed<MappingCallerPolicy>(() => ({
  ...mappingPolicy.value,
  allowedRuleTypes: MAPPING_RULE_TYPES,
}))
const transformationPolicy = computed<MappingCallerPolicy>(() => ({
  ...mappingPolicy.value,
  allowedRuleTypes: TRANSFORMATION_RULE_TYPES,
}))
const mappingFields = computed(() => tableFields.value.map((field) => ({ code: field.column_code, label: field.column_label || field.column_code, type: field.data_type })))

function refreshMappingDocument() { mappingDocument.value = buildMappingDocument() }

function syncMappingToSteps(document: MappingDocument) {
  const publicSteps = document.ruleSet.rules
  const publicIndexes = steps.value.map((step, index) => mappingRuleTypeByStandard[step.rule_type] ? index : -1).filter((index) => index >= 0)
  const replacements = publicSteps.map(mappingRuleToStandardStep)
  const result = [...steps.value]
  publicIndexes.forEach((index, slot) => { result[index] = replacements[slot] })
  if (replacements.length > publicIndexes.length) result.push(...replacements.slice(publicIndexes.length))
  if (replacements.length < publicIndexes.length) {
    const remove = new Set(publicIndexes.slice(replacements.length))
    steps.value = result.filter((_step, index) => !remove.has(index))
  } else {
    steps.value = result
  }
  steps.value.forEach((step, index) => { step.display_order = index + 1; step.dirty = true })
}

function isLegacyRule(ruleType: string) { return LEGACY_RULE_TYPES.includes(ruleType as any) }
async function focusPublicRule(index: number) {
  activePublicStepIndex.value = index
  const step = steps.value[index]
  const rule = standardStepToMappingRule(step)
  const publicRule = rule && mappingDocument.value.ruleSet.rules.find((item) => item.id === rule.id)
  if (!publicRule) { ElMessage.warning('未能定位该规则的统一编辑器，请刷新后重试'); return }
  const isMappingRule = MAPPING_RULE_TYPES.includes(publicRule.type)
  if (isMappingRule) mappingDialogVisible.value = true
  else transformationDialogVisible.value = true
  await nextTick()
  const workspace = isMappingRule ? mappingWorkspaceRef.value : transformationWorkspaceRef.value
  const focused = await workspace?.focusRule(publicRule.id)
  if (!focused) ElMessage.warning('未能定位该规则的统一编辑器，请刷新后重试')
}

function handleStepClick(index: number) {
  const step = steps.value[index]
  if (isLegacyRule(step.rule_type)) {
    editingIndex.value === index ? collapseStep() : expandStep(index)
  } else {
    focusPublicRule(index)
  }
}

function onMappingDirty(value: boolean) {
  mappingDirty.value = value
  if (value) syncMappingToSteps(mappingDocument.value)
  dirty.value = mappingDirty.value || legacyDirty.value
}

async function loadTables() {
  try { const res = await listAssets({ warehouse_layer: 'ODS', page_size: 200 }); tables.value = res.items } catch { tables.value = [] }
  try { const res = await listAssets({ warehouse_layer: 'DWD', page_size: 200 }); referenceDwdAssets.value = res.items } catch { referenceDwdAssets.value = [] }
}

async function onTableChange(tableName: string) {
  if (!tableName) { tableFields.value = []; return }
  try {
    const res = await listAssetColumns(tableName)
    tableFields.value = res.columns.map((c: any) => ({ column_code: c.column_code, column_label: c.column_label, data_type: c.data_type || '' }))
  } catch { tableFields.value = [] }
  await loadRules()
}

// ===== 步骤流 =====
interface Step {
  id?: number; rule_type: string; source_field: string; target_field: string
  rule_config: Record<string, any>; enabled: boolean; display_order: number; dirty?: boolean
}
const steps = ref<Step[]>([])
const dirty = ref(false)
const activePublicStepIndex = ref<number | null>(null)
const DEFAULT_PUBLIC_STEP_NAMES: Record<MappingRuleType, string> = {
  field: '\u5b57\u6bb5\u6620\u5c04',
  value_map: '\u679a\u4e3e/\u503c\u6620\u5c04',
  reference_lookup: '\u53c2\u8003 Lookup',
  identity_with_overrides: '\u9ed8\u8ba4\u81ea\u6620\u5c04+\u4f8b\u5916',
  type_convert: '\u7c7b\u578b\u8f6c\u6362',
  format: '\u683c\u5f0f\u8f6c\u6362',
  split_merge: '\u62c6\u5206/\u5408\u5e76',
}
const NODE_NAME_LABEL = '\u8282\u70b9\u540d\u79f0'
const NODE_NAME_PLACEHOLDER = '\u8bf7\u8f93\u5165\u6d41\u7a0b\u8282\u70b9\u540d\u79f0'

function defaultStepName(step: Step): string {
  const mappingRuleType = mappingRuleTypeByStandard[step.rule_type]
  return (mappingRuleType && DEFAULT_PUBLIC_STEP_NAMES[mappingRuleType]) || STANDARDIZATION_RULE_LABELS[step.rule_type] || step.rule_type
}

const activePublicStepName = computed({
  get: () => {
    const index = activePublicStepIndex.value
    const step = index === null ? null : steps.value[index]
    return step?.rule_config.display_name || (step ? defaultStepName(step) : '')
  },
  set: (value: string) => {
    const index = activePublicStepIndex.value
    const step = index === null ? null : steps.value[index]
    if (!step) return

    const displayName = value.trim()
    if (displayName) step.rule_config.display_name = displayName
    else delete step.rule_config.display_name

    const rule = standardStepToMappingRule(step)
    const documentRule = rule && mappingDocument.value.ruleSet.rules.find((item) => item.id === rule.id)
    if (documentRule) {
      const documentConfig = { ...documentRule.config } as Record<string, unknown>
      if (displayName) documentConfig.display_name = displayName
      else delete documentConfig.display_name
      documentRule.config = documentConfig as typeof documentRule.config
    }

    step.dirty = true
    mappingDirty.value = true
    dirty.value = true
  },
})

async function loadRules() {
  if (!selectedTable.value) return
  try {
    const res = await listStandardizationRules({ asset_code: selectedTable.value, page_size: 200 })
    steps.value = res.items.map(r => ({ id: r.id, rule_type: r.rule_type, source_field: r.source_field, target_field: r.target_field, rule_config: r.rule_config || {}, enabled: r.enabled, display_order: r.display_order })).sort((a, b) => a.display_order - b.display_order)
    legacyDirty.value = false
    mappingDirty.value = false
    dirty.value = false
    activePublicStepIndex.value = null
    refreshMappingDocument()
    mappingWorkspaceRef.value?.resetDirty()
    transformationWorkspaceRef.value?.resetDirty()
  } catch { steps.value = [] }
}

const showAddMenu = ref(false)
function openMappingDialog() {
  if (!selectedTable.value) return
  activePublicStepIndex.value = null
  mappingDialogVisible.value = true
  showAddMenu.value = false
}
function addStep(ruleType: string) {
  steps.value.push({ rule_type: ruleType, source_field: '', target_field: '', rule_config: { output_enabled: true }, enabled: true, display_order: steps.value.length + 1, dirty: true })
  const index = steps.value.length - 1
  if (isLegacyRule(ruleType)) expandStep(index)
  else {
    refreshMappingDocument()
    void focusPublicRule(index)
  }
  legacyDirty.value = isLegacyRule(ruleType) || legacyDirty.value
  mappingDirty.value = !isLegacyRule(ruleType) || mappingDirty.value
  dirty.value = true
  showAddMenu.value = false
}
function removeStep(index: number) {
  const removedPublicRule = !!mappingRuleTypeByStandard[steps.value[index].rule_type]
  steps.value.splice(index, 1)
  steps.value.forEach((s, i) => { s.display_order = i + 1; s.dirty = true })
  if (removedPublicRule) { mappingDirty.value = true; refreshMappingDocument() }
  else legacyDirty.value = true
  dirty.value = true
}
function moveStep(index: number, dir: -1 | 1) {
  const target = index + dir
  if (target < 0 || target >= steps.value.length) return
  const tmp = steps.value[target]; steps.value[target] = steps.value[index]; steps.value[index] = tmp
  steps.value.forEach((s, i) => { s.display_order = i + 1; s.dirty = true })
  if (mappingRuleTypeByStandard[steps.value[index].rule_type] || mappingRuleTypeByStandard[steps.value[target].rule_type]) {
    mappingDirty.value = true; refreshMappingDocument()
  } else legacyDirty.value = true
  dirty.value = true
}

const editingIndex = ref(-1)
function expandStep(index: number) { editingIndex.value = index }
function collapseStep() { editingIndex.value = -1 }
const editingStep = computed(() => editingIndex.value >= 0 ? steps.value[editingIndex.value] : null)

function onStepFieldChange() {
  legacyDirty.value = true
  dirty.value = true
  if (editingIndex.value >= 0) steps.value[editingIndex.value].dirty = true
}
function addMapRow() {
  const cfg = steps.value[editingIndex.value].rule_config; if (!cfg.mappings) cfg.mappings = []
  cfg.mappings.push({ from: '', to: '' }); onStepFieldChange()
}
function removeMapRow(rowIdx: number) {
  steps.value[editingIndex.value].rule_config.mappings.splice(rowIdx, 1); onStepFieldChange()
}
function addSplitField() {
  const cfg = steps.value[editingIndex.value].rule_config; if (!cfg.target_fields) cfg.target_fields = []
  cfg.target_fields.push(''); onStepFieldChange()
}
function removeSplitField(idx: number) {
  steps.value[editingIndex.value].rule_config.target_fields.splice(idx, 1); onStepFieldChange()
}

// ===== 保存 =====
const saving = ref(false)
async function doSave() {
  if (!selectedTable.value) { ElMessage.warning('请先选择来源表'); return }
  if (mappingDirty.value) syncMappingToSteps(mappingDocument.value)
  saving.value = true
  try {
    const existing = await listStandardizationRules({ asset_code: selectedTable.value, page_size: 200 })
    for (const step of steps.value) {
      if (step.id) {
        await updateStandardizationRule(step.id, { rule_config: step.rule_config, enabled: step.enabled, display_order: step.display_order } as any)
      } else {
        const created = await createStandardizationRule({ asset_type: 'table', asset_code: selectedTable.value, rule_type: step.rule_type, source_field: step.source_field, target_field: step.target_field, rule_config: step.rule_config, enabled: step.enabled, display_order: step.display_order } as any)
        step.id = created.id
      }
    }
    const currentIds = new Set(steps.value.filter(s => s.id).map(s => s.id!))
    for (const rule of existing.items) { if (!currentIds.has(rule.id)) await deleteStandardizationRule(rule.id) }
    dirty.value = false; legacyDirty.value = false; mappingDirty.value = false; steps.value.forEach(s => s.dirty = false)
    mappingWorkspaceRef.value?.resetDirty()
    transformationWorkspaceRef.value?.resetDirty()
    ElMessage.success('规则已保存'); await loadRules()
    automationPanelRef.value?.refreshDetectedMode()
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '保存失败') } finally { saving.value = false }
}

// ===== 预览 =====
const previewLoading = ref(false)
const previewData = ref<{ columns: string[]; items: any[]; preview_items: any[] } | null>(null)
const previewMode = ref<'detail' | 'structure'>('detail')
const previewDebounce = ref<ReturnType<typeof setTimeout> | null>(null)
async function doPreview() {
  if (!selectedTable.value || steps.value.length === 0) return
  previewLoading.value = true
  try {
    const ruleIds = steps.value.filter(s => s.id).map(s => s.id!)
    const inlineRules = steps.value.filter(s => !s.id).map(s => ({ rule_type: s.rule_type, source_field: s.source_field, target_field: s.target_field, rule_config: s.rule_config, display_order: s.display_order }))
    previewData.value = await previewStandardization({ asset_code: selectedTable.value, rule_ids: ruleIds, inline_rules: inlineRules, sample_size: 20 })
  } catch { previewData.value = null } finally { previewLoading.value = false }
}
function schedulePreview() { if (previewDebounce.value) clearTimeout(previewDebounce.value); previewDebounce.value = setTimeout(doPreview, 500) }

// ===== 模板 =====
const templateVisible = ref(false); const templates = ref<any[]>([]); const templateLoading = ref(false)
async function loadTemplates() { templateLoading.value = true; try { const res = await listStandardizationTemplates(); templates.value = res.items } catch { templates.value = [] } finally { templateLoading.value = false }; templateVisible.value = true }
async function applyTemplate(tpl: any) {
  try { await ElMessageBox.confirm(`模板"${tpl.name}"包含 ${tpl.template_rules?.length || 0} 条规则，将追加到当前步骤流末尾。`, '加载模板', { type: 'info' }); await loadTemplateToAsset(tpl.id, selectedTable.value, 'table', 'skip'); ElMessage.success('模板已加载'); templateVisible.value = false; await loadRules() } catch { /* cancel */ }
}

// 保存为模板
const saveTplVisible = ref(false); const saveTplForm = ref({ name: '', business_object: '' }); const saveTplSaving = ref(false)
function openSaveTemplate() { saveTplForm.value = { name: selectedTable.value + '_模板', business_object: '' }; saveTplVisible.value = true }
async function doSaveTemplate() {
  if (!saveTplForm.value.name.trim()) { ElMessage.warning('请输入模板名称'); return }
  saveTplSaving.value = true
  try {
    const tplRules = steps.value.map(s => ({ rule_type: s.rule_type, source_field: s.source_field, target_field: s.target_field, rule_config: s.rule_config, display_order: s.display_order }))
    await createStandardizationTemplate({ name: saveTplForm.value.name.trim(), business_object: saveTplForm.value.business_object.trim() || selectedTable.value, template_rules: tplRules } as any)
    ElMessage.success('模板已保存'); saveTplVisible.value = false
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '保存模板失败') }
  finally { saveTplSaving.value = false }
}

// ===== 执行 =====
const executing = ref(false); const execResult = ref<{ success: number; failed: number; errors: any[] } | null>(null)
async function doExecute() {
  if (!selectedTable.value) return
  const target = targetTableName.value.trim() || derivedTargetTable.value
  try { await ElMessageBox.confirm(`将对表"${selectedTable.value}"全量执行规则并写入"${target}"。目标表已存在时将被重建。确定？`, '确认执行', { type: 'warning' }) } catch { return }
  executing.value = true; execResult.value = null
  try { if (dirty.value) await doSave(); const res = await executeStandardization(selectedTable.value, target || undefined); execResult.value = { success: res.success, failed: res.failed, errors: res.errors || [] }; if (res.failed === 0) ElMessage.success(`执行完成：共 ${res.total} 行 → ${res.target_table}，DWD 数据集字段已同步`); else ElMessage.warning(`执行完成：成功 ${res.success}，失败 ${res.failed}`) } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '执行失败') } finally { executing.value = false }
}

// ===== 数据预览 =====
const previewItems = computed(() => previewData.value?.preview_items || previewData.value?.items || [])
const previewColumns = computed(() => { if (previewData.value?.columns) return previewData.value.columns; if (previewItems.value.length > 0) return Object.keys(previewItems.value[0]); return [] })

function stepSummary(s: Step): string {
  const from = s.source_field || '?'; const to = s.target_field || '?'; const cfg = s.rule_config
  switch (s.rule_type) {
    case 'rename': return `${from} → ${to}`
    case 'type_convert': return `${from}: ${cfg.from_type || '?'} → ${cfg.to_type || '?'}`
    case 'value_map': return `${from}: ${cfg.mappings?.length || 0} 条映射`
    case 'unit_convert': return `${from}: ${cfg.from_unit || '?'}→${cfg.to_unit || '?'}`
    case 'split_merge': return `${from} → ${cfg.target_fields?.length || 0} 字段`
    case 'deduplicate': return `${cfg.by?.join(',') || from}`
    case 'null_handling': return `${to || from}: ${cfg.strategy || '?'}`
    case 'format_standardize': return `${from}: ${cfg.format_type || '?'}`
    default: return `${from} → ${to}`
  }
}
const ruleTypeIcon: Record<string, string> = { rename: 'Aa', type_convert: '#', value_map: '{ }', unit_convert: '≍', split_merge: '⤨', deduplicate: '⊚', null_handling: '∅', format_standardize: '✦' }

watch(dirty, (v) => { if (v) window.addEventListener('beforeunload', warnUnsaved); else window.removeEventListener('beforeunload', warnUnsaved) })
watch([targetTableName, derivedTargetTable], () => {
  mappingDocument.value.ruleSet.targetAsset = targetTableName.value.trim() || derivedTargetTable.value
})
function warnUnsaved(e: BeforeUnloadEvent) { e.preventDefault(); e.returnValue = '' }
const route = useRoute()
onMounted(async () => {
  await loadTables()
  const tableFromQuery = route.query.table as string
  if (tableFromQuery && tables.value.some(t => t.table_name === tableFromQuery)) {
    selectedTable.value = tableFromQuery
    await onTableChange(tableFromQuery)
  }
})
</script>

<template>
  <div class="recipe-page">
    <!-- ===== Zone 1: 顶部工具栏 ===== -->
    <header class="recipe-header">
      <div class="header-top">
        <div class="header-left">
          <h1 class="page-title">数据清洗</h1>
          <div class="source-selector">
            <label>来源表</label>
            <el-select v-model="selectedTable" filterable placeholder="选择 ODS 表" size="default" @change="onTableChange">
              <el-option v-for="t in tables" :key="t.table_name" :label="`${t.table_label || t.table_name}`" :value="t.table_name">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <span>{{ t.table_label || t.table_name }}</span>
                  <el-tag size="small" type="info" style="margin-left:8px">{{ t.warehouse_layer }}</el-tag>
                </div>
              </el-option>
            </el-select>
          </div>
          <div class="target-input" v-if="userStore.hasOp('warehouse.cleaning', 'U')">
            <label>目标表</label>
            <el-input v-model="targetTableName" :placeholder="derivedTargetTable" size="default" clearable />
            <el-button v-if="targetTableName && targetTableName !== derivedTargetTable" text size="small" type="warning" @click="targetTableName = ''">恢复默认</el-button>
          </div>
          <div class="target-readonly" v-else-if="selectedTable">
            <label>将发布为 DWD 标准表</label>
            <span class="derived-name">{{ derivedTargetTable }}</span>
            <el-icon><Lock /></el-icon>
          </div>
        </div>
        <div class="header-actions">
          <el-button v-if="dirty" type="warning" size="default" @click="doSave" :loading="saving" plain>保存 *</el-button>
          <el-button @click="loadTemplates" :disabled="!selectedTable" size="default">
            <el-icon style="margin-right:4px"><Upload /></el-icon>从模板加载
          </el-button>
          <el-button @click="openSaveTemplate" :disabled="steps.length === 0" size="default" type="primary" plain>
            保存为模板
          </el-button>
        </div>
      </div>
      <div class="toolbar">
        <div class="toolbar-group toolbar-group-primary">
          <button class="tool-btn" :disabled="!selectedTable" @click="openMappingDialog">
            <span class="tool-btn-icon">⇄</span>
            <span class="tool-btn-label">映射</span>
          </button>
          <button
            v-for="rt in TOP_TRANSFORMATION_RULE_TYPES"
            :key="rt"
            class="tool-btn"
            :disabled="!selectedTable"
            @click="addStep(standardRuleTypeByMapping[rt])"
          >
            <span class="tool-btn-icon">{{ ruleTypeIcon[standardRuleTypeByMapping[rt]] }}</span>
            <span class="tool-btn-label">{{ RULE_LABELS[rt] }}</span>
          </button>
        </div>
        <span class="toolbar-divider" aria-hidden="true"></span>
        <div class="toolbar-group">
          <button v-for="rt in LEGACY_RULE_TYPES" :key="rt" class="tool-btn" :disabled="!selectedTable" @click="addStep(rt)">
            <span class="tool-btn-icon">{{ ruleTypeIcon[rt] }}</span>
            <span class="tool-btn-label">{{ STANDARDIZATION_RULE_LABELS[rt] }}</span>
          </button>
        </div>
      </div>
    </header>

    <!-- ===== 主体：Zone 2 预览 + Zone 3 步骤流 ===== -->
    <div class="recipe-body" v-if="selectedTable">
      <!-- Zone 2: 中间数据预览 -->
      <section class="preview-zone">
        <div class="preview-toolbar">
          <div class="view-switch">
            <button :class="{ active: previewMode === 'detail' }" @click="previewMode = 'detail'; doPreview()">明细视图</button>
            <button :class="{ active: previewMode === 'structure' }" @click="previewMode = 'structure'">表结构</button>
          </div>
          <button class="refresh-btn" :disabled="steps.length === 0" @click="doPreview">
            <Refresh /> 刷新
          </button>
        </div>

        <!-- 明细 -->
        <div v-if="previewMode === 'detail'" class="preview-table-wrap" v-loading="previewLoading">
          <table v-if="previewColumns.length && previewItems.length" class="data-table">
            <thead><tr><th v-for="c in previewColumns" :key="c">{{ c }}</th></tr></thead>
            <tbody>
              <tr v-for="(row, i) in previewItems" :key="i" :class="{ odd: i % 2 === 0 }">
                <td v-for="c in previewColumns" :key="c" :title="row[c]">{{ row[c] }}</td>
              </tr>
            </tbody>
          </table>
          <div v-else class="preview-empty">
            <p v-if="steps.length === 0">选择来源表并添加加工步骤后，点击刷新预览</p>
            <p v-else>暂无数据</p>
          </div>
        </div>

        <!-- 表结构 -->
        <div v-else class="preview-table-wrap">
          <el-table :data="tableFields" size="small" border>
            <el-table-column prop="column_code" label="字段名" width="160" />
            <el-table-column prop="column_label" label="中文名" width="140" />
            <el-table-column prop="data_type" label="类型" width="100" />
            <el-table-column label="来源"><template #default>{{ selectedTable }}</template></el-table-column>
          </el-table>
        </div>

        <!-- 执行结果 -->
        <div v-if="execResult" class="exec-result" :class="execResult.failed ? 'warn' : 'ok'">
          <span v-if="execResult.failed === 0">执行完成，共 {{ execResult.success }} 行</span>
          <span v-else>执行完成：成功 {{ execResult.success }} 行，失败 {{ execResult.failed }} 行</span>
        </div>

        <!-- 底部操作 -->
        <div class="bottom-actions">
          <el-button :loading="previewLoading" @click="doPreview" :disabled="steps.length === 0" size="default">预览采样</el-button>
          <el-button type="primary" :loading="saving" @click="doSave" size="default">保存</el-button>
          <el-button type="success" :icon="VideoPlay" :loading="executing" @click="doExecute" :disabled="steps.length === 0" size="default">执行</el-button>
        </div>
      </section>

      <!-- Zone 3: 右侧流程步骤流 -->
      <aside class="flow-zone">
        <div class="legacy-rule-heading">数仓专属规则</div>
        <h3 class="flow-title">完整加工流程</h3>

        <!-- 来源表节点（流程图顶部） -->
        <div class="flow-source-node">
          <div class="node-dot source"></div>
          <div class="node-card source">
            <div class="node-label">数据来源</div>
            <div class="node-name">{{ selectedTable }}</div>
            <div class="node-meta">{{ tableFields.length }} 个字段</div>
          </div>
        </div>

        <!-- 连接线 + 步骤节点 -->
        <div v-for="(step, i) in steps" :key="i" class="flow-step-group">
          <!-- 连接线 -->
          <div class="flow-connector">
            <div class="connector-line" :class="{ active: editingIndex === i }"></div>
            <div v-if="i === 0" class="connector-arrow"><ArrowRight /></div>
          </div>

          <!-- 步骤节点 -->
          <div class="flow-node" :class="{ expanded: editingIndex === i, dirty: step.dirty, public: !isLegacyRule(step.rule_type) }" @click="handleStepClick(i)">
            <div class="node-dot" :class="step.enabled ? 'active' : 'disabled'">{{ i + 1 }}</div>
            <div class="node-card">
              <div class="node-header">
                <span class="node-type-icon">{{ ruleTypeIcon[step.rule_type] }}</span>
                <span class="node-type-label">{{ step.rule_config.display_name || defaultStepName(step) }}</span>
                <span v-if="!step.enabled" class="node-disabled-tag">禁用</span>
              </div>
              <!-- 操作按钮（展开时） -->
              <div v-if="editingIndex === i && isLegacyRule(step.rule_type)" class="node-actions" @click.stop>
                <button :disabled="i === 0" @click="moveStep(i, -1)" title="上移"><Top /></button>
                <button :disabled="i === steps.length - 1" @click="moveStep(i, 1)" title="下移"><Bottom /></button>
                <button class="danger" @click="removeStep(i)" title="删除"><Delete /></button>
              </div>
            </div>
          </div>

          <!-- 配置面板（展开在节点下方） -->
          <div v-if="editingIndex === i && isLegacyRule(step.rule_type)" class="config-panel" @click.stop>
            <!-- 通用字段 -->
            <div class="config-row">
              <div class="config-field">
                <label>源字段</label>
                <el-select v-model="step.source_field" filterable placeholder="选择字段" size="small" @change="onStepFieldChange">
                  <el-option v-for="f in tableFields" :key="f.column_code" :label="`${f.column_label || f.column_code}`" :value="f.column_code" />
                </el-select>
              </div>
              <div class="config-field" v-if="step.rule_type !== 'deduplicate'">
                <label>目标字段</label>
                <el-input v-model="step.target_field" size="small" placeholder="目标字段名" @change="onStepFieldChange" />
              </div>
            </div>

            <!-- 类型转换 -->
            <div v-if="step.rule_type === 'type_convert'" class="config-row">
              <div class="config-field">
                <label>源类型</label>
                <el-select v-model="step.rule_config.from_type" size="small" @change="onStepFieldChange">
                  <el-option v-for="t in ['text','int','float','decimal','date','boolean']" :key="t" :value="t" />
                </el-select>
              </div>
              <div class="config-field">
                <label>目标类型</label>
                <el-select v-model="step.rule_config.to_type" size="small" @change="onStepFieldChange">
                  <el-option v-for="t in ['int','float','decimal','text','date','boolean']" :key="t" :value="t" />
                </el-select>
              </div>
            </div>

            <!-- 枚举映射 -->
            <div v-if="step.rule_type === 'value_map'" class="config-section">
              <label>映射关系</label>
              <div v-for="(m, mi) in (step.rule_config.mappings || [])" :key="mi" class="map-row">
                <el-input v-model="m.from" size="small" placeholder="原值" @change="onStepFieldChange" />
                <span class="map-arrow">→</span>
                <el-input v-model="m.to" size="small" placeholder="新值" @change="onStepFieldChange" />
                <button class="config-remove" @click="removeMapRow(mi)">×</button>
              </div>
              <el-button size="small" text type="primary" @click="addMapRow">+ 添加映射</el-button>
            </div>

            <!-- 单位转换 -->
            <div v-if="step.rule_type === 'unit_convert'" class="config-row">
              <div class="config-field"><label>原单位</label><el-input v-model="step.rule_config.from_unit" size="small" placeholder="如：元" @change="onStepFieldChange" /></div>
              <div class="config-field"><label>目标单位</label><el-input v-model="step.rule_config.to_unit" size="small" placeholder="如：万元" @change="onStepFieldChange" /></div>
              <div class="config-field"><label>系数</label><el-input-number v-model="step.rule_config.multiplier" size="small" :min="0.0001" :step="1" @change="onStepFieldChange" /></div>
            </div>

            <!-- 拆分合并 -->
            <div v-if="step.rule_type === 'split_merge'" class="config-section">
              <label>分隔符</label>
              <el-input v-model="step.rule_config.separator" size="small" placeholder="如：," style="width:120px" @change="onStepFieldChange" />
              <label style="margin-top:8px">目标字段</label>
              <div v-for="(tf, ti) in (step.rule_config.target_fields || [])" :key="ti" class="map-row">
                <el-input v-model="step.rule_config.target_fields[ti]" size="small" placeholder="字段名" @change="onStepFieldChange" />
                <button class="config-remove" @click="removeSplitField(ti)">×</button>
              </div>
              <el-button size="small" text type="primary" @click="addSplitField">+ 添加目标字段</el-button>
            </div>

            <!-- 去重 -->
            <div v-if="step.rule_type === 'deduplicate'" class="config-section">
              <label>去重依据</label>
              <el-select v-model="step.rule_config.by" multiple filterable placeholder="选择去重字段" size="small" @change="onStepFieldChange">
                <el-option v-for="f in tableFields" :key="f.column_code" :label="f.column_label || f.column_code" :value="f.column_code" />
              </el-select>
              <label style="margin-top:8px">保留策略</label>
              <el-select v-model="step.rule_config.keep" size="small" @change="onStepFieldChange">
                <el-option label="保留第一条" value="first" /><el-option label="保留最后一条" value="last" />
              </el-select>
            </div>

            <!-- 空值处理 -->
            <div v-if="step.rule_type === 'null_handling'" class="config-section">
              <label>处理策略</label>
              <el-select v-model="step.rule_config.strategy" size="small" @change="onStepFieldChange">
                <el-option label="填充默认值" value="fill_default" /><el-option label="标记问题行" value="mark" />
                <el-option label="跳过（保留空值）" value="skip" /><el-option label="使用上游值" value="use_upstream" />
              </el-select>
              <div v-if="step.rule_config.strategy === 'fill_default'" class="config-field" style="margin-top:8px">
                <label>默认值</label><el-input v-model="step.rule_config.default" size="small" placeholder="默认值" @change="onStepFieldChange" />
              </div>
            </div>

            <!-- 格式标准化 -->
            <div v-if="step.rule_type === 'format_standardize'" class="config-section">
              <label>标准化类型</label>
              <el-select v-model="step.rule_config.format_type" size="small" @change="onStepFieldChange">
                <el-option label="日期格式" value="date" /><el-option label="编码格式" value="code" />
                <el-option label="大小写" value="case" /><el-option label="去空格" value="trim" />
                <el-option label="字段长度" value="truncate" />
              </el-select>
              <div v-if="step.rule_config.format_type === 'date'" class="config-row" style="margin-top:8px">
                <div class="config-field"><label>源格式</label><el-input v-model="step.rule_config.from_format" size="small" placeholder="yyyyMMdd" @change="onStepFieldChange" /></div>
                <div class="config-field"><label>目标格式</label><el-input v-model="step.rule_config.to_format" size="small" placeholder="yyyy-MM-dd" @change="onStepFieldChange" /></div>
              </div>
              <div v-if="step.rule_config.format_type === 'case'" class="config-field" style="margin-top:8px">
                <el-select v-model="step.rule_config.case_type" size="small" @change="onStepFieldChange">
                  <el-option label="大写" value="upper" /><el-option label="小写" value="lower" />
                </el-select>
              </div>
              <div v-if="step.rule_config.format_type === 'truncate'" class="config-field" style="margin-top:8px">
                <label>最大长度</label><el-input-number v-model="step.rule_config.max_length" size="small" :min="1" :max="10000" @change="onStepFieldChange" />
              </div>
            </div>

            <!-- 启用/禁用 -->
            <div style="margin-top:10px; display:flex; gap:20px; flex-wrap:wrap; align-items:center">
              <el-switch v-model="step.enabled" size="small" active-text="启用" @change="onStepFieldChange" />
              <el-switch
                v-model="step.rule_config.output_enabled"
                size="small"
                active-text="输出到DWD"
                @change="onStepFieldChange"
              />
            </div>
            <!-- 输出字段元数据（P4-01） -->
            <div class="config-section" style="border-top:1px solid var(--el-border-color-lighter); padding-top:10px; margin-top:8px">
              <label style="font-weight:600; color:var(--el-color-primary)">DWD 输出字段定义</label>
              <div class="config-row" style="margin-top:6px">
                <div class="config-field">
                  <label>输出字段名</label>
                  <el-input v-model="step.target_field" size="small" placeholder="DWD 字段名" @change="onStepFieldChange" />
                </div>
                <div class="config-field">
                  <label>显示名称</label>
                  <el-input v-model="step.rule_config.output_label" size="small" placeholder="中文展示名" @change="onStepFieldChange" />
                </div>
              </div>
              <div class="config-field" style="margin-top:6px">
                <label>字段描述</label>
                <el-input v-model="step.rule_config.output_description" size="small" placeholder="字段口径说明" @change="onStepFieldChange" />
              </div>
            </div>
          </div>
        </div>

        <!-- 底部 + 添加步骤 -->
        <div class="flow-add-area">
          <div class="flow-connector"><div class="connector-line dashed"></div></div>
          <el-popover v-model:visible="showAddMenu" placement="bottom-start" :width="220" trigger="click">
            <template #reference>
              <button class="add-step-btn" :disabled="!selectedTable"><Plus /> 添加步骤</button>
            </template>
            <div class="add-step-menu">
              <button class="add-step-item" @click="openMappingDialog">
                <span class="add-step-icon">⇄</span>
                映射
              </button>
              <button v-for="rt in TRANSFORMATION_RULE_TYPES" :key="rt" class="add-step-item" @click="addStep(standardRuleTypeByMapping[rt])">
                <span class="add-step-icon">{{ ruleTypeIcon[standardRuleTypeByMapping[rt]] }}</span>
                {{ RULE_LABELS[rt] }}
              </button>
              <div class="add-step-divider"></div>
              <button v-for="rt in LEGACY_RULE_TYPES" :key="rt" class="add-step-item" @click="addStep(rt)">
                <span class="add-step-icon">{{ ruleTypeIcon[rt] }}</span>
                {{ STANDARDIZATION_RULE_LABELS[rt] }}
              </button>
            </div>
          </el-popover>
        </div>
      </aside>
    </div>

    <!-- Z0106 ODS→DWD 自动化配置面板 -->
    <OdsDwdAutomationPanel
      v-if="selectedTable"
      ref="automationPanelRef"
      :ods-table-name="selectedTable"
      :target-table-name="targetTableName || derivedTargetTable"
    />

    <!-- 空表 -->
    <div v-else class="recipe-empty">
      <div class="empty-illustration">📋</div>
      <h2>选择来源表开始</h2>
      <p>从已入仓的 ODS 表中选择一张表，开始构建数据加工配方</p>
    </div>

    <!-- 模板弹窗 -->
    <!-- 保存为模板弹窗 -->
    <el-dialog v-model="mappingDialogVisible" title="维护映射" width="92%" align-center :close-on-click-modal="false" class="mapping-dialog">
      <div v-if="activePublicStepIndex !== null" class="mapping-node-name">
        <label>{{ NODE_NAME_LABEL }}</label>
        <el-input v-model="activePublicStepName" maxlength="64" show-word-limit :placeholder="NODE_NAME_PLACEHOLDER" />
      </div>
      <MappingWorkspace
        ref="mappingWorkspaceRef"
        v-model="mappingDocument"
        :policy="mappingOnlyPolicy"
        :visible-rule-types="MAPPING_RULE_TYPES"
        :source-fields="mappingFields"
        :target-fields="mappingTargetFields"
        @dirty="onMappingDirty"
      />
    </el-dialog>

    <el-dialog v-model="transformationDialogVisible" title="维护转换规则" width="92%" align-center :close-on-click-modal="false" class="mapping-dialog">
      <div v-if="activePublicStepIndex !== null" class="mapping-node-name">
        <label>{{ NODE_NAME_LABEL }}</label>
        <el-input v-model="activePublicStepName" maxlength="64" show-word-limit :placeholder="NODE_NAME_PLACEHOLDER" />
      </div>
      <MappingWorkspace
        ref="transformationWorkspaceRef"
        v-model="mappingDocument"
        :policy="transformationPolicy"
        :visible-rule-types="TRANSFORMATION_RULE_TYPES"
        :source-fields="mappingFields"
        :target-fields="mappingTargetFields"
        @dirty="onMappingDirty"
      />
    </el-dialog>

    <el-dialog v-model="saveTplVisible" title="保存为模板" width="440px">
      <el-form label-width="80px" size="small">
        <el-form-item label="模板名称" required><el-input v-model="saveTplForm.name" placeholder="如：员工月薪标准化模板" maxlength="128" /></el-form-item>
        <el-form-item label="业务对象"><el-input v-model="saveTplForm.business_object" placeholder="如：员工表，留空则用来源表名" maxlength="64" /></el-form-item>
      </el-form>
      <div style="color:#909399;font-size:12px;margin-bottom:8px">当前 {{ steps.length }} 条规则将被保存为模板，后续可在其他表上加载复用。</div>
      <template #footer><el-button @click="saveTplVisible = false">取消</el-button><el-button type="primary" :loading="saveTplSaving" @click="doSaveTemplate">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="templateVisible" title="选择模板" width="500px">
      <el-table v-loading="templateLoading" :data="templates" size="small" border empty-text="暂无模板">
        <el-table-column prop="name" label="模板名称" min-width="140" />
        <el-table-column prop="business_object" label="业务对象" width="100" />
        <el-table-column label="规则数" width="70" align="center">
          <template #default="{ row }">{{ row.template_rules?.length || 0 }}</template>
        </el-table-column>
        <el-table-column label="版本" width="60" align="center" prop="version" />
        <el-table-column label="" width="80"><template #default="{ row }"><el-button text size="small" type="primary" @click="applyTemplate(row)">加载</el-button></template></el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ===== 页面基底 ===== */
.recipe-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f8f9fb;
}

/* ===== Zone 1: 顶部 ===== */
.recipe-header {
  padding: 20px 24px 0;
  flex-shrink: 0;
}
.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 24px;
}
.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #1a1a2e;
  margin: 0;
  letter-spacing: -0.3px;
}
.source-selector, .target-input, .target-readonly {
  display: flex;
  align-items: center;
  gap: 8px;
}
.source-selector label, .target-input label, .target-readonly label {
  font-size: 13px;
  color: #6b7280;
  white-space: nowrap;
}
.target-readonly .derived-name {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
  background: #f3f4f6;
  padding: 4px 10px;
  border-radius: 6px;
  font-family: 'SF Mono', 'Fira Code', monospace;
}
.source-selector :deep(.el-select) { width: 240px; }
.target-input :deep(.el-input) { width: 200px; }
.header-actions { display: flex; gap: 8px; }

/* 工具栏按钮 */
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px 16px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
}
.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  color: #374151;
  font-size: 13px;
  cursor: pointer;
  transition: all .15s;
  font-family: inherit;
}
.tool-btn:hover:not(:disabled) {
  border-color: #f59e0b;
  color: #d97706;
  background: #fffbeb;
}
.tool-btn:disabled { opacity: .4; cursor: not-allowed; }
.tool-btn-icon { font-size: 14px; font-weight: 700; color: #9ca3af; }
.tool-btn:hover:not(:disabled) .tool-btn-icon { color: #f59e0b; }
.tool-btn-label { white-space: nowrap; }

/* ===== 主体两栏 ===== */
.recipe-body {
  flex: 1;
  display: flex;
  gap: 0;
  min-height: 0;
  padding: 16px 24px 24px;
}

/* ===== Zone 2: 预览 ===== */
.preview-zone {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 16px;
  margin-right: 20px;
}
.preview-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.view-switch {
  display: flex;
  background: #f3f4f6;
  border-radius: 8px;
  padding: 3px;
}
.view-switch button {
  padding: 5px 14px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 13px;
  color: #6b7280;
  cursor: pointer;
  transition: all .15s;
  font-family: inherit;
}
.view-switch button.active {
  background: #fff;
  color: #1a1a2e;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0,0,0,.08);
}
.refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: #6b7280;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: all .15s;
}
.refresh-btn:hover:not(:disabled) { border-color: #f59e0b; color: #d97706; }
.refresh-btn:disabled { opacity: .4; cursor: not-allowed; }

.preview-table-wrap {
  flex: 1;
  overflow: auto;
  min-height: 200px;
}
.data-table {
  width: 100%;
  font-size: 12px;
  border-collapse: collapse;
}
.data-table th {
  position: sticky;
  top: 0;
  background: #f9fafb;
  padding: 8px 10px;
  text-align: left;
  font-weight: 600;
  color: #374151;
  border-bottom: 2px solid #e5e7eb;
  white-space: nowrap;
  font-size: 12px;
}
.data-table td {
  padding: 7px 10px;
  border-bottom: 1px solid #f3f4f6;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #4b5563;
}
.data-table tr.odd td { background: #fafbfc; }
.data-table tr:hover td { background: #fef3c7; }
.preview-empty { display: flex; align-items: center; justify-content: center; height: 200px; color: #9ca3af; font-size: 14px; }

.exec-result { padding: 10px 16px; border-radius: 8px; font-size: 13px; }
.exec-result.ok { background: #ecfdf5; color: #065f46; }
.exec-result.warn { background: #fffbeb; color: #92400e; }

.bottom-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 8px;
  border-top: 1px solid #f3f4f6;
}

/* ===== Zone 3: 流程侧栏 ===== */
.flow-zone {
  width: 340px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 0 4px;
}
.toolbar-group {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
}
.toolbar-divider {
  width: 1px;
  align-self: stretch;
  margin: 0 4px;
  background: #e5e7eb;
}
.add-step-divider {
  height: 1px;
  margin: 6px 0;
  background: #ebeef5;
}
.mapping-dialog :deep(.el-dialog) {
  max-width: 1440px;
  margin: 0 auto;
}
.mapping-dialog :deep(.el-dialog__body) {
  max-height: calc(100vh - 156px);
  overflow-y: auto;
  padding-top: 8px;
}
.mapping-node-name {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 14px;
  padding: 12px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fafbfc;
}
.mapping-node-name label {
  flex: 0 0 auto;
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}
.mapping-node-name :deep(.el-input) { flex: 1; }
.mapping-dialog :deep(.rule-list) {
  max-height: calc(100vh - 300px);
}
.legacy-rule-heading {
  margin: 14px 0 8px;
  font-size: 12px;
  font-weight: 700;
  color: #6b7280;
}
.flow-title {
  font-size: 14px;
  font-weight: 700;
  color: #1a1a2e;
  margin: 0 0 16px 0;
  padding-left: 40px;
}

/* 来源表节点 */
.flow-source-node {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  position: relative;
}
.node-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
  z-index: 1;
  transition: all .2s;
}
.node-dot.source { background: #f3f4f6; color: #6b7280; border: 2px solid #d1d5db; }
.node-dot.active { background: #f59e0b; color: #fff; border-color: #f59e0b; }
.node-dot.disabled { background: #f3f4f6; color: #9ca3af; border-color: #e5e7eb; }

.node-card {
  flex: 1;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px 14px;
  cursor: pointer;
  transition: all .15s;
}
.node-card.source { border-style: dashed; cursor: default; background: #fafbfc; }
.node-card:hover { border-color: #d1d5db; }
.node-card.source:hover { border-color: #e5e7eb; }
.node-label { font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 2px; }
.node-name { font-size: 14px; font-weight: 600; color: #1f2937; margin-bottom: 2px; }
.node-meta { font-size: 12px; color: #9ca3af; }

/* 连接线 */
.flow-step-group { position: relative; }
.flow-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-left: 14px;
  width: 28px;
}
.connector-line {
  width: 2px;
  height: 14px;
  background: #d1d5db;
  transition: background .2s;
}
.connector-line.active { background: #f59e0b; }
.connector-line.dashed { border-left: 2px dashed #d1d5db; height: 14px; background: none; }
.connector-arrow { color: #9ca3af; font-size: 10px; margin-top: -2px; }

/* 步骤节点 */
.flow-node {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  position: relative;
}
.flow-node.expanded .node-card { border-color: #f59e0b; background: #fffdf7; }
.flow-node.dirty .node-card { border-color: #fbbf24; }
.node-header { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
.node-type-icon { font-size: 21px; font-weight: 700; color: #d97706; line-height: 1; }
.node-type-label { font-size: 14px; font-weight: 600; color: #1f2937; }
.node-disabled-tag { font-size: 10px; padding: 2px 6px; border-radius: 4px; background: #f3f4f6; color: #9ca3af; margin-left: auto; }
.node-summary { font-size: 12px; color: #6b7280; padding-left: 27px; }
.node-actions {
  display: flex;
  gap: 2px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f3f4f6;
}
.node-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px; height: 28px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  color: #6b7280;
  cursor: pointer;
  font-size: 14px;
  transition: all .15s;
}
.node-actions button:hover:not(:disabled) { border-color: #f59e0b; color: #d97706; }
.node-actions button:disabled { opacity: .3; cursor: not-allowed; }
.node-actions button.danger:hover { border-color: #ef4444; color: #ef4444; background: #fef2f2; }

/* 配置面板 */
.config-panel {
  margin: 8px 0 8px 38px;
  padding: 14px;
  background: #fafbfc;
  border: 1px solid #fde68a;
  border-radius: 8px;
}
.config-row { display: flex; gap: 10px; margin-bottom: 8px; }
.config-field { flex: 1; }
.config-field label, .config-section label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: .3px;
  margin-bottom: 4px;
}
.config-field :deep(.el-select), .config-field :deep(.el-input) { width: 100%; }
.config-section { margin-bottom: 8px; }
.config-section :deep(.el-select) { width: 100%; }
.map-row { display: flex; gap: 4px; align-items: center; margin-bottom: 4px; }
.map-row :deep(.el-input) { flex: 1; }
.map-arrow { color: #9ca3af; font-size: 14px; flex-shrink: 0; }
.config-remove {
  width: 24px; height: 24px; border: none; background: transparent; color: #9ca3af;
  cursor: pointer; font-size: 16px; border-radius: 4px; display: flex; align-items: center; justify-content: center;
}
.config-remove:hover { color: #ef4444; background: #fef2f2; }

/* 添加步骤按钮区 */
.flow-add-area {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding-top: 4px;
}
.add-step-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 2px dashed #d1d5db;
  border-radius: 8px;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  transition: all .15s;
}
.add-step-btn:hover:not(:disabled) { border-color: #f59e0b; color: #d97706; }
.add-step-btn:disabled { opacity: .4; cursor: not-allowed; }

/* 添加步骤菜单 */
.add-step-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.add-step-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  font-family: inherit;
  width: 100%;
  text-align: left;
}
.add-step-item:hover { background: #fffbeb; color: #d97706; }
.add-step-icon { font-weight: 700; color: #f59e0b; width: 20px; text-align: center; }

/* ===== 空态 ===== */
.recipe-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #9ca3af;
}
.empty-illustration { font-size: 48px; }
.recipe-empty h2 { font-size: 18px; color: #6b7280; margin: 0; font-weight: 600; }
.recipe-empty p { font-size: 14px; margin: 0; }
</style>
