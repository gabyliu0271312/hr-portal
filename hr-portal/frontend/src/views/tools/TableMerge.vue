<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Plus, Delete, Upload, Download, MagicStick, Edit, ArrowLeft,
  CircleCheck, Warning, Document, Grid
} from '@element-plus/icons-vue'
import PermissionButton from '@/components/PermissionButton.vue'
import OutputFieldsEditor from '@/components/tools/OutputFieldsEditor.vue'
import {
  tableToolsApi,
  type TemplateOut,
  type TemplateDetail,
  type MergeResult,
  type MergeResultBatch,
  type MergeResultBatchRows,
  type AiDraft,
  type KeyMapping,
  type DwdRelation,
  type DwdField,
  type DwdRelationSource,
  type ResultSaveMode,
} from '@/api/tableTools'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
/** 改/删门禁:仅模板创建者本人或超级管理员(与后端一致) */
function canModify(t: TemplateOut): boolean {
  return userStore.isSuperAdmin || t.created_by === userStore.user?.id
}

// ── 视图状态 ─────────────────────────────────────────────────────────────────
// mode: list | build | merge
const mode = ref<'list' | 'build' | 'mapping' | 'merge'>('list')

// ── 模板列表 ─────────────────────────────────────────────────────────────────
const templates = ref<TemplateOut[]>([])
const listLoading = ref(false)

async function loadTemplates() {
  listLoading.value = true
  try { templates.value = await tableToolsApi.listTemplates() }
  catch { ElMessage.error('加载模板列表失败') }
  finally { listLoading.value = false }
}
onMounted(loadTemplates)

// ── 建/编辑模板（build 模式） ─────────────────────────────────────────────────
const editingId = ref<number | null>(null)
const buildStep = ref<'upload' | 'ai' | 'form'>('upload')
const activeConfigTab = ref<'base' | 'key' | 'dwd' | 'output'>('base')
const workflowSteps = [
  { key: 'base' as const, label: '基础模板' },
  { key: 'key' as const, label: '主键映射' },
  { key: 'dwd' as const, label: '数据关联' },
  { key: 'output' as const, label: '信息输出' },
]
const workflowStepIndex = computed(() => workflowSteps.findIndex((step) => step.key === activeConfigTab.value))
const isLastWorkflowStep = computed(() => workflowStepIndex.value === workflowSteps.length - 1)

const keyMappings = ref<KeyMapping[]>([])
const keyMappingDraft = ref<KeyMapping | null>(null)
const keyMappingSaving = ref(false)
const dwdRelations = ref<DwdRelation[]>([])
const dwdSources = ref<DwdRelationSource[]>([])
const dwdFields = ref<DwdField[]>([])
const dwdFieldsLoading = ref(false)
const dwdRelationDraft = ref<Partial<DwdRelation> | null>(null)
const dwdRelationSaving = ref(false)

function emptyKeyMapping(): KeyMapping {
  return {
    id: 0, template_id: editingId.value || 0,
    source_key: Object.fromEntries(form.value.merge_keys.map((field) => [field, ''])),
    canonical_merge_key: Object.fromEntries(form.value.merge_keys.map((field) => [field, ''])),
    enabled: true,
  }
}

function emptyDwdRelation(): Partial<DwdRelation> {
  return {
    name: '', dataset_id: undefined, report_id: undefined, left_fields: [], right_fields: [], select_fields: [],
    missing_policy: 'anomaly', multiple_policy: 'anomaly', enabled: true,
  }
}

async function loadAdvancedConfig(id: number) {
  try {
    const [keys, relations, sources] = await Promise.all([
      tableToolsApi.listKeyMappings(id),
      tableToolsApi.listDwdRelations(id),
      tableToolsApi.listDwdSources(),
    ])
    keyMappings.value = keys
    dwdRelations.value = relations
    dwdSources.value = sources
    const fieldLists = await Promise.all(relations.filter((r) => r.enabled).map((r) =>
      r.dataset_id ? tableToolsApi.listDwdFields(r.dataset_id) : r.report_id ? tableToolsApi.listDwdFieldsByReport(r.report_id) : Promise.resolve([]),
    ))
    dwdFields.value = [...new Map(fieldLists.flat().map((field) => [field.code, field])).values()]
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载高级配置失败')
  }
}

async function loadDwdFields(datasetId?: number, reportId?: number) {
  dwdFields.value = []
  if (!datasetId && !reportId) return
  dwdFieldsLoading.value = true
  try {
    dwdFields.value = datasetId
      ? await tableToolsApi.listDwdFields(datasetId)
      : await tableToolsApi.listDwdFieldsByReport(reportId!)
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '加载 DWD 字段失败') }
  finally { dwdFieldsLoading.value = false }
}

function selectDwdDataset(datasetId?: number) {
  if (!dwdRelationDraft.value) return
  dwdRelationDraft.value.dataset_id = datasetId
  dwdRelationDraft.value.report_id = undefined
  void loadDwdFields(datasetId)
}

function startKeyMapping(item?: KeyMapping) {
  keyMappingDraft.value = item ? JSON.parse(JSON.stringify(item)) : emptyKeyMapping()
}
function cancelKeyMapping() { keyMappingDraft.value = null }

async function saveKeyMapping() {
  if (!editingId.value || !keyMappingDraft.value) return
  const item = keyMappingDraft.value
  if (form.value.merge_keys.some((field) => !String(item.source_key[field] ?? '').trim() || !String(item.canonical_merge_key[field] ?? '').trim())) {
    ElMessage.warning('请完整填写源主键值和归集统一键')
    return
  }
  keyMappingSaving.value = true
  try {
    const payload = { source_key: item.source_key, canonical_merge_key: item.canonical_merge_key, enabled: item.enabled }
    const saved = item.id
      ? await tableToolsApi.updateKeyMapping(editingId.value, item.id, payload)
      : await tableToolsApi.createKeyMapping(editingId.value, payload)
    keyMappings.value = keyMappings.value.some((value) => value.id === saved.id)
      ? keyMappings.value.map((value) => value.id === saved.id ? saved : value)
      : [...keyMappings.value, saved]
    keyMappingDraft.value = null
    markSaved()
    ElMessage.success('主键值映射已保存')
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '主键值映射保存失败') }
  finally { keyMappingSaving.value = false }
}

async function removeKeyMapping(item: KeyMapping) {
  if (!editingId.value) return
  try {
    await ElMessageBox.confirm('确认删除该主键值映射？', '确认删除', { type: 'warning' })
    await tableToolsApi.deleteKeyMapping(editingId.value, item.id)
    keyMappings.value = keyMappings.value.filter((value) => value.id !== item.id)
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e?.response?.data?.detail || '删除主键值映射失败')
  }
}

function startDwdRelation(item?: DwdRelation) {
  const draft = item ? JSON.parse(JSON.stringify(item)) : emptyDwdRelation()
  dwdRelationDraft.value = draft
  void loadDwdFields(draft.dataset_id ?? undefined, draft.report_id ?? undefined)
}
function cancelDwdRelation() { dwdRelationDraft.value = null; dwdFields.value = [] }
function addDwdPair() {
  if (!dwdRelationDraft.value) return
  dwdRelationDraft.value.left_fields = [...(dwdRelationDraft.value.left_fields || []), '']
  dwdRelationDraft.value.right_fields = [...(dwdRelationDraft.value.right_fields || []), '']
}
function removeDwdPair(index: number) {
  if (!dwdRelationDraft.value) return
  dwdRelationDraft.value.left_fields = (dwdRelationDraft.value.left_fields || []).filter((_, i) => i !== index)
  dwdRelationDraft.value.right_fields = (dwdRelationDraft.value.right_fields || []).filter((_, i) => i !== index)
}

async function saveDwdRelation() {
  if (!editingId.value || !dwdRelationDraft.value) return
  const item = dwdRelationDraft.value
  if (!item.name?.trim() || (!item.dataset_id && !item.report_id) || !item.left_fields?.length || !item.right_fields?.length) {
    ElMessage.warning('请填写名称、DWD 来源和关联字段')
    return
  }
  if (item.left_fields.length !== item.right_fields.length) {
    ElMessage.warning('左右关联字段数量必须一致')
    return
  }
  dwdRelationSaving.value = true
  try {
    const payload = {
      name: item.name, dataset_id: item.dataset_id ?? null, report_id: item.dataset_id ? null : item.report_id ?? null,
      left_fields: item.left_fields, right_fields: item.right_fields, select_fields: item.select_fields || [],
      missing_policy: item.missing_policy || 'anomaly', multiple_policy: item.multiple_policy || 'anomaly',
      enabled: item.enabled !== false,
    }
    const saved = item.id
      ? await tableToolsApi.updateDwdRelation(editingId.value, item.id, payload)
      : await tableToolsApi.createDwdRelation(editingId.value, payload)
    dwdRelations.value = dwdRelations.value.some((value) => value.id === saved.id)
      ? dwdRelations.value.map((value) => value.id === saved.id ? saved : value)
      : [...dwdRelations.value, saved]
    dwdRelationDraft.value = null
    markSaved()
    ElMessage.success('DWD 关联已保存')
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || 'DWD 关联保存失败') }
  finally { dwdRelationSaving.value = false }
}

async function removeDwdRelation(item: DwdRelation) {
  if (!editingId.value) return
  try {
    await ElMessageBox.confirm('确认删除该 DWD 关联？', '确认删除', { type: 'warning' })
    await tableToolsApi.deleteDwdRelation(editingId.value, item.id)
    dwdRelations.value = dwdRelations.value.filter((value) => value.id !== item.id)
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e?.response?.data?.detail || '删除 DWD 关联失败')
  }
}

// 文件 + AI
const tplFiles = ref<File[]>([])
const aiContext = ref('')
const aiLoading = ref(false)
const draft = ref<AiDraft | null>(null)

// 表单数据
const form = ref({
  name: '',
  description: '',
  merge_keys: ['姓名', '证件号码'] as string[],
  std_fields: [] as string[],
  aggregate: 'sum',
  result_save_mode: 'input_period' as ResultSaveMode,
  result_period_field: null as string | null,
  output_fields: [] as string[],
  mappings: [] as any[],
})
const stdFieldInput = ref('')
const draggingStdField = ref('')
const outputFieldCandidates = computed(() => {
  const dwdSelects = dwdRelations.value
    .filter((r) => r.enabled)
    .flatMap((r) => r.select_fields || [])
  return [...new Set([...form.value.merge_keys, ...form.value.std_fields, ...dwdSelects])]
})
const outputFieldLabels = computed(() => Object.fromEntries(dwdFields.value.map((field) => [field.code, field.label])))
const savingTpl = ref(false)
const savedSnapshot = ref('')

function currentSnapshot() {
  return JSON.stringify({
    form: form.value,
    keyMappings: keyMappings.value,
    dwdRelations: dwdRelations.value,
    keyMappingDraft: keyMappingDraft.value,
    dwdRelationDraft: dwdRelationDraft.value,
    editingMapping: editingMapping.value,
    tplFiles: tplFiles.value.map((file) => ({ name: file.name, size: file.size, lastModified: file.lastModified })),
    aiContext: aiContext.value,
    draft: draft.value,
  })
}

function markSaved() { savedSnapshot.value = currentSnapshot() }
const hasUnsavedChanges = computed(() => savedSnapshot.value !== currentSnapshot())

// 当前展开的 mapping 索引
const expandedMapping = ref<number | null>(null)
// 当前正在编辑的 mapping 副本
const editingMapping = ref<any | null>(null)

function openNew() {
  editingId.value = null
  tplFiles.value = []
  aiContext.value = ''
  draft.value = null
  expandedMapping.value = null
  editingMapping.value = null
  keyMappings.value = []
  dwdRelations.value = []
  dwdSources.value = []
  keyMappingDraft.value = null
  dwdRelationDraft.value = null
  activeConfigTab.value = 'base'
  resetForm()
  buildStep.value = 'upload'
  mode.value = 'build'
  markSaved()
}

async function openEdit(id: number): Promise<boolean> {
  editingId.value = id
  try {
    const detail: TemplateDetail = await tableToolsApi.getTemplate(id)
    form.value = {
      name: detail.name,
      description: detail.description || '',
      merge_keys: [...detail.merge_keys],
      std_fields: [...detail.std_fields],
      aggregate: detail.aggregate,
      result_save_mode: detail.result_save_mode,
      result_period_field: detail.result_period_field || null,
      output_fields: [...(detail.output_fields || [])],
      mappings: detail.mappings.map((m: any) => ({ ...m })),
    }
    expandedMapping.value = null
    editingMapping.value = null
    activeConfigTab.value = 'base'
    await loadAdvancedConfig(id)
    buildStep.value = 'form'
    mode.value = 'build'
    markSaved()
    return true
  } catch {
    ElMessage.error('加载模板详情失败')
    return false
  }
}

const mappingWizardTemplate = ref<TemplateDetail | null>(null)
const mappingWizardStep = ref<'upload' | 'ai' | 'confirm'>('upload')
const mappingWizardFiles = ref<File[]>([])
const mappingWizardContext = ref('')
const mappingWizardDrafts = ref<any[]>([])
const mappingWizardSaving = ref(false)

function resetMappingWizard() {
  mappingWizardStep.value = 'upload'
  mappingWizardFiles.value = []
  mappingWizardContext.value = ''
  mappingWizardDrafts.value = []
}

async function openAddMapping(id: number) {
  try {
    mappingWizardTemplate.value = await tableToolsApi.getTemplate(id)
    resetMappingWizard()
    mode.value = 'mapping'
  } catch {
    ElMessage.error('加载模板详情失败')
  }
}

function removeMappingWizardFile(index: number) {
  mappingWizardFiles.value.splice(index, 1)
}

function handleMappingWizardFile(uploadFile: any) {
  const file = uploadFile.raw as File
  if (!mappingWizardFiles.value.some((item) => item.name === file.name && item.size === file.size)) {
    mappingWizardFiles.value.push(file)
  }
}

function uniqueWizardMappingName(proposedName: string, usedNames: Set<string>) {
  const baseName = proposedName.trim() || '新映射'
  if (!usedNames.has(baseName)) {
    usedNames.add(baseName)
    return baseName
  }
  let sequence = 2
  while (usedNames.has(`${baseName}-${sequence}`)) sequence += 1
  const name = `${baseName}-${sequence}`
  usedNames.add(name)
  return name
}

async function runMappingDrafts() {
  if (!mappingWizardTemplate.value || !mappingWizardFiles.value.length) {
    ElMessage.warning('请先拖拽或选择至少一个样表文件')
    return
  }
  mappingWizardStep.value = 'ai'
  try {
    const result = await tableToolsApi.mappingDrafts(
      mappingWizardTemplate.value.id,
      mappingWizardFiles.value,
      mappingWizardContext.value,
    )
    const usedNames = new Set(mappingWizardTemplate.value.mappings.map((mapping) => mapping.name))
    mappingWizardDrafts.value = result.mappings.map((mapping: any) => ({
      ...mapping,
      name: uniqueWizardMappingName(mapping.name, usedNames),
    }))
    mappingWizardStep.value = 'confirm'
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '样表识别失败，请重试')
    mappingWizardStep.value = 'upload'
  }
}

function removeMappingWizardDraft(index: number) {
  mappingWizardDrafts.value.splice(index, 1)
}

async function saveMappingDrafts() {
  if (!mappingWizardTemplate.value || !mappingWizardDrafts.value.length) {
    ElMessage.warning('请保留至少一条待保存映射')
    return
  }
  mappingWizardSaving.value = true
  try {
    const invalidMapping = mappingWizardDrafts.value.find((mapping) => validateDerivedFields(mapping))
    if (invalidMapping) {
      ElMessage.warning(validateDerivedFields(invalidMapping) || '派生字段配置无效')
      return
    }
    await tableToolsApi.createMappings(
      mappingWizardTemplate.value.id,
      mappingWizardDrafts.value.map((mapping) => ({
        name: mapping.name,
        match_signature: mapping.match_signature || [],
        source_fields: mapping.source_fields || [],
        sheet_kw: mapping.sheet_kw || null,
        header_start: mapping.header_start || 1,
        header_end: mapping.header_end || 1,
        key_map: mapping.key_map || {},
        column_map: mapping.column_map || {},
        new_std_fields: mapping.new_std_fields || [],
        derived_fields: mapping.derived_fields || [],
        derive_check: mapping.derive_check || null,
        skip_tokens: mapping.skip_tokens || ['合计', '小计', '总计'],
      })),
    )
    await loadTemplates()
    mode.value = 'list'
    ElMessage.success(`已新增 ${mappingWizardDrafts.value.length} 条源映射`)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '批量保存映射失败')
  } finally {
    mappingWizardSaving.value = false
  }
}

function resetForm() {
  form.value = { name: '', description: '', merge_keys: ['姓名', '证件号码'], std_fields: [], aggregate: 'sum', result_save_mode: 'input_period', result_period_field: null, output_fields: [], mappings: [] }
}

// 文件选择（去重）
function handleTplFileChange(uploadFile: any) {
  const file: File = uploadFile.raw
  if (!tplFiles.value.find((f) => f.name === file.name && f.size === file.size)) {
    tplFiles.value.push(file)
  }
}
function removeTplFile(index: number) { tplFiles.value.splice(index, 1) }

// AI 识别
async function runAiDraft() {
  if (!tplFiles.value.length) { ElMessage.warning('请先上传文件'); return }
  buildStep.value = 'ai'
  try {
    draft.value = await tableToolsApi.aiDraft(tplFiles.value, aiContext.value)
    form.value = {
      name: draft.value.name || '',
      description: draft.value.description || '',
      merge_keys: [...draft.value.merge_keys],
      std_fields: [...draft.value.std_fields],
      aggregate: draft.value.aggregate,
      result_save_mode: 'input_period' as ResultSaveMode,
      result_period_field: null,
      output_fields: [],
      mappings: draft.value.mappings.map((m: any) => ({ ...m })),
    }
    buildStep.value = 'form'
    expandedMapping.value = null
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || 'AI 识别失败，请重试')
    buildStep.value = 'upload'
  }
}

async function handleBuildBack() {
  if (!hasUnsavedChanges.value) { mode.value = 'list'; return }
  try {
    await ElMessageBox.confirm('当前页面有未保存的修改，是否保存后返回？', '确认返回', {
      type: 'warning', confirmButtonText: '保存后返回', cancelButtonText: '取消', distinguishCancelAndClose: true,
    })
    await saveTemplate(true)
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error('返回操作失败')
  }
}

async function goToConfigStep(target: typeof activeConfigTab.value) {
  if (target === activeConfigTab.value || buildStep.value !== 'form') return
  if (await saveTemplate(false)) activeConfigTab.value = target
}

async function goToPreviousStep() {
  const index = workflowStepIndex.value
  if (index > 0) await goToConfigStep(workflowSteps[index - 1].key)
}

async function goToNextStep() {
  const index = workflowStepIndex.value
  if (index < 0) return
  if (isLastWorkflowStep.value) await saveTemplate(true)
  else await goToConfigStep(workflowSteps[index + 1].key)
}

function skipToManual() {
  draft.value = null
  resetForm()
  buildStep.value = 'form'
}

// mapping 编辑
function startEditMapping(idx: number) {
  expandedMapping.value = idx
  editingMapping.value = JSON.parse(JSON.stringify(form.value.mappings[idx]))
}

function cancelEditMapping() {
  expandedMapping.value = null
  editingMapping.value = null
}


function validateDerivedFields(mapping: any): string | null {
  const stdFields = new Set([
    ...form.value.std_fields,
    ...(mapping.new_std_fields || []),
  ].map((field: string) => field.trim()))
  for (const [source, target] of Object.entries(mapping.column_map || {})) {
    const normalizedTarget = String(target || '').trim()
    if (!normalizedTarget || !stdFields.has(normalizedTarget)) {
      return `映射「${mapping.name || '未命名映射'}」的源字段「${source}」目标必须属于模板标准字段或本次新增标准字段`
    }
  }
  const directTargets = new Set(Object.values(mapping.column_map || {}).map((field: any) => String(field).trim()))
  const targets = new Set<string>()
  for (const field of mapping.derived_fields || []) {
    const target = String(field.target || '').trim()
    const expr = String(field.expr || '').trim()
    const refs = Array.from(expr.matchAll(/\{([^{}]+)\}/g), (match) => match[1].trim())
    if (!stdFields.has(target)) return '派生字段目标必须属于模板标准字段'
    if (!expr) return '派生字段公式不能为空'
    if (targets.has(target)) return '同一映射不能重复配置派生字段目标'
    if (directTargets.has(target)) return '派生字段目标不能同时配置直接映射'
    if (!refs.length || refs.some((ref) => !stdFields.has(ref))) return '派生公式只能引用模板标准字段'
    targets.add(target)
  }
  return null
}

async function saveEditMapping() {
  if (expandedMapping.value === null || !editingMapping.value) return
  const validationError = validateDerivedFields(editingMapping.value)
  if (validationError) {
    ElMessage.warning(validationError)
    return
  }
  const index = expandedMapping.value
  const payload = { ...editingMapping.value }
  try {
    if (editingId.value) {
      const saved = payload.id
        ? await tableToolsApi.updateMapping(editingId.value, payload.id, payload)
        : await tableToolsApi.createMapping(editingId.value, payload)
      form.value.mappings[index] = saved
    } else {
      form.value.mappings[index] = payload
    }
    expandedMapping.value = null
    editingMapping.value = null
    markSaved()
    ElMessage.success('源映射已保存')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '源映射保存失败')
  }
}

const mappingDraftLoading = ref(false)
const mappingDraftFile = ref<File | null>(null)
const mappingDraftSheets = ref<string[]>([])
const mappingDraftSheet = ref("")
const mappingDraftWarnings = ref<string[]>([])
const mappingDraftLowConfidence = ref<{ confidence: number; notes: string } | null>(null)
async function handleMappingSample(uploadFile: any) {
  if (!editingId.value || !editingMapping.value) return
  mappingDraftLoading.value = true
  try {
    const sampleFile = uploadFile.raw as File
    mappingDraftFile.value = sampleFile
    const result = await tableToolsApi.mappingDraft(editingId.value, sampleFile, mappingDraftSheet.value || undefined)
    mappingDraftSheets.value = result.available_sheets
    mappingDraftSheet.value = result.mapping.sheet_kw || ""
    mappingDraftWarnings.value = result.warnings
    mappingDraftLowConfidence.value = result.low_confidence[0] || null
    editingMapping.value = {
      ...editingMapping.value,
      ...result.mapping,
      source_fields: result.mapping.source_fields || result.effective_headers,
    }
    ElMessage.success('已根据样表表头回填映射草稿，请确认后保存')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '样表解析失败')
  } finally {
    mappingDraftLoading.value = false
  }
}
async function reloadMappingDraft() {
  if (mappingDraftFile.value) await handleMappingSample({ raw: mappingDraftFile.value })
}
async function removeMapping(idx: number) {
  const mapping = form.value.mappings[idx]
  try {
    await ElMessageBox.confirm(`确认删除映射「${mapping.name}」？`, '确认删除', { type: 'warning' })
    if (editingId.value && mapping.id) await tableToolsApi.deleteMapping(editingId.value, mapping.id)
    form.value.mappings.splice(idx, 1)
    cancelEditMapping()
    ElMessage.success('源映射已删除')
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e?.response?.data?.detail || '删除映射失败')
  }
}

// key_map / column_map 编辑辅助
function addKeyMapEntry() {
  if (!editingMapping.value?.source_fields?.length) {
    ElMessage.warning('请先上传样表解析源字段')
    return
  }
  if (!editingMapping.value.key_map) editingMapping.value.key_map = {}
  editingMapping.value._keyMapEntries = [...objToEntries(editingMapping.value.key_map), { key: '', val: '' }]
}

function addColumnMapEntry() {
  if (!editingMapping.value?.source_fields?.length) {
    ElMessage.warning('请先上传样表解析源字段')
    return
  }
  if (!editingMapping.value.column_map) editingMapping.value.column_map = {}
  editingMapping.value._colMapEntries = [...objToEntries(editingMapping.value.column_map), { key: '', val: '' }]
}

function objToEntries(obj: Record<string, string>) {
  return Object.entries(obj).map(([k, v]) => ({ key: k, val: v }))
}

function entriesToObj(entries: { key: string; val: string }[]) {
  const obj: Record<string, string> = {}
  for (const e of entries) { if (e.key) obj[e.key] = e.val }
  return obj
}

// derived_fields 编辑
function addDerivedField() {
  if (!editingMapping.value) return
  if (!editingMapping.value.derived_fields) editingMapping.value.derived_fields = []
  editingMapping.value.derived_fields.push({ target: '', expr: '', round: 2 })
}
function removeDerivedField(idx: number) {
  editingMapping.value?.derived_fields?.splice(idx, 1)
}

// 把 key_map/column_map 对象同步到 editingMapping
function syncKeyMap(entries: { key: string; val: string }[]) {
  if (!editingMapping.value) return
  editingMapping.value._keyMapEntries = entries
  editingMapping.value.key_map = entriesToObj(entries)
}
function syncColumnMap(entries: { key: string; val: string }[]) {
  if (!editingMapping.value) return
  editingMapping.value._colMapEntries = entries
  editingMapping.value.column_map = entriesToObj(entries)
}

// 标准字段
function addStdField() {
  const v = stdFieldInput.value.trim()
  if (!v || form.value.std_fields.includes(v)) { stdFieldInput.value = ''; return }
  form.value.std_fields.push(v)
  if (form.value.output_fields.length && !form.value.output_fields.includes(v)) form.value.output_fields.push(v)
  stdFieldInput.value = ''
}
function removeStdField(f: string) {
  form.value.std_fields = form.value.std_fields.filter((x) => x !== f)
  form.value.output_fields = form.value.output_fields.filter((x) => x !== f)
}
// 拖拽排序：决定归集输出表的列顺序
function reorderStdField(code: string, targetCode: string) {
  if (!code || !targetCode || code === targetCode) return
  const next = [...form.value.std_fields]
  const from = next.indexOf(code)
  const to = next.indexOf(targetCode)
  if (from < 0 || to < 0) return
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  form.value.std_fields = next
}

// 低置信度
function aiLowConfidence(mappingName: string) {
  return draft.value?._meta?.low_confidence?.find((l: any) => l.sheet === mappingName)
}

// 保存模板
async function saveTemplate(returnToList = true): Promise<boolean | undefined> {
  if (editingMapping.value) {
    await saveEditMapping()
    if (editingMapping.value) return false
  }
  if (keyMappingDraft.value) {
    await saveKeyMapping()
    if (keyMappingDraft.value) return false
  }
  if (dwdRelationDraft.value) {
    await saveDwdRelation()
    if (dwdRelationDraft.value) return false
  }
  if (!form.value.name.trim()) { ElMessage.warning('请填写模板名称'); return }
  if (!form.value.std_fields.length) { ElMessage.warning('标准字段不能为空'); return }
  const invalidMapping = form.value.mappings.find((mapping) => validateDerivedFields(mapping))
  if (invalidMapping) {
    ElMessage.warning(validateDerivedFields(invalidMapping) || '源映射配置无效')
    return
  }
  savingTpl.value = true
  try {
    const payload = {
      name: form.value.name,
      description: form.value.description || null,
      merge_keys: form.value.merge_keys,
      std_fields: form.value.std_fields,
      output_fields: form.value.output_fields,
      aggregate: form.value.aggregate,
      result_save_mode: form.value.result_save_mode,
      result_period_field: form.value.result_save_mode === 'field_period' ? form.value.result_period_field : null,
      mappings: form.value.mappings.map((m) => ({
        id: m.id || null,
        name: m.name,
        match_signature: m.match_signature || [],
        source_fields: m.source_fields || [],
        sheet_kw: m.sheet_kw || null,
        header_start: m.header_start || 1,
        header_end: m.header_end || 1,
        key_map: m.key_map || {},
        column_map: m.column_map || {},
        new_std_fields: m.new_std_fields || [],
        derived_fields: m.derived_fields || [],
        derive_check: m.derive_check || null,
        skip_tokens: m.skip_tokens || ['合计', '小计', '总计'],
      })),
    }
    if (editingId.value) {
      await tableToolsApi.updateTemplate(editingId.value, payload)
      ElMessage.success('模板已更新')
    } else {
      const created = await tableToolsApi.createTemplate(payload)
      editingId.value = created.id
      ElMessage.success('模板已保存')
    }
    if (returnToList) await loadTemplates()
    markSaved()
    if (returnToList) mode.value = 'list'
    return true
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    savingTpl.value = false
  }
}

async function deleteTemplate(t: TemplateOut) {
  await ElMessageBox.confirm(`确认删除模板「${t.name}」？`, '确认删除', {
    type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
  })
  try {
    await tableToolsApi.deleteTemplate(t.id)
    ElMessage.success('已删除')
    await loadTemplates()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '删除失败')
  }
}

// ── 月度合并（merge 模式） ────────────────────────────────────────────────────
const mergeTemplate = ref<TemplateOut | null>(null)
const mergeFiles = ref<File[]>([])
const merging = ref(false)
const downloading = ref(false)
const mergeResult = ref<MergeResult | null>(null)
const resultPeriod = ref('')
const savingResult = ref(false)
const resultBatches = ref<MergeResultBatch[]>([])
const historyResult = ref<MergeResultBatchRows | null>(null)
const historyLoading = ref(false)

function resultLoadError(e: any, fallback: string) {
  const status = e?.response?.status
  const detail = e?.response?.data?.detail || fallback
  if (status === 401) return `${detail}，请重新登录后再试`
  if (status) return `${detail}（HTTP ${status}）`
  return detail
}

async function loadResultBatches(showError = false) {
  if (!mergeTemplate.value) return
  try { resultBatches.value = await tableToolsApi.listResultBatches(mergeTemplate.value.id) }
  catch (e: any) {
    resultBatches.value = []
    if (showError) ElMessage.error(resultLoadError(e, '加载历史结果失败'))
  }
}

function openMerge(t: TemplateOut) {
  mergeTemplate.value = t
  mergeFiles.value = []
  mergeResult.value = null
  resultPeriod.value = ''
  resultBatches.value = []
  historyResult.value = null
  mode.value = 'merge'
  void loadResultBatches()
}

function handleMergeFileChange(uploadFile: any) {
  const file: File = uploadFile.raw
  if (!mergeFiles.value.find((f) => f.name === file.name && f.size === file.size)) {
    mergeFiles.value.push(file)
  }
}
function removeMergeFile(index: number) { mergeFiles.value.splice(index, 1) }

async function runMerge() {
  if (!mergeTemplate.value || !mergeFiles.value.length) return
  merging.value = true
  mergeResult.value = null
  try {
    mergeResult.value = await tableToolsApi.runMerge(mergeTemplate.value.id, mergeFiles.value)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '合并失败')
  } finally {
    merging.value = false
  }
}

async function downloadResult() {
  if (!mergeTemplate.value || !mergeFiles.value.length) return
  downloading.value = true
  try {
    await tableToolsApi.downloadMerge(mergeTemplate.value.id, mergeFiles.value)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '下载失败')
  } finally {
    downloading.value = false
  }
}

async function saveCurrentResult() {
  if (!mergeTemplate.value || !mergeResult.value?.preview_token) return
  const mode = mergeTemplate.value.result_save_mode || 'input_period'
  let period: string | undefined
  if (mode === 'input_period') {
    const input = await ElMessageBox.prompt('请输入业务月份（YYYYMM）', '保存结果', {
      inputValue: resultPeriod.value,
      inputPlaceholder: '例如 202606',
      inputPattern: /^\d{6}$/,
      inputErrorMessage: '请输入有效的业务月份 YYYYMM',
      confirmButtonText: '继续',
      cancelButtonText: '取消',
    }).catch(() => null)
    if (!input) return
    period = input.value
    resultPeriod.value = period
  } else if (mode === 'field_period') {
    const field = mergeTemplate.value.result_period_field
    const periods = [...new Set((mergeResult.value.rows || []).map((row) => String(row[field || ''] || '').trim()).filter(Boolean))]
    if (periods.length === 0) {
      ElMessage.error(`结果中未识别到业务月份字段“${field || ''}”，保存时将由服务端校验完整结果`)
    } else if (periods.length !== 1 || !/^\d{6}$/.test(periods[0]) || Number(periods[0].slice(4)) < 1 || Number(periods[0].slice(4)) > 12) {
      ElMessage.error('结果中必须包含唯一的有效业务月份')
      return
    } else {
      period = periods[0]
    }
  }
  const label = mode === 'none' ? '当前结果快照' : `${period} 的结果`
  try {
    await ElMessageBox.confirm(
      `将保存${label}的完整预览结果（共 ${mergeResult.value.total_rows} 行）。相同归集联合主键将整行覆盖，新主键将新增；本次未出现的既有数据不会删除，DWD 字段一并固化。`,
      '确认保存结果', { type: 'warning', confirmButtonText: '确认保存' },
    )
  } catch { return }
  savingResult.value = true
  try {
    const saved = await tableToolsApi.saveResultBatch(mergeTemplate.value.id, mergeResult.value.preview_token, period)
    ElMessage.success(`保存完成：新增 ${saved.inserted_count} 行，覆盖 ${saved.replaced_count} 行，当前共 ${saved.total_count} 行`)
    await loadResultBatches(true)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存结果失败')
  } finally {
    savingResult.value = false
  }
}

async function viewResultBatch(batch: MergeResultBatch) {
  if (!mergeTemplate.value) return
  historyLoading.value = true
  try { historyResult.value = await tableToolsApi.getResultBatchRows(mergeTemplate.value.id, batch.id) }
  catch (e: any) { ElMessage.error(resultLoadError(e, '加载历史结果失败')) }
  finally { historyLoading.value = false }
}

async function downloadResultBatch(batch: MergeResultBatch) {
  if (!mergeTemplate.value) return
  try { await tableToolsApi.downloadResultBatch(mergeTemplate.value.id, batch) }
  catch (e: any) { ElMessage.error(e?.response?.data?.detail || '下载历史结果失败') }
}

// ── 计算属性 ─────────────────────────────────────────────────────────────────
const mergeResultCols = computed(() => mergeResult.value?.columns || [])
const historyResultCols = computed(() => historyResult.value?.columns || [])
function mergeColumnLabel(column: string) {
  return mergeResult.value?.column_labels?.[column] || column
}
function historyColumnLabel(column: string) {
  return historyResult.value?.column_labels?.[column] || column
}

// key_map / column_map entries（用于 v-model 绑定）
const editingKeyMapEntries = computed({
  get: () => editingMapping.value ? (editingMapping.value._keyMapEntries || objToEntries(editingMapping.value.key_map || {})) : [],
  set: (v) => syncKeyMap(v),
})
const editingColMapEntries = computed({
  get: () => editingMapping.value ? (editingMapping.value._colMapEntries || objToEntries(editingMapping.value.column_map || {})) : [],
  set: (v) => syncColumnMap(v),
})
</script>

<template>
  <div class="tt-root">

    <!-- ═══════════════════════════════════════════════════════
         模板列表页
    ════════════════════════════════════════════════════════ -->
    <template v-if="mode === 'list'">
      <div class="page-header">
        <div>
          <h1 class="page-title">表格归集</h1>
          <p class="page-desc">配置归集模板，定期上传多源文件一键合并为标准表格</p>
        </div>
        <PermissionButton menu="table_tools" op="C" type="primary" :icon="Plus" @click="openNew">
          新建模板
        </PermissionButton>
      </div>

      <div v-if="listLoading" class="list-loading">
        <div class="skeleton" v-for="i in 3" :key="i" />
      </div>

      <div v-else-if="!templates.length" class="empty-state">
        <el-icon class="empty-icon"><Grid /></el-icon>
        <p>暂无归集模板</p>
        <PermissionButton menu="table_tools" op="C" type="primary" :icon="Plus" @click="openNew">
          创建第一个模板
        </PermissionButton>
      </div>

      <div v-else class="tpl-grid">
        <div class="tpl-card" v-for="t in templates" :key="t.id">
          <div class="tpl-card-body">
            <div class="tpl-card-icon"><el-icon><Document /></el-icon></div>
            <div class="tpl-card-info">
              <div class="tpl-name">{{ t.name }}</div>
              <div class="tpl-desc" v-if="t.description">{{ t.description }}</div>
              <div class="tpl-meta">
                <span class="meta-tag" v-for="k in t.merge_keys" :key="k">{{ k }}</span>
                <span class="meta-dot">·</span>
                <span class="meta-count">{{ t.mapping_count }} 个数据源</span>
              </div>
            </div>
          </div>
          <div class="tpl-card-actions">
            <el-button type="primary" size="small" :icon="Upload" @click="openMerge(t)">合并</el-button>
            <PermissionButton v-if="canModify(t)" menu="table_tools" op="U" size="small" :icon="Plus" @click="openAddMapping(t.id)">
              新增映射表
            </PermissionButton>
            <PermissionButton v-if="canModify(t)" menu="table_tools" op="U" size="small" :icon="Edit" @click="openEdit(t.id)">
              编辑
            </PermissionButton>
            <PermissionButton v-if="canModify(t)" menu="table_tools" op="D" size="small" type="danger" :icon="Delete"
              @click="deleteTemplate(t)" />
          </div>
        </div>
      </div>
    </template>

    <!-- ═══════════════════════════════════════════════════════
         建/编辑模板页（全页面，无弹窗）
    ════════════════════════════════════════════════════════ -->
    <Teleport v-else-if="mode === 'build'" to="body">
      <div class="tt-root editor-fullscreen">
      <!-- 顶部导航栏 -->
      <div class="build-topbar">
        <button class="back-btn" @click="handleBuildBack">
          <el-icon><ArrowLeft /></el-icon>
          <span>返回</span>
        </button>
        <h2 class="build-title">{{ editingId ? '编辑模板' : '新建归集模板' }}</h2>
        <nav v-if="buildStep === 'form'" class="workflow-steps" aria-label="配置流程">
          <button
            v-for="(step, index) in workflowSteps"
            :key="step.key"
            class="workflow-step"
            :class="{ active: activeConfigTab === step.key }"
            :aria-current="activeConfigTab === step.key ? 'step' : undefined"
            @click="goToConfigStep(step.key)">
            <span class="workflow-step-label">{{ step.label }}</span>
            <span v-if="index < workflowSteps.length - 1" class="workflow-step-arrow" aria-hidden="true">›</span>
          </button>
        </nav>
        <div class="build-topbar-actions">
          <el-button v-if="buildStep === 'form'" :disabled="workflowStepIndex <= 0 || savingTpl" @click="goToPreviousStep">上一步</el-button>
          <el-button v-if="buildStep === 'form'" type="primary" :loading="savingTpl" @click="goToNextStep">
            {{ isLastWorkflowStep ? '完成' : '下一步' }}
          </el-button>
        </div>
      </div>

      <!-- 步骤 1：上传 -->
      <template v-if="buildStep === 'upload'">
        <div class="build-upload-wrap">
          <div class="upload-panel">
            <h3 class="upload-heading">上传数据源文件</h3>
            <p class="upload-sub">上传本次归集场景的所有 Excel 文件，AI 将自动识别字段映射关系</p>

            <el-upload
              drag multiple :auto-upload="false" :show-file-list="false"
              accept=".xlsx" :on-change="handleTplFileChange"
              class="upload-dragger">
              <el-icon class="upload-icon"><Upload /></el-icon>
              <div class="upload-text">拖拽文件到此处，或<em>点击选择</em></div>
              <div class="upload-hint">支持 .xlsx / .xls，可同时选择多个文件</div>
            </el-upload>

            <div v-if="tplFiles.length" class="file-chips">
              <div class="file-chip" v-for="(f, i) in tplFiles" :key="i">
                <el-icon><Document /></el-icon>
                <span>{{ f.name }}</span>
                <button class="chip-remove" @click="removeTplFile(i)">×</button>
              </div>
            </div>

            <div class="context-wrap">
              <label class="context-label">业务背景（可选，但强烈建议填写）</label>
              <el-input
                v-model="aiContext" type="textarea" :rows="3"
                placeholder="描述本次归集的场景与你想要的标准字段，AI 会据此决定字段清单和合并粒度。可包含：&#10;· 归集场景（如：月度社保公积金、考勤汇总、报销明细）&#10;· 想要哪些标准字段、合并到什么粗细（如：每类只保留个人/单位两项，忽略基数与比例）&#10;· 哪些列要忽略、用什么作归集主键&#10;描述越具体，AI 生成的模板越贴近预期，需要手工调整的越少。" />
            </div>

            <div class="upload-actions">
              <el-button @click="skipToManual">跳过，手动配置</el-button>
              <el-button type="primary" :icon="MagicStick"
                :disabled="!tplFiles.length" @click="runAiDraft">
                AI 识别映射关系
              </el-button>
            </div>
          </div>
        </div>
      </template>

      <!-- 步骤 2：AI 分析中 -->
      <template v-else-if="buildStep === 'ai'">
        <div class="ai-loading-wrap">
          <div class="ai-spinner">
            <div class="spinner-ring" />
            <el-icon class="spinner-icon"><MagicStick /></el-icon>
          </div>
          <h3 class="ai-loading-title">AI 正在分析文件结构</h3>
          <p class="ai-loading-sub">正在识别 {{ tplFiles.length }} 个文件的字段映射关系，请稍候…</p>
        </div>
      </template>

      <!-- 步骤 3：表单（左右分栏） -->
      <template v-else>
        <div v-if="editingId" class="config-tabs-wrap">
          <el-tabs v-model="activeConfigTab">
            <el-tab-pane label="基础模板" name="base" />
            <el-tab-pane label="主键值映射" name="key" />
            <el-tab-pane label="DWD 关联" name="dwd" />
            <el-tab-pane label="信息输出" name="output" />
          </el-tabs>
        </div>

        <template v-if="activeConfigTab === 'base' || !editingId">
        <!-- 低置信度提示 -->
        <div v-if="draft?._meta?.low_confidence?.length" class="confidence-alert">
          <el-icon><Warning /></el-icon>
          <div>
            以下映射置信度较低，请核查：
            <strong v-for="lc in draft._meta.low_confidence" :key="lc.sheet" style="margin-left:8px">
              {{ lc.sheet }}（{{ Math.round(lc.confidence * 100) }}%）
            </strong>
          </div>
        </div>

        <div class="build-layout">
          <!-- 左栏：基础信息 -->
          <div class="build-left">
            <section class="form-section">
              <h3 class="section-title">基础信息</h3>
              <div class="field-group">
                <label class="field-label required">模板名称</label>
                <el-input v-model="form.name" placeholder="如：社保月度归集" />
              </div>
              <div class="field-group">
                <label class="field-label">说明</label>
                <el-input v-model="form.description" placeholder="可选" />
              </div>
              <p class="section-desc">用于识别「同一个人」的唯一标识字段，建议 2 个以内</p>
              <el-select v-model="form.merge_keys" multiple allow-create filterable
                placeholder="输入后回车" style="width:100%">
                <el-option v-for="k in form.merge_keys" :key="k" :label="k" :value="k" />
              </el-select>
            </section>

            <section class="form-section">
              <h3 class="section-title">标准字段 <span class="required-mark">*</span></h3>
              <p class="section-desc">归集后输出表的列名，所有数据源的字段都会映射到这里；可拖拽调整顺序，决定导出表的列序</p>
              <div class="std-tags">
                <el-tag v-for="f in form.std_fields" :key="f" closable
                  @close="removeStdField(f)" class="std-tag"
                  draggable="true"
                  @dragstart="draggingStdField = f"
                  @dragend="draggingStdField = ''"
                  @dragover.prevent
                  @drop.prevent="reorderStdField(draggingStdField, f); draggingStdField = ''">{{ f }}</el-tag>
              </div>
              <div class="std-add">
                <el-input v-model="stdFieldInput" placeholder="输入字段名后添加"
                  size="small" @keyup.enter="addStdField" />
                <el-button size="small" @click="addStdField">添加</el-button>
              </div>
            </section>

            <section class="form-section">
              <h3 class="section-title">结果保存方式</h3>
              <el-radio-group v-model="form.result_save_mode" @change="form.result_period_field = form.result_save_mode === 'field_period' ? form.result_period_field : null">
                <el-radio label="none">不区分期间</el-radio>
                <el-radio label="input_period">保存时输入业务月份</el-radio>
                <el-radio label="field_period">从结果字段读取业务月份</el-radio>
              </el-radio-group>
              <el-select v-if="form.result_save_mode === 'field_period'" v-model="form.result_period_field" placeholder="选择业务月份字段" style="width:100%;margin-top:10px">
                <el-option v-for="field in form.std_fields" :key="field" :label="field" :value="field" />
              </el-select>
              <p class="section-desc">从结果字段读取时，所有结果行必须存在同一个有效的 YYYYMM。</p>
            </section>
          </div>

          <!-- 右栏：数据源映射 -->
          <div class="build-right">
            <div class="mappings-header">
              <h3 class="section-title">数据源映射</h3>
              <span class="mappings-count">{{ form.mappings.length }} 个</span>
              <el-button v-if="editingId" size="small" type="primary" plain :icon="Plus" @click="openAddMapping(editingId!)">新增映射表</el-button>
            </div>
            <p class="section-desc" style="margin-bottom:12px">
              点击每个数据源可展开查看和编辑映射关系
            </p>

            <div v-if="!form.mappings.length" class="mappings-empty">
              AI 识别或手动配置后，映射关系将显示在这里
            </div>

            <div class="mapping-list">
              <div
                v-for="(m, idx) in form.mappings"
                :key="idx"
                class="mapping-item"
                :class="{ expanded: expandedMapping === idx }">

                <!-- 折叠头 -->
                <div class="mapping-header" @click="expandedMapping === idx ? cancelEditMapping() : startEditMapping(idx)">
                  <div class="mapping-header-left">
                    <div class="mapping-chevron" :class="{ rotated: expandedMapping === idx }">›</div>
                    <div>
                      <div class="mapping-name">{{ m.name }}</div>
                      <div class="mapping-meta">
                        <span>表头行 {{ m.header_start }}–{{ m.header_end }}</span>
                        <span v-if="m.sheet_kw">· Sheet: {{ m.sheet_kw }}</span>
                        <span>· 字段映射 {{ Object.keys(m.column_map || {}).length }} 个</span>
                      </div>
                    </div>
                  </div>
                  <el-tag v-if="aiLowConfidence(m.name)" type="warning" size="small">
                    置信度 {{ Math.round((aiLowConfidence(m.name)?.confidence || 0) * 100) }}%
                  </el-tag>
                </div>

                <!-- 展开编辑区 -->
                <div v-if="expandedMapping === idx && editingMapping" class="mapping-editor">
                  <div class="editor-row">
                    <div class="editor-field">
                      <label class="editor-label">映射名称</label>
                      <el-input v-model="editingMapping.name" size="small" placeholder="例如：北京-公积金导出表" />
                    </div>
                    <div class="editor-field">
                      <label class="editor-label">表头识别特征（至少 3 项，逗号分隔）</label>
                      <el-input :model-value="(editingMapping.match_signature || []).join(',')" size="small"
                        placeholder="姓名,证件号码,缴存基数"
                        @update:model-value="editingMapping.match_signature = $event.split(',').map((v: string) => v.trim()).filter(Boolean)" />
                    </div>
                  </div>

                  <div v-if="editingId" class="editor-row">
                    <div class="editor-field">
                      <label class="editor-label">从样表回填（仅解析表头）</label>
                      <el-upload :auto-upload="false" :show-file-list="false" accept=".xlsx"
                        :disabled="mappingDraftLoading" :on-change="handleMappingSample">
                        <el-button size="small" :loading="mappingDraftLoading" :icon="Upload">上传样表并回填</el-button>
                      </el-upload>
                      <el-select v-if="mappingDraftSheets.length > 1" v-model="mappingDraftSheet" size="small"
                        placeholder="选择要解析的 Sheet" style="margin-top:8px" @change="reloadMappingDraft">
                        <el-option v-for="sheet in mappingDraftSheets" :key="sheet" :label="sheet" :value="sheet" />
                      </el-select>
                      <div v-if="mappingDraftLowConfidence" class="ai-notes">
                        ⚠ AI 置信度 {{ Math.round(mappingDraftLowConfidence.confidence * 100) }}%：{{ mappingDraftLowConfidence.notes }}
                      </div>
                      <div v-for="warning in mappingDraftWarnings" :key="warning" class="ai-notes">⚠ {{ warning }}</div>
                    </div>
                  </div>

                  <!-- Sheet 关键词 & 表头行 -->
                  <div class="editor-row">
                    <div class="editor-field">
                      <label class="editor-label">Sheet 关键词</label>
                      <el-input v-model="editingMapping.sheet_kw" size="small"
                        placeholder="留空匹配全部 sheet" />
                    </div>
                    <div class="editor-field" style="width:90px">
                      <label class="editor-label">表头起始行</label>
                      <el-input-number v-model="editingMapping.header_start" :min="1" :max="10" size="small" />
                    </div>
                    <div class="editor-field" style="width:90px">
                      <label class="editor-label">表头结束行</label>
                      <el-input-number v-model="editingMapping.header_end" :min="1" :max="10" size="small" />
                    </div>
                  </div>

                  <!-- 主键映射 -->
                  <div class="editor-section">
                    <div class="editor-section-header">
                      <span>主键映射</span>
                      <button class="add-row-btn" :disabled="!editingMapping.source_fields?.length" @click="addKeyMapEntry">+ 新增</button>
                    </div>
                    <div v-if="!editingMapping.source_fields?.length" class="derived-empty">请先上传样表解析源字段后再维护映射</div>
                    <div class="map-table">
                      <div class="map-row map-row-head">
                        <span>源列名</span><span>→</span><span>标准主键</span><span></span>
                      </div>
                      <div class="map-row" v-for="(entry, ei) in editingKeyMapEntries" :key="ei">
                        <el-select v-model="entry.key" size="small" filterable
                          placeholder="选择源列名" @change="syncKeyMap(editingKeyMapEntries)">
                          <el-option v-for="field in editingMapping.source_fields || []" :key="field" :label="field" :value="field" />
                        </el-select>
                        <span class="map-arrow">→</span>
                        <el-select v-model="entry.val" size="small" filterable
                          @change="syncKeyMap(editingKeyMapEntries)">
                          <el-option v-for="k in form.merge_keys" :key="k" :label="k" :value="k" />
                        </el-select>
                        <button class="del-row-btn" @click="() => { editingKeyMapEntries.splice(ei,1); syncKeyMap(editingKeyMapEntries) }">×</button>
                      </div>
                    </div>
                  </div>

                  <!-- 字段映射 -->
                  <div class="editor-section">
                    <div class="editor-section-header">
                      <span>字段映射</span>
                      <button class="add-row-btn" :disabled="!editingMapping.source_fields?.length" @click="addColumnMapEntry">+ 新增</button>
                    </div>
                    <div v-if="!editingMapping.source_fields?.length" class="derived-empty">请先上传样表解析源字段后再维护映射</div>
                    <div class="map-table">
                      <div class="map-row map-row-head">
                        <span>源列名</span><span>→</span><span>标准字段</span><span></span>
                      </div>
                      <div class="map-row" v-for="(entry, ei) in editingColMapEntries" :key="ei">
                        <el-select v-model="entry.key" size="small" filterable
                          placeholder="选择源列名" @change="syncColumnMap(editingColMapEntries)">
                          <el-option v-for="field in editingMapping.source_fields || []" :key="field" :label="field" :value="field" />
                        </el-select>
                        <span class="map-arrow">→</span>
                        <el-select v-model="entry.val" size="small" filterable
                          @change="syncColumnMap(editingColMapEntries)">
                          <el-option v-for="f in form.std_fields" :key="f" :label="f" :value="f" />
                        </el-select>
                        <button class="del-row-btn" @click="() => { editingColMapEntries.splice(ei,1); syncColumnMap(editingColMapEntries) }">×</button>
                      </div>
                    </div>
                  </div>

                  <!-- 派生字段 -->
                  <div class="editor-section">
                    <div class="editor-section-header">
                      <span>派生字段</span>
                      <button class="add-row-btn" @click="addDerivedField">+ 新增</button>
                    </div>
                    <div v-if="!editingMapping.derived_fields?.length" class="derived-empty">
                      无派生字段（如需要可添加计算公式）
                    </div>
                    <div class="derived-row" v-for="(df, di) in editingMapping.derived_fields" :key="di">
                      <el-select v-model="df.target" size="small" filterable
                        placeholder="目标标准字段" style="width:140px">
                        <el-option v-for="f in form.std_fields" :key="f" :label="f" :value="f" />
                      </el-select>
                      <span class="map-arrow">=</span>
                      <el-input v-model="df.expr" size="small" placeholder="{标准字段A}+{标准字段B}" style="flex:1" />
                      <el-input-number v-model="df.round" :min="0" :max="6" size="small"
                        style="width:80px" :controls="false" placeholder="小数位" />
                      <button class="del-row-btn" @click="removeDerivedField(di)">×</button>
                    </div>
                  </div>

                  <!-- 操作按钮 -->
                  <div class="editor-actions">
                    <PermissionButton menu="table_tools" op="D" size="small" type="danger" @click="removeMapping(idx)">删除映射</PermissionButton>
                    <el-button size="small" @click="cancelEditMapping">取消</el-button>
                    <el-button size="small" type="primary" :icon="CircleCheck" @click="saveEditMapping">
                      确认修改
                    </el-button>
                  </div>

                  <!-- AI 备注 -->
                  <div v-if="aiLowConfidence(m.name)?.notes" class="ai-notes">
                    ⚠ {{ aiLowConfidence(m.name)?.notes }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        </template>

        <section v-if="editingId && activeConfigTab === 'key'" class="advanced-config-panel">
          <div class="config-panel-head">
            <div>
              <h3 class="section-title">主键值映射</h3>
              <p class="section-desc">仅对当前模板生效；每条记录是一组完整联合主键，源主键值经过精确匹配后，整体统一归集到目标主键值。</p>
            </div>
            <PermissionButton menu="table_tools" op="U" type="primary" size="small" :icon="Plus" @click="startKeyMapping()">新增映射</PermissionButton>
          </div>
          <div v-if="keyMappingDraft" class="config-editor key-mapping-editor">
            <div class="key-mapping-editor-title">完整联合主键映射组</div>
            <p class="key-mapping-editor-tip">两侧字段必须完整填写，并作为一组同时精确匹配；不能按单个字段拆分维护。</p>
            <div class="key-map-groups">
              <div class="key-map-group">
                <div class="key-map-group-head"><strong>源主键组合</strong><span>匹配条件</span></div>
                <div v-for="field in form.merge_keys" :key="field" class="key-map-field">
                  <label>{{ field }}</label>
                  <el-input v-model="keyMappingDraft.source_key[field]" placeholder="原始值" />
                </div>
              </div>
              <div class="key-map-arrow" aria-hidden="true">整组映射 →</div>
              <div class="key-map-group">
                <div class="key-map-group-head"><strong>归集统一主键组合</strong><span>归集结果</span></div>
                <div v-for="field in form.merge_keys" :key="field" class="key-map-field">
                  <label>{{ field }}</label>
                  <el-input v-model="keyMappingDraft.canonical_merge_key[field]" placeholder="统一值" />
                </div>
              </div>
            </div>
            <el-checkbox v-model="keyMappingDraft.enabled">启用该映射组</el-checkbox>
            <div class="config-editor-actions">
              <el-button size="small" @click="cancelKeyMapping">取消</el-button>
              <PermissionButton menu="table_tools" op="U" type="primary" size="small" :loading="keyMappingSaving" @click="saveKeyMapping">保存映射组</PermissionButton>
            </div>
          </div>
          <el-empty v-if="!keyMappings.length && !keyMappingDraft" description="暂无主键值映射" />
          <div v-for="item in keyMappings" :key="item.id" class="config-list-row key-mapping-list-row">
            <div class="key-mapping-summary">
              <div class="key-mapping-block">
                <span class="key-mapping-block-label">源主键组合</span>
                <span v-for="field in form.merge_keys" :key="field" class="key-pair">{{ field }}＝{{ item.source_key[field] }}</span>
              </div>
              <span class="key-mapping-summary-arrow" aria-hidden="true">整组映射 →</span>
              <div class="key-mapping-block">
                <span class="key-mapping-block-label">归集统一主键组合</span>
                <span v-for="field in form.merge_keys" :key="field" class="key-pair">{{ field }}＝{{ item.canonical_merge_key[field] }}</span>
              </div>
            </div>
            <el-tag size="small" :type="item.enabled ? 'success' : 'info'">{{ item.enabled ? '启用' : '停用' }}</el-tag>
            <el-button link size="small" @click="startKeyMapping(item)">编辑</el-button>
            <PermissionButton menu="table_tools" op="D" link type="danger" size="small" @click="removeKeyMapping(item)">删除</PermissionButton>
          </div>
        </section>

        <section v-if="editingId && activeConfigTab === 'dwd'" class="advanced-config-panel">
          <div class="config-panel-head">
            <div>
              <h3 class="section-title">DWD 关联</h3>
              <p class="section-desc">选择当前用户可访问的 DWD 数据集，实际关联会按该数据集查询。</p>
            </div>
            <PermissionButton menu="table_tools" op="U" type="primary" size="small" :icon="Plus" @click="startDwdRelation()">新增关联</PermissionButton>
          </div>
          <div v-if="dwdRelationDraft" class="config-editor">
            <div class="editor-row">
              <div class="editor-field"><label class="editor-label">关联名称</label><el-input v-model="dwdRelationDraft.name" /></div>
              <div class="editor-field"><label class="editor-label">DWD 数据集</label><el-select v-model="dwdRelationDraft.dataset_id" filterable :loading="dwdFieldsLoading" placeholder="选择当前用户可访问的 DWD 数据集" style="width:100%" @change="selectDwdDataset"><el-option v-for="source in dwdSources" :key="source.dataset_id" :value="source.dataset_id" :label="source.dataset_label || source.dataset_name" /></el-select><p v-if="dwdRelationDraft.report_id && !dwdRelationDraft.dataset_id" class="config-muted">当前为历史报表来源，选择数据集后会迁移为数据集关联。</p><p v-if="!dwdSources.length" class="config-muted">暂无可选来源。请确认当前用户已获得数据集授权，且数据集为已启用、已发布的 DWD 数据集。</p></div>
            </div>
            <div class="field-group"><label class="field-label">关联字段</label><div v-for="(_, index) in (dwdRelationDraft.left_fields || [])" :key="index" class="dwd-pair-row"><el-select v-model="dwdRelationDraft.left_fields![index]" placeholder="归集字段"><el-option v-for="field in [...form.merge_keys, ...form.std_fields]" :key="field" :value="field" :label="field" /></el-select><span>＝</span><el-select v-model="dwdRelationDraft.right_fields![index]" placeholder="DWD 字段"><el-option v-for="field in dwdFields" :key="field.code" :value="field.code" :label="`${field.label}（${field.code}）`" /></el-select><el-button link type="danger" @click="removeDwdPair(index)">删除</el-button></div><el-button size="small" @click="addDwdPair">新增字段对</el-button></div>
            <div class="field-group"><label class="field-label">补充字段</label><el-select v-model="dwdRelationDraft.select_fields" multiple filterable :loading="dwdFieldsLoading" placeholder="选择要补充到结果的 DWD 字段" style="width:100%"><el-option v-for="field in dwdFields" :key="field.code" :value="field.code" :label="`${field.label}（${field.code}）`" /></el-select></div>
            <div class="editor-row"><div class="editor-field"><label class="editor-label">未命中策略</label><el-select v-model="dwdRelationDraft.missing_policy"><el-option label="记录异常" value="anomaly" /><el-option label="跳过异常" value="skip" /></el-select></div><div class="editor-field"><label class="editor-label">多命中策略</label><el-select v-model="dwdRelationDraft.multiple_policy"><el-option label="记录异常" value="anomaly" /><el-option label="取第一条" value="first" /></el-select></div></div>
            <el-checkbox v-model="dwdRelationDraft.enabled">启用</el-checkbox>
            <div class="config-editor-actions"><el-button size="small" @click="cancelDwdRelation">取消</el-button><PermissionButton menu="table_tools" op="U" type="primary" size="small" :loading="dwdRelationSaving" @click="saveDwdRelation">保存</PermissionButton></div>
          </div>
          <el-empty v-if="!dwdRelations.length && !dwdRelationDraft" description="暂无 DWD 关联" />
          <div v-for="item in dwdRelations" :key="item.id" class="config-list-row"><div><strong>{{ item.name }}</strong><span class="config-muted">{{ dwdSources.find((source) => source.dataset_id === item.dataset_id)?.dataset_name || (item.report_id ? `历史报表 #${item.report_id}` : `数据集 #${item.dataset_id}`) }}</span></div><el-tag size="small" :type="item.enabled ? 'success' : 'info'">{{ item.enabled ? '启用' : '停用' }}</el-tag><el-button link size="small" @click="startDwdRelation(item)">编辑</el-button><PermissionButton menu="table_tools" op="D" link type="danger" size="small" @click="removeDwdRelation(item)">删除</PermissionButton></div>
        </section>

        <section v-if="editingId && activeConfigTab === 'output'" class="advanced-config-panel">
          <div class="config-panel-head">
            <div>
              <h3 class="section-title">信息输出</h3>
              <p class="section-desc">决定归集结果的导出字段与列顺序；空清单 = 全部输出。</p>
            </div>
          </div>
          <OutputFieldsEditor v-model="form.output_fields" :candidates="outputFieldCandidates" :labels="outputFieldLabels" />
        </section>
        </template>
      </div>
    </Teleport>

    <!-- ═══════════════════════════════════════════════════════
         月度合并页（全页面，无抽屉）
    ════════════════════════════════════════════════════════ -->
    <template v-else-if="mode === 'mapping'">
      <div class="build-topbar">
        <button class="back-btn" @click="mode = 'list'">
          <el-icon><ArrowLeft /></el-icon>
          <span>返回模板列表</span>
        </button>
        <h2 class="build-title">为「{{ mappingWizardTemplate?.name }}」新增源映射</h2>
        <div class="build-topbar-actions">
          <el-button @click="mode = 'list'">取消</el-button>
          <el-button v-if="mappingWizardStep === 'confirm'" type="primary" :loading="mappingWizardSaving" @click="saveMappingDrafts">
            保存 {{ mappingWizardDrafts.length }} 条映射
          </el-button>
        </div>
      </div>

      <template v-if="mappingWizardStep === 'upload'">
        <div class="build-upload-wrap">
          <div class="upload-panel">
            <h3 class="upload-heading">上传数据源样表</h3>
            <p class="upload-sub">支持批量拖拽 Excel 文件；系统将基于当前模板的标准字段和归集主键自动生成源映射草稿。</p>
            <el-upload drag multiple :auto-upload="false" :show-file-list="false" accept=".xlsx"
              :on-change="handleMappingWizardFile" class="upload-dragger">
              <el-icon class="upload-icon"><Upload /></el-icon>
              <div class="upload-text">拖拽样表到此处，或 <em>点击选择</em></div>
              <div class="upload-hint">可一次选择多个 .xlsx 文件；仅解析 Sheet 和表头</div>
            </el-upload>
            <div v-if="mappingWizardFiles.length" class="file-chips">
              <div v-for="(file, index) in mappingWizardFiles" :key="`${file.name}-${file.size}`" class="file-chip">
                <el-icon><Document /></el-icon>
                <span>{{ file.name }}</span>
                <button class="chip-remove" @click="removeMappingWizardFile(index)">×</button>
              </div>
            </div>
            <div class="context-wrap">
              <label class="context-label">业务背景（可选）</label>
              <el-input v-model="mappingWizardContext" type="textarea" :rows="3"
                placeholder="例如：本批样表为各城市社保、公积金明细；请优先识别员工标识与缴费字段。" />
            </div>
            <div class="upload-actions">
              <el-button @click="mode = 'list'">取消</el-button>
              <el-button type="primary" :icon="MagicStick" :disabled="!mappingWizardFiles.length" @click="runMappingDrafts">
                AI 识别 {{ mappingWizardFiles.length }} 个样表
              </el-button>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="mappingWizardStep === 'ai'">
        <div class="ai-loading-wrap">
          <div class="ai-spinner"><div class="spinner-ring" /><el-icon class="spinner-icon"><MagicStick /></el-icon></div>
          <h3 class="ai-loading-title">AI 正在识别样表映射</h3>
          <p class="ai-loading-sub">正在分析 {{ mappingWizardFiles.length }} 个样表的 Sheet、表头和字段映射关系，请稍候。</p>
        </div>
      </template>

      <template v-else>
        <div class="mapping-confirm-wrap">
          <div class="mapping-confirm-intro">
            <div>
              <h3>确认本次新增映射</h3>
              <p>AI 会优先复用已有标准字段；识别到新的业务字段时会自动加入当前模板，序号、备注、说明等辅助字段会自动忽略。</p>
            </div>
            <el-button @click="mappingWizardStep = 'upload'">重新上传样表</el-button>
          </div>
          <el-alert title="请确认映射名称和表头识别特征；带有低置信度提示的映射建议重点检查。" type="warning" :closable="false" show-icon />
          <div class="mapping-confirm-list">
            <div v-for="(mapping, index) in mappingWizardDrafts" :key="`${mapping.name}-${index}`" class="mapping-confirm-card">
              <div class="mapping-confirm-card-head">
                <div>
                  <strong>样表 {{ index + 1 }}</strong>
                  <span v-if="mapping.sheet_kw">Sheet：{{ mapping.sheet_kw }}</span>
                </div>
                <el-button text type="danger" :icon="Delete" @click="removeMappingWizardDraft(index)">移除</el-button>
              </div>
              <div class="editor-row">
                <div class="editor-field">
                  <label class="editor-label">映射名称</label>
                  <el-input v-model="mapping.name" />
                </div>
                <div class="editor-field">
                  <label class="editor-label">表头识别特征（至少 3 项）</label>
                  <el-input :model-value="(mapping.match_signature || []).join(',')"
                    @update:model-value="mapping.match_signature = $event.split(',').map((value: string) => value.trim()).filter(Boolean)" />
                </div>
              </div>
              <div class="mapping-confirm-meta">
                <span v-if="mapping.new_std_fields?.length">新增标准字段：{{ mapping.new_std_fields.join('、') }}</span>
                <span>表头行：{{ mapping.header_start }} 至 {{ mapping.header_end }}</span>
                <span>主键映射 {{ Object.keys(mapping.key_map || {}).length }} 项</span>
                <span>字段映射 {{ Object.keys(mapping.column_map || {}).length }} 项</span>
                <span>派生字段 {{ mapping.derived_fields?.length || 0 }} 项</span>
              </div>
              <div v-if="Number(mapping._confidence || 0) < 0.85" class="ai-notes">
                AI 置信度 {{ Math.round(Number(mapping._confidence || 0) * 100) }}%：{{ mapping._notes || '请人工确认该映射。' }}
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>
    <template v-else-if="mode === 'merge'">
      <div class="build-topbar">
        <button class="back-btn" @click="mode = 'list'">
          <el-icon><ArrowLeft /></el-icon>
          <span>返回模板列表</span>
        </button>
        <h2 class="build-title">合并 · {{ mergeTemplate?.name }}</h2>
        <div class="build-topbar-actions">
          <PermissionButton menu="table_tools" op="E" :icon="Download" :loading="downloading"
            :disabled="!mergeFiles.length" @click="downloadResult">
            下载完整结果
          </PermissionButton>
          <el-button type="primary" :loading="merging"
            :disabled="!mergeFiles.length" @click="runMerge">
            运行预览
          </el-button>
          <PermissionButton menu="table_tools" op="V" type="success" :loading="savingResult"
            :disabled="!mergeResult?.preview_token" @click="saveCurrentResult">
            保存结果
          </PermissionButton>
        </div>
      </div>

      <div class="merge-layout">
        <!-- 左侧：上传区 -->
        <div class="merge-left">
          <h3 class="section-title">上传文件</h3>
          <el-upload
            drag multiple :auto-upload="false" :show-file-list="false"
            accept=".xlsx" :on-change="handleMergeFileChange"
            class="upload-dragger upload-dragger--sm">
            <el-icon class="upload-icon" style="font-size:28px"><Upload /></el-icon>
            <div class="upload-text" style="font-size:13px">拖拽或点击选择 Excel 文件</div>
          </el-upload>

          <div v-if="mergeFiles.length" class="file-chips" style="margin-top:12px">
            <div class="file-chip" v-for="(f, i) in mergeFiles" :key="i">
              <el-icon><Document /></el-icon>
              <span>{{ f.name }}</span>
              <button class="chip-remove" @click="removeMergeFile(i)">×</button>
            </div>
          </div>

          <!-- 识别日志 -->
          <div v-if="mergeResult?.recognize_log?.length" class="log-panel">
            <h4 class="log-title">识别日志 <span class="log-count">{{ mergeResult.recognize_log.length }} 个命中</span></h4>
            <div class="log-row" v-for="(l, i) in mergeResult.recognize_log" :key="i">
              <span class="log-score" :class="l.score >= 0.9 ? 'good' : 'warn'">
                {{ Math.round(l.score * 100) }}%
              </span>
              <span class="log-file">{{ l.file }}</span>
              <span class="log-sheet">/ {{ l.sheet }}</span>
            </div>
          </div>

          <!-- 异常 -->
          <div v-if="mergeResult?.anomalies?.length" class="anomaly-panel">
            <h4 class="log-title danger">异常 <span class="log-count">{{ mergeResult.anomalies.length }} 条</span></h4>
            <div class="anomaly-row" v-for="(a, i) in mergeResult.anomalies" :key="i">
              <el-tag type="danger" size="small">{{ a.type }}</el-tag>
              <span class="anomaly-detail">{{ a.detail }}</span>
            </div>
          </div>
          <div v-if="mergeResult?.dwd_anomalies?.length" class="anomaly-panel">
            <h4 class="log-title danger">DWD 关联异常 <span class="log-count">{{ mergeResult.dwd_anomalies.length }} 条</span></h4>
            <div class="anomaly-row" v-for="(a, i) in mergeResult.dwd_anomalies" :key="i">
              <el-tag type="warning" size="small">{{ a.type }}</el-tag>
              <span class="anomaly-detail">{{ a.detail }}</span>
            </div>
          </div>
          <details v-if="mergeResult?.raw_key_traces?.length" class="trace-panel">
            <summary>原始主键追踪（{{ mergeResult.raw_key_traces.length }} 条）</summary>
            <pre>{{ JSON.stringify(mergeResult.raw_key_traces, null, 2) }}</pre>
          </details>
        </div>

        <div class="merge-right">
          <!-- 统计卡片 -->
          <div v-if="mergeResult" class="stat-cards">
            <div class="stat-card">
              <div class="stat-val">{{ mergeResult.stats.files }}</div>
              <div class="stat-label">文件</div>
            </div>
            <div class="stat-card">
              <div class="stat-val">{{ mergeResult.stats.records }}</div>
              <div class="stat-label">原始记录</div>
            </div>
            <div class="stat-card highlight">
              <div class="stat-val">{{ mergeResult.stats.persons }}</div>
              <div class="stat-label">归集人数</div>
            </div>
            <div class="stat-card" :class="mergeResult.stats.anomalies ? 'danger' : ''">
              <div class="stat-val">{{ mergeResult.stats.anomalies }}</div>
              <div class="stat-label">异常</div>
            </div>
            <div v-if="mergeResult.key_mapping_stats" class="stat-card">
              <div class="stat-val">{{ mergeResult.key_mapping_stats.matched }}/{{ mergeResult.key_mapping_stats.configured }}</div>
              <div class="stat-label">主键映射命中</div>
            </div>
          </div>

          <!-- 预览表格 -->
          <div v-if="mergeResult?.rows?.length" class="preview-wrap">
            <div class="preview-header">
              <span>预览前 {{ mergeResult.rows.length }} 行 / 共 {{ mergeResult.total_rows }} 行</span>
            </div>
            <el-table :data="mergeResult.rows" size="small" border
              max-height="600" style="font-size:12px; width:100%">
              <el-table-column
                v-for="col in mergeResultCols" :key="col"
                :prop="col" :label="mergeColumnLabel(col)" min-width="110" show-overflow-tooltip />
            </el-table>
          </div>

          <div v-if="historyResult" class="preview-wrap" v-loading="historyLoading">
            <div class="preview-header">
              <span>{{ historyResult.batch.period === 'CURRENT' ? '当前快照' : `历史结果 · ${historyResult.batch.period}` }} · 共 {{ historyResult.total_rows }} 行</span>
              <PermissionButton menu="table_tools" op="E" size="small" @click="downloadResultBatch(historyResult.batch)">下载结果</PermissionButton>
            </div>
            <el-table :data="historyResult.rows" size="small" border max-height="500" style="font-size:12px; width:100%">
              <el-table-column v-for="col in historyResultCols" :key="col" :prop="col" :label="historyColumnLabel(col)" min-width="110" show-overflow-tooltip />
            </el-table>
          </div>
          <div v-if="resultBatches.length" class="history-panel">
            <div class="preview-header"><strong>结果快照</strong><span>使用保存时的结果快照</span></div>
            <div v-for="batch in resultBatches" :key="batch.id" class="history-row">
              <span>{{ batch.period === 'CURRENT' ? '当前快照' : batch.period }} · {{ batch.row_count }} 行</span>
              <span>
                <el-button text size="small" @click="viewResultBatch(batch)">查看</el-button>
                <el-button text size="small" @click="downloadResultBatch(batch)">下载</el-button>
              </span>
            </div>
          </div>

          <div v-else-if="!merging" class="merge-empty">
            <el-icon style="font-size:40px;color:var(--color-text-placeholder)"><Upload /></el-icon>
            <p>上传文件后点击「运行预览」查看归集结果</p>
          </div>

          <div v-if="merging" class="merge-loading">
            <div class="spinner-ring" style="width:32px;height:32px;border-width:3px" />
            <span>归集计算中…</span>
          </div>
        </div>
      </div>
    </template>

  </div>
</template>

<style scoped>
  .config-tabs-wrap {
    margin-bottom: 20px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 0 16px;
  }
  .editor-fullscreen .config-tabs-wrap {
    display: none;
    border-radius: 0;
  }
  .advanced-config-panel {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 24px;
  }
  .config-panel-head, .config-list-row, .config-editor-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .config-panel-head { justify-content: space-between; margin-bottom: 20px; }
  .config-editor { padding: 16px; margin-bottom: 16px; background: var(--color-bg-page); border-radius: var(--radius-md); }
  .key-mapping-editor-title { font-size: 15px; font-weight: 600; }
  .key-mapping-editor-tip { margin: 6px 0 16px; color: var(--color-text-secondary); font-size: 13px; }
  .key-map-groups { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 16px; align-items: center; margin: 16px 0; }
  .key-map-group { padding: 16px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg-card); }
  .key-map-group-head { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 12px; color: var(--color-text-secondary); font-size: 12px; }
  .key-map-group-head strong { color: var(--color-text-primary); font-size: 14px; }
  .key-map-field { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 10px; align-items: center; }
  .key-map-field + .key-map-field { margin-top: 10px; }
  .key-map-field label { color: var(--color-text-secondary); font-size: 13px; }
  .key-map-arrow, .key-mapping-summary-arrow { color: var(--color-primary); font-size: 13px; font-weight: 600; white-space: nowrap; }
  .key-mapping-summary { display: flex; flex: 1; gap: 14px; align-items: center; }
  .key-mapping-block { display: flex; flex: 1; flex-wrap: wrap; gap: 6px 12px; }
  .key-mapping-block-label { width: 100%; color: var(--color-text-secondary); font-size: 12px; }
  .key-pair { font-size: 13px; }
  .key-mapping-list-row { align-items: flex-start; }
  @media (max-width: 900px) {
    .key-map-groups { grid-template-columns: 1fr; }
    .key-map-arrow { justify-self: center; }
    .key-mapping-summary { flex-direction: column; align-items: stretch; }
    .key-mapping-summary-arrow { align-self: center; }
  }
  .config-muted { display: block; margin-top: 4px; color: var(--color-text-secondary); font-size: 12px; }
  .dwd-pair-row { display: grid; grid-template-columns: 1fr 24px 1fr auto; gap: 8px; align-items: center; margin-bottom: 8px; }
  .trace-panel { margin-top: 16px; border-top: 1px solid var(--color-border); padding-top: 12px; color: var(--color-text-secondary); font-size: 12px; }
  .trace-panel summary { cursor: pointer; }
  .trace-panel pre { max-height: 220px; overflow: auto; margin-top: 8px; white-space: pre-wrap; }

.editor-fullscreen {
  position: fixed;
  z-index: 2000;
  inset: 0;
  width: 100vw;
  height: 100vh;
  min-height: 100vh;
  overflow-y: auto;
  padding: 0 32px 24px;
  background: var(--color-bg-page);
}

.editor-fullscreen .build-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  margin: 0 -32px 24px;
  padding: 16px 32px;
  background: var(--color-bg-page);
  border-bottom: 1px solid var(--color-border);
  box-shadow: 0 2px 8px rgb(15 23 42 / 6%);
}

.tt-root {
  min-height: calc(100vh - var(--layout-topbar-height));
  background: var(--color-bg-page);
  padding: 24px;
}

/* ── 列表页 ─────────────────────────────────────────────── */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 4px;
}
.page-desc {
  font-size: 13px;
  color: var(--color-text-placeholder);
  margin: 0;
}

.list-loading { display: flex; flex-direction: column; gap: 12px; }
.skeleton {
  height: 88px;
  border-radius: var(--radius-lg);
  background: linear-gradient(90deg, #eef1f6 25%, #f8fafc 50%, #eef1f6 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}
@keyframes shimmer { to { background-position: -200% 0; } }

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 80px 0;
  color: var(--color-text-placeholder);
}
.empty-icon { font-size: 48px; }

.tpl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 12px;
}
.tpl-card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 16px;
  transition: border-color var(--duration-fast), box-shadow var(--duration-fast);
}
.tpl-card:hover {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-card);
}
.tpl-card-body { display: flex; gap: 12px; margin-bottom: 14px; }
.tpl-card-icon {
  width: 40px; height: 40px; flex-shrink: 0;
  border-radius: var(--radius-md);
  background: var(--color-primary-light);
  color: var(--color-primary);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px;
}
.tpl-name { font-size: 15px; font-weight: 600; color: var(--color-text-primary); margin-bottom: 3px; }
.tpl-desc { font-size: 12px; color: var(--color-text-secondary); margin-bottom: 6px; }
.tpl-meta { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.meta-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  background: var(--color-primary-light);
  color: var(--color-primary);
}
.meta-dot { color: var(--color-text-placeholder); }
.meta-count { font-size: 12px; color: var(--color-text-secondary); }
.tpl-card-actions { display: flex; gap: 6px; justify-content: flex-end; }

/* ── 共用：顶部导航栏 ───────────────────────────────────── */
.build-topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-border);
}
.workflow-steps {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1;
  justify-content: center;
  gap: 4px;
}
.workflow-step {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  border: 0;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 6px 4px;
  font-size: 14px;
  white-space: nowrap;
}
.workflow-step.active { color: var(--color-primary); font-weight: 600; }
.workflow-step:hover { color: var(--color-primary); }
.workflow-step-arrow { color: var(--color-text-placeholder); font-size: 22px; line-height: 1; }
.back-btn {
  display: flex; align-items: center; gap: 4px;
  font-size: 13px; color: var(--color-text-secondary);
  background: none; border: none; cursor: pointer; padding: 4px 0;
  transition: color var(--duration-fast);
}
.back-btn:hover { color: var(--color-primary); }
.build-title { flex: 1; font-size: 17px; font-weight: 600; color: var(--color-text-primary); margin: 0; }
.build-topbar-actions { display: flex; gap: 8px; }

/* ── 上传步骤 ───────────────────────────────────────────── */
.build-upload-wrap {
  display: flex; justify-content: center; padding: 40px 0;
}
.upload-panel {
  width: 100%; max-width: 600px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 32px;
}
.upload-heading { font-size: 17px; font-weight: 600; margin: 0 0 6px; color: var(--color-text-primary); }
.upload-sub { font-size: 13px; color: var(--color-text-secondary); margin: 0 0 20px; }

.upload-dragger :deep(.el-upload-dragger) {
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-subtle);
  transition: border-color var(--duration-fast), background var(--duration-fast);
  padding: 28px 20px;
}
.upload-dragger :deep(.el-upload-dragger:hover) {
  border-color: var(--color-primary);
  background: var(--color-primary-subtle);
}
.upload-dragger--sm :deep(.el-upload-dragger) { padding: 18px 16px; }
.upload-icon { font-size: 36px; color: var(--color-text-placeholder); }
.upload-text {
  margin-top: 10px; font-size: 14px; color: var(--color-text-regular);
}
.upload-text em { color: var(--color-primary); font-style: normal; }
.upload-hint { margin-top: 4px; font-size: 12px; color: var(--color-text-placeholder); }

.file-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.file-chip {
  display: flex; align-items: center; gap: 5px;
  padding: 4px 8px 4px 6px;
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  font-size: 12px; color: var(--color-text-regular);
}
.chip-remove {
  background: none; border: none; cursor: pointer;
  color: var(--color-text-placeholder); padding: 0; font-size: 14px; line-height: 1;
}
.chip-remove:hover { color: var(--color-danger); }

.context-wrap { margin-top: 20px; }
.context-label { display: block; font-size: 13px; color: var(--color-text-secondary); margin-bottom: 6px; }

.upload-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }

/* ── AI 加载 ────────────────────────────────────────────── */
.ai-loading-wrap {
  display: flex; flex-direction: column; align-items: center;
  padding: 100px 0; gap: 16px;
}
.ai-spinner {
  position: relative; width: 64px; height: 64px;
}
.spinner-ring {
  width: 100%; height: 100%;
  border-radius: 50%;
  border: 3px solid var(--color-primary-light);
  border-top-color: var(--color-primary);
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.spinner-icon {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; color: var(--color-primary);
}
.ai-loading-title { font-size: 18px; font-weight: 600; margin: 0; color: var(--color-text-primary); }
.ai-loading-sub { font-size: 14px; color: var(--color-text-secondary); margin: 0; }

/* ── 置信度警告 ─────────────────────────────────────────── */
.confidence-alert {
  display: flex; align-items: flex-start; gap: 8px;
  background: var(--color-warning-light);
  border: 1px solid var(--color-warning-border);
  border-radius: var(--radius-md);
  padding: 10px 14px;
  font-size: 13px; color: var(--color-text-regular);
  margin-bottom: 16px;
}

/* ── 建模表单（左右分栏） ───────────────────────────────── */
.build-layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 20px;
  align-items: start;
}

.build-left {
  display: flex; flex-direction: column; gap: 16px;
}
.build-right {
  min-width: 0;
}

.form-section {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 18px;
}
.section-title {
  font-size: 14px; font-weight: 600; color: var(--color-text-primary);
  margin: 0 0 4px;
}
.required-mark { color: var(--color-danger); }
.section-desc { font-size: 12px; color: var(--color-text-secondary); margin: 0 0 10px; }

.field-group { margin-bottom: 14px; }
.field-group:last-child { margin-bottom: 0; }
.field-label {
  display: block; font-size: 12px; color: var(--color-text-secondary);
  margin-bottom: 5px;
}
.field-label.required::after { content: ' *'; color: var(--color-danger); }

.std-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; min-height: 24px; }
.std-tag { font-size: 12px; cursor: grab; }
.std-tag:active { cursor: grabbing; }
.std-add { display: flex; gap: 6px; }

/* ── 映射列表 ───────────────────────────────────────────── */
.mappings-header {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 4px;
}
.mappings-count {
  font-size: 12px; color: var(--color-text-placeholder);
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  padding: 1px 8px;
}
.mappings-empty {
  padding: 40px;
  text-align: center;
  color: var(--color-text-placeholder);
  font-size: 13px;
  background: var(--color-bg-card);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
}
.mapping-list { display: flex; flex-direction: column; gap: 8px; }

.mapping-item {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: border-color var(--duration-fast);
}
.mapping-item.expanded { border-color: var(--color-primary); }

.mapping-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; cursor: pointer;
  user-select: none;
  transition: background var(--duration-fast);
}
.mapping-header:hover { background: var(--color-bg-subtle); }
.mapping-header-left { display: flex; align-items: center; gap: 10px; }
.mapping-chevron {
  font-size: 16px; color: var(--color-text-placeholder);
  transition: transform var(--duration-fast);
  line-height: 1;
}
.mapping-chevron.rotated { transform: rotate(90deg); }
.mapping-name { font-size: 13px; font-weight: 500; color: var(--color-text-primary); }
.mapping-meta { font-size: 11px; color: var(--color-text-placeholder); margin-top: 2px; }
.mapping-meta span + span { margin-left: 4px; }

/* ── 映射编辑器 ─────────────────────────────────────────── */
.mapping-editor {
  border-top: 1px solid var(--color-border);
  padding: 16px;
  background: var(--color-bg-subtle);
}
.editor-row { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.editor-field { display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 120px; }
.editor-label { font-size: 12px; color: var(--color-text-secondary); }

.editor-section { margin-bottom: 16px; }
.editor-section-header {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 12px; font-weight: 600; color: var(--color-text-secondary);
  margin-bottom: 8px;
  text-transform: uppercase; letter-spacing: 0.5px;
}
.add-row-btn {
  font-size: 12px; color: var(--color-primary);
  background: none; border: none; cursor: pointer; padding: 0;
}
.add-row-btn:hover { text-decoration: underline; }

.map-table { display: flex; flex-direction: column; gap: 6px; }
.map-row {
  display: grid;
  grid-template-columns: 1fr 24px 1fr 24px;
  gap: 6px; align-items: center;
}
.map-row-head {
  font-size: 11px; color: var(--color-text-placeholder);
  padding: 0 2px;
}
.map-arrow {
  text-align: center; font-size: 13px;
  color: var(--color-text-placeholder);
}
.del-row-btn {
  background: none; border: none; cursor: pointer;
  color: var(--color-text-placeholder); font-size: 15px; padding: 0;
  text-align: center; line-height: 1;
  transition: color var(--duration-fast);
}
.del-row-btn:hover { color: var(--color-danger); }

.derived-empty {
  font-size: 12px; color: var(--color-text-placeholder);
  padding: 8px 0;
}
.derived-row {
  display: flex; gap: 6px; align-items: center; margin-bottom: 6px;
}

.editor-actions {
  display: flex; justify-content: flex-end; gap: 8px;
  margin-top: 8px; padding-top: 12px;
  border-top: 1px solid var(--color-border-light);
}
.ai-notes {
  margin-top: 10px; padding: 8px 10px;
  background: var(--color-warning-light);
  border-radius: var(--radius-sm);
  font-size: 12px; color: var(--color-text-regular);
}

/* ── 合并页 ─────────────────────────────────────────────── */
.mapping-confirm-wrap { max-width: 1060px; margin: 0 auto; }
.mapping-confirm-intro {
  display: flex; justify-content: space-between; gap: 20px; align-items: flex-start;
  margin-bottom: 16px;
}
.mapping-confirm-intro h3 { margin: 0; font-size: 18px; color: var(--color-text-primary); }
.mapping-confirm-intro p { margin: 7px 0 0; font-size: 13px; color: var(--color-text-secondary); }
.mapping-confirm-list { display: flex; flex-direction: column; gap: 14px; margin-top: 16px; }
.mapping-confirm-card {
  padding: 18px; background: var(--color-bg-card); border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}
.mapping-confirm-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.mapping-confirm-card-head strong { color: var(--color-text-primary); }
.mapping-confirm-card-head span { margin-left: 10px; color: var(--color-text-secondary); font-size: 12px; }
.mapping-confirm-meta { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--color-text-secondary); }

@media (max-width: 768px) {
  .mapping-confirm-intro { flex-direction: column; }
}
.merge-layout {  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 20px;
  align-items: start;
}
.merge-left {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 18px;
  position: sticky;
  top: calc(var(--layout-topbar-height) + 24px);
}
.merge-right { min-width: 0; }

.log-panel { margin-top: 16px; }
.log-title {
  font-size: 12px; font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase; letter-spacing: 0.5px;
  margin: 0 0 8px;
}
.log-title.danger { color: var(--color-danger); }
.log-count {
  font-size: 11px; font-weight: 400;
  color: var(--color-text-placeholder);
  text-transform: none; letter-spacing: 0;
  margin-left: 6px;
}
.log-row {
  display: flex; align-items: baseline; gap: 6px;
  font-size: 12px; padding: 3px 0;
  border-bottom: 1px solid var(--color-border-lighter);
}
.log-score {
  font-size: 11px; font-weight: 600; min-width: 32px;
}
.log-score.good { color: var(--color-success); }
.log-score.warn { color: var(--color-warning); }
.log-file { color: var(--color-text-regular); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.log-sheet { color: var(--color-text-placeholder); flex-shrink: 0; }

.anomaly-panel { margin-top: 16px; }
.anomaly-row {
  display: flex; align-items: flex-start; gap: 6px;
  font-size: 12px; padding: 4px 0;
  border-bottom: 1px solid var(--color-border-lighter);
}
.anomaly-detail { color: var(--color-text-secondary); font-size: 11px; line-height: 1.5; }

.stat-cards {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 10px; margin-bottom: 16px;
}
.stat-card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 14px 16px;
  text-align: center;
}
.stat-card.highlight { border-color: var(--color-primary); background: var(--color-primary-subtle); }
.stat-card.danger { border-color: var(--color-danger-border); background: var(--color-danger-light); }
.stat-val { font-size: 24px; font-weight: 700; color: var(--color-text-primary); line-height: 1; }
.stat-card.highlight .stat-val { color: var(--color-primary); }
.stat-card.danger .stat-val { color: var(--color-danger); }
.stat-label { font-size: 12px; color: var(--color-text-secondary); margin-top: 4px; }

.preview-wrap {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  font-size: 12px; color: var(--color-text-secondary);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
}

.history-panel {
  margin-top: 16px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.history-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  font-size: 13px;
  color: var(--color-text-regular);
  border-bottom: 1px solid var(--color-border-lighter);
}
.history-row:last-child { border-bottom: none; }

.merge-empty {
  display: flex; flex-direction: column; align-items: center;
  gap: 12px; padding: 80px 0;
  color: var(--color-text-placeholder); font-size: 13px;
}
.merge-loading {
  display: flex; align-items: center; justify-content: center;
  gap: 12px; padding: 60px 0;
  font-size: 13px; color: var(--color-text-secondary);
}

@media (max-width: 900px) {
  .build-topbar { gap: 10px; }
  .workflow-steps { justify-content: flex-start; overflow-x: auto; padding-bottom: 2px; }
  .build-layout, .merge-layout { grid-template-columns: 1fr; }
  .merge-left { position: static; }
  .stat-cards { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
  .editor-fullscreen { padding: 0 16px 16px; }
  .editor-fullscreen .build-topbar { margin: 0 -16px 16px; padding: 12px 16px; flex-wrap: wrap; }
  .build-title { min-width: 0; }
  .workflow-steps { position: static; transform: none; order: 3; flex-basis: 100%; justify-content: flex-start; }
  .build-topbar-actions { margin-left: auto; }
}
</style>
