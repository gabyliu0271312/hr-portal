<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import SmartCodeInput from '@/components/common/SmartCodeInput.vue'
import FullScreenModal from '@/components/performance/FullScreenModal.vue'
import PerformanceStepFlow from '@/components/performance/PerformanceStepFlow.vue'
import { SOURCE_TYPES } from '@/config/dataSources'
import { adminTablesApi } from '@/api/admin_tables'
import { datasourcesApi, type ConnectorTypeDefinition, type DiscoveredField } from '@/api/datasources'
import { standardFieldsApi, type StandardFieldSummary } from '@/api/standardFields'
import { listAssetColumns, updateAsset, updatePeriodConfig } from '@/api/warehouse'

const props = defineProps<{ existingTableNames: string[] }>()
const emit = defineEmits<{ done: [] }>()

interface ManualField {
  column_code: string
  column_label: string
  data_type: string
  is_pk_part: boolean
  is_visible: boolean
  is_sensitive: boolean
  agg_role: string
}

const visible = ref(false)
const step = ref(0)
const saving = ref(false)
const previewing = ref(false)
const syncing = ref(false)
const finishing = ref(false)
const types = ref<ConnectorTypeDefinition[]>([])
const sourceType = ref('')
const config = reactive<Record<string, string>>({})
const discovered = ref<DiscoveredField[]>([])
const manualFields = ref<ManualField[]>([])
const standardFields = ref<StandardFieldSummary[]>([])
const periodField = ref('')
const businessKeys = ref<string[]>([])
const fieldChoice = reactive<Record<string, number>>({})
const tableName = ref('')

const form = reactive({
  table_label: '',
  table_name: '',
  description: '',
  is_period: false,
  source_kind: 'interface' as 'interface' | 'manual',
})

const currentType = computed(() => types.value.find(item => item.code === sourceType.value) || null)
const fieldItems = computed<any[]>(() => currentType.value?.groups?.flatMap((group: any) => group.fields || []) || [])
const typeGroups = computed<any[]>(() => (currentType.value?.groups || []).filter((group: any) => (group.fields || []).length))
const previewAvailable = computed(() => currentType.value?.supports_discovery === true)
const activeFields = computed(() => standardFields.value.filter(item => item.current_active_version_id))
const stepItems = computed(() => [
  {
    key: 'basic',
    label: '基本信息',
    hint: '填写资产标识、来源方式与期间属性；来源方式决定下一步获取字段的方式。',
  },
  form.source_kind === 'interface'
    ? { key: 'source', label: '接口配置', hint: '选择接入类型并预览来源字段；预览只读取表头与样本，不保存配置、不创建资产。' }
    : { key: 'manual', label: '字段定义', hint: '直接定义字段结构，创建后可在该资产的数据视图中导入 Excel 维护数据。' },
  { key: 'match', label: '字段匹配', hint: '指定期间字段与业务主键，并为字段确认标准字段绑定；确认绑定会记录审计原因“资产接入向导确认”。' },
])
const currentStep = computed(() => stepItems.value[step.value])
const panelWidth = computed(() => (step.value === 1 && form.source_kind === 'interface') ? '720px' : step.value === 0 ? '640px' : '1040px')
const matchFields = computed(() => form.source_kind === 'interface'
  ? discovered.value.map(field => ({ code: field.column_code, label: field.label, is_yearmonth: field.is_yearmonth }))
  : manualFields.value.map(field => ({ code: field.column_code, label: field.column_label, is_yearmonth: false })))
const hasYearMonthField = computed(() => matchFields.value.some(field => field.is_yearmonth))

watch(visible, (value) => {
  document.body.style.overflow = value ? 'hidden' : ''
})

onBeforeUnmount(() => {
  document.body.style.overflow = ''
})

function detail(cause: any, fallback: string) {
  const value = cause?.response?.data?.detail
  if (typeof value === 'string') return value
  return value?.message || cause?.message || fallback
}

function reset() {
  step.value = 0
  saving.value = false
  previewing.value = false
  syncing.value = false
  finishing.value = false
  sourceType.value = ''
  tableName.value = ''
  Object.keys(config).forEach(key => delete config[key])
  Object.keys(fieldChoice).forEach(key => delete fieldChoice[key])
  discovered.value = []
  manualFields.value = []
  standardFields.value = []
  periodField.value = ''
  businessKeys.value = []
  Object.assign(form, { table_label: '', table_name: '', description: '', is_period: false, source_kind: 'interface' })
}

function open() {
  reset()
  visible.value = true
}

function close() {
  if (finishing.value || syncing.value) return
  visible.value = false
}

function prev() {
  if (finishing.value || syncing.value || step.value === 0) return
  step.value -= 1
}

function onHeaderBack() {
  if (step.value === 0) close()
  else prev()
}

async function loadTypes() {
  if (types.value.length) return
  // 与来源配置保持一致：内置类型打底，服务端目录覆盖同名定义并补充缺失类型
  types.value = SOURCE_TYPES.map(item => ({
    code: item.code,
    label: item.label,
    description: item.description,
    groups: item.groups,
    testable: item.testable,
    defaultSchedule: item.defaultSchedule,
    supports_discovery: item.supportsDiscovery === true,
  }))
  try {
    const remoteTypes = await datasourcesApi.types('warehouse')
    for (const remote of remoteTypes) {
      const index = types.value.findIndex(item => item.code === remote.code)
      if (index >= 0) types.value[index] = { ...types.value[index], ...remote }
      else types.value.push(remote)
    }
  } catch (cause: any) {
    ElMessage.error(detail(cause, '接入类型目录加载失败，已使用内置类型'))
  }
}

function onTypeChange() {
  Object.keys(config).forEach(key => delete config[key])
  for (const field of fieldItems.value) {
    config[field.key] = field.default || ''
  }
}

function splitPayload() {
  const settings: Record<string, string> = {}
  const secrets: Record<string, string> = {}
  const secretKeys = new Set(currentType.value?.secret_keys || [])
  for (const field of fieldItems.value) {
    const value = config[field.key] ?? ''
    if (field.type === 'password' || secretKeys.has(field.key)) {
      if (value) secrets[field.key] = value
    } else {
      settings[field.key] = value
    }
  }
  return { settings, secrets }
}

function inferType(field: DiscoveredField): string {
  const samples = (field.sample_values || []).filter(value => value !== null && value !== '')
  if (!samples.length) return 'string'
  if (samples.every(value => typeof value === 'number'
      || (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())))) return 'number'
  return 'string'
}

function defaultKeys() {
  businessKeys.value = matchFields.value
    .filter(field => field.code !== periodField.value)
    .map(field => field.code)
}

async function previewSource() {
  if (!sourceType.value) {
    ElMessage.warning('请选择接入类型')
    return
  }
  const missing = fieldItems.value.filter(field => field.required && !String(config[field.key] || '').trim())
  if (missing.length) {
    ElMessage.warning(`请填写必填项：${missing.map(field => field.label).join('、')}`)
    return
  }
  previewing.value = true
  try {
    const { settings, secrets } = splitPayload()
    discovered.value = await datasourcesApi.previewFields({ source_type: sourceType.value, settings, secrets })
    if (!discovered.value.length) {
      ElMessage.warning('未发现字段，请检查读取范围和表头行')
      return
    }
    periodField.value = form.is_period
      ? (discovered.value.find(field => field.is_yearmonth)?.column_code || '')
      : ''
    defaultKeys()
    ElMessage.success(`已发现 ${discovered.value.length} 个字段`)
  } catch (cause: any) {
    ElMessage.error(detail(cause, '字段预览失败'))
  } finally {
    previewing.value = false
  }
}

function addManualField() {
  manualFields.value.push({
    column_code: '', column_label: '', data_type: 'string',
    is_pk_part: false, is_visible: true, is_sensitive: false, agg_role: 'dimension',
  })
}

function removeManualField(index: number) {
  manualFields.value.splice(index, 1)
}

function validateManualFields(): boolean {
  if (!manualFields.value.length) {
    ElMessage.warning('请至少定义一个字段')
    return false
  }
  const codes = manualFields.value.map(field => field.column_code.trim())
  if (codes.some(code => !code) || codes.some(code => !fieldLabelValid(code))) {
    ElMessage.warning('字段编码不能为空，且只能使用小写字母、数字、下划线')
    return false
  }
  if (new Set(codes).size !== codes.length) {
    ElMessage.warning('字段编码不能重复')
    return false
  }
  if (manualFields.value.some(field => !field.column_label.trim())) {
    ElMessage.warning('字段名称不能为空')
    return false
  }
  return true
}

function fieldLabelValid(code: string): boolean {
  return /^[a-z][a-z0-9_]{0,63}$/.test(code)
}

async function loadStandardFields() {
  if (standardFields.value.length) return
  try {
    const result = await standardFieldsApi.list({ status: 'active', limit: 200 })
    standardFields.value = result.items
  } catch (cause: any) {
    ElMessage.error(detail(cause, '标准字段目录加载失败'))
  }
}

async function next() {
  if (step.value === 0) {
    if (!form.table_label.trim() || !form.table_name.trim()) {
      ElMessage.warning('请填写中文名和表名')
      return
    }
    if (form.source_kind === 'interface') {
      await loadTypes()
    } else if (!manualFields.value.length) {
      addManualField()
    }
    step.value = 1
    return
  }
  if (step.value === 1) {
    if (form.source_kind === 'interface' && !discovered.value.length) {
      ElMessage.warning('请先预览来源字段')
      return
    }
    if (form.source_kind === 'manual' && !validateManualFields()) return
    await loadStandardFields()
    if (form.is_period && !periodField.value) {
      periodField.value = form.source_kind === 'interface'
        ? (discovered.value.find(field => field.is_yearmonth)?.column_code || '')
        : manualFields.value[0]?.column_code || ''
    }
    defaultKeys()
    step.value = 2
  }
}

function buildColumns() {
  if (form.source_kind === 'interface') {
    return discovered.value.map((field, index) => ({
      column_code: field.column_code,
      column_label: field.label || field.column_code,
      data_type: inferType(field),
      is_pk_part: field.column_code === periodField.value || businessKeys.value.includes(field.column_code),
      is_visible: true,
      display_order: (index + 1) * 10,
      agg_role: 'dimension',
      is_interface: true,
    }))
  }
  return manualFields.value.map((field, index) => ({
    column_code: field.column_code.trim(),
    column_label: field.column_label.trim(),
    data_type: field.data_type,
    is_pk_part: field.column_code === periodField.value || businessKeys.value.includes(field.column_code),
    is_visible: field.is_visible,
    is_sensitive: field.is_sensitive,
    display_order: (index + 1) * 10,
    agg_role: field.agg_role,
    is_interface: false,
  }))
}

async function bindFields(columns: Array<{ id: number; column_code: string }>) {
  const byCode = new Map(columns.map(column => [column.column_code, column]))
  for (const field of matchFields.value) {
    const fieldId = fieldChoice[field.code]
    if (!fieldId) continue
    const summary = standardFields.value.find(item => item.id === fieldId)
    const versionId = summary?.current_active_version_id
    const column = byCode.get(field.code)
    if (!versionId || !column) continue
    const binding = await standardFieldsApi.createBinding(fieldId, {
      target_kind: 'table_column',
      target_id: column.id,
      standard_field_version_id: versionId,
    })
    await standardFieldsApi.confirmBinding(fieldId, binding.id, {
      expected_revision: binding.revision,
      reason: '资产接入向导确认',
    })
    // 同时绑定对应的数据集输出，满足后续发布准入
    try {
      const candidates = await standardFieldsApi.bindingCandidates(fieldId, { table_name: tableName.value })
      const output = candidates.find(item =>
        item.target_kind === 'dataset_output_field' && item.column_code === field.code && !item.existing_binding_id)
      if (output) {
        const outputBinding = await standardFieldsApi.createBinding(fieldId, {
          target_kind: 'dataset_output_field',
          target_id: output.target_id,
          standard_field_version_id: versionId,
          dataset_id: output.dataset_id || undefined,
        })
        await standardFieldsApi.confirmBinding(fieldId, outputBinding.id, {
          expected_revision: outputBinding.revision,
          reason: '资产接入向导确认',
        })
      }
    } catch {
      // 输出绑定失败不阻断资产创建；可在标准字段目录补绑
    }
  }
}

async function finish() {
  if (finishing.value) return
  finishing.value = true
  try {
    const nextTableName = form.table_name.trim()
    const columns = buildColumns()
    await adminTablesApi.create({
      table_name: nextTableName,
      table_label: form.table_label.trim(),
      description: form.description.trim() || null,
      is_period: form.is_period,
      period_col: periodField.value || 'month',
      period_source: 'field',
      asset_status: 'draft',
      columns,
    })
    tableName.value = nextTableName

    if (form.is_period && periodField.value) {
      const label = matchFields.value.find(field => field.code === periodField.value)?.label || periodField.value
      await updatePeriodConfig(nextTableName, {
        period_col: periodField.value,
        period_source: 'field',
        source_label: label,
      })
    }

    const columnResult = await listAssetColumns(nextTableName)
    await bindFields(columnResult.columns)

    if (form.source_kind === 'interface') {
      const created = await datasourcesApi.create({
        table_name: nextTableName,
        table_label: form.table_label.trim(),
        source_type: sourceType.value,
      })
      const { settings, secrets } = splitPayload()
      await datasourcesApi.update(created.id, {
        source_type: sourceType.value,
        schedule: '',
        settings,
        secrets,
        is_active: true,
        ingestion_mode: form.is_period ? 'period_full_snapshot' : 'current_snapshot',
        business_key_fields: businessKeys.value,
      })
      syncing.value = true
      try {
        await datasourcesApi.sync(created.id)
      } catch (cause: any) {
        ElMessage.warning(detail(cause, '首次同步未完成；资产已创建为草稿，可在资产详情继续同步'))
        visible.value = false
        emit('done')
        return
      } finally {
        syncing.value = false
      }
    }

    await updateAsset(nextTableName, { asset_status: 'published' })
    ElMessage.success(form.source_kind === 'interface'
      ? '资产、来源、字段匹配已完成'
      : '手工资产已创建；可在数据视图通过 Excel 导入数据')
    visible.value = false
    emit('done')
  } catch (cause: any) {
    ElMessage.error(detail(cause, '完成失败；资产可能已创建为草稿，请在资产详情核对'))
  } finally {
    finishing.value = false
  }
}

defineExpose({ open })
</script>

<template>
  <FullScreenModal v-if="visible" title="新建资产" :show-footer="false" @back="onHeaderBack">
    <template #actions>
      <PerformanceStepFlow :steps="stepItems" :current-step="step" aria-label="新建资产步骤" />
      <el-button :disabled="finishing || syncing" @click="close">取消</el-button>
      <el-button v-if="step > 0" :disabled="finishing || syncing" @click="prev">上一步</el-button>
      <el-button v-if="step < stepItems.length - 1" type="primary" @click="next">下一步</el-button>
      <el-button v-else type="primary" :loading="finishing || syncing" @click="finish">完成建资产</el-button>
    </template>

    <div class="onboarding-body">
      <section class="onboarding-panel" :style="{ maxWidth: panelWidth }">
        <header class="panel-header">
          <h2>{{ currentStep.label }}</h2>
          <p>{{ currentStep.hint }}</p>
        </header>

        <div v-if="step === 0" class="panel-body">
          <div class="field-grid">
            <label class="field">
              <span class="field-label">中文名<i class="required">*</i></span>
              <el-input v-model="form.table_label" placeholder="如 员工月度分摊" />
            </label>
            <label class="field">
              <span class="field-label">表名（英文编码）<i class="required">*</i></span>
              <SmartCodeInput
                v-model="form.table_name"
                :label="form.table_label"
                scope="table"
                prefix="ods_"
                context="数据资产表名"
                :existing-codes="props.existingTableNames"
                editable
              />
            </label>
          </div>
          <label class="field">
            <span class="field-label">描述</span>
            <el-input v-model="form.description" type="textarea" :rows="3" placeholder="可选" />
          </label>
          <div class="field-grid">
            <div class="field">
              <span class="field-label">来源方式</span>
              <el-radio-group v-model="form.source_kind">
                <el-radio-button value="interface">接口同步</el-radio-button>
                <el-radio-button value="manual">手工创建</el-radio-button>
              </el-radio-group>
            </div>
            <div class="field">
              <span class="field-label">期间属性</span>
              <div class="inline-control">
                <el-switch v-model="form.is_period" active-text="月度表" inactive-text="非月度" />
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="step === 1 && form.source_kind === 'interface'" class="panel-body">
          <label class="field">
            <span class="field-label">接入类型<i class="required">*</i></span>
            <el-select v-model="sourceType" placeholder="选择接入类型" @change="onTypeChange">
              <el-option v-for="item in types" :key="item.code" :label="item.label" :value="item.code" />
            </el-select>
            <span v-if="currentType" class="field-hint">{{ currentType.description }}</span>
          </label>

          <el-alert
            v-if="currentType && !previewAvailable"
            type="warning"
            :closable="false"
            title="该接入类型暂不支持在建资产前预览字段"
            description="请改用「手工创建」定义字段，或先创建资产后在资产详情的来源配置中完成同步与字段发现。"
          />

          <section v-for="group in typeGroups" :key="group.title" class="form-section">
            <h3 class="form-section-title">{{ group.title }}</h3>
            <div class="field-grid">
              <label v-for="field in group.fields" :key="field.key" class="field">
                <span class="field-label">{{ field.label }}<i v-if="field.required" class="required">*</i></span>
                <el-select
                  v-if="field.type === 'select'"
                  v-model="config[field.key]"
                  :placeholder="field.placeholder || '请选择'"
                >
                  <el-option
                    v-for="option in field.options || []"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </el-select>
                <el-input
                  v-else
                  v-model="config[field.key]"
                  :type="field.type === 'password' ? 'password' : 'text'"
                  :show-password="field.type === 'password'"
                  :placeholder="field.placeholder || ''"
                />
                <span v-if="field.hint" class="field-hint">{{ field.hint }}</span>
              </label>
            </div>
          </section>

          <div v-if="currentType" class="panel-actions panel-actions--split">
            <span class="field-hint">预览只读取表头与少量样本，不保存配置、不创建资产。</span>
            <el-button type="primary" :loading="previewing" :disabled="!previewAvailable" @click="previewSource">
              预览字段
            </el-button>
          </div>

          <el-alert
            v-if="discovered.length"
            type="success"
            :closable="false"
            :title="`已发现 ${discovered.length} 个字段`"
            description="进入下一步可指定期间字段、业务主键，并逐一匹配标准字段。"
          />
        </div>

        <div v-else-if="step === 1" class="panel-body">
          <div class="panel-actions">
            <el-button @click="addManualField">添加字段</el-button>
            <span class="field-hint">手工字段不参与接口同步；数据通过数据视图的 Excel 导入维护。</span>
          </div>
          <el-empty v-if="!manualFields.length" description="请添加字段；创建后可在数据视图导入 Excel" :image-size="48" />
          <div v-for="(field, index) in manualFields" :key="index" class="manual-row">
            <el-input v-model="field.column_code" placeholder="字段编码，如 employee_no" style="width: 180px" />
            <el-input v-model="field.column_label" placeholder="字段名称" style="width: 160px" />
            <el-select v-model="field.data_type" style="width: 110px">
              <el-option label="文本" value="string" />
              <el-option label="数字" value="number" />
              <el-option label="日期" value="date" />
              <el-option label="日期时间" value="datetime" />
              <el-option label="布尔" value="bool" />
            </el-select>
            <el-select v-model="field.agg_role" style="width: 110px">
              <el-option label="维度" value="dimension" />
              <el-option label="度量" value="measure" />
            </el-select>
            <el-checkbox v-model="field.is_pk_part">主键</el-checkbox>
            <el-checkbox v-model="field.is_visible">可见</el-checkbox>
            <el-checkbox v-model="field.is_sensitive">敏感</el-checkbox>
            <el-button text type="danger" @click="removeManualField(index)">删除</el-button>
          </div>
        </div>

        <div v-else class="panel-body">
          <div class="field-grid">
            <label v-if="form.is_period" class="field">
              <span class="field-label">期间字段<i class="required">*</i></span>
              <el-select v-model="periodField" placeholder="选择年月字段">
                <el-option
                  v-for="field in matchFields"
                  :key="field.code"
                  :label="`${field.label} → ${field.code}${field.is_yearmonth ? '' : '（非年月）'}`"
                  :value="field.code"
                  :disabled="form.source_kind === 'interface' && hasYearMonthField && !field.is_yearmonth"
                />
              </el-select>
            </label>
            <label class="field">
              <span class="field-label">业务主键</span>
              <el-select v-model="businessKeys" multiple filterable placeholder="选择构成业务主键的字段">
                <el-option v-for="field in matchFields" :key="field.code" :label="field.label" :value="field.code" />
              </el-select>
            </label>
          </div>
          <el-table :data="matchFields" stripe max-height="52vh" class="match-table">
            <el-table-column label="源字段" min-width="220">
              <template #default="{ row }">
                <strong>{{ row.label }}</strong>
                <div class="sub">{{ row.code }}</div>
              </template>
            </el-table-column>
            <el-table-column label="标准字段" min-width="320">
              <template #default="{ row }">
                <el-select v-model="fieldChoice[row.code]" clearable filterable placeholder="选择标准字段">
                  <el-option
                    v-for="item in activeFields"
                    :key="item.id"
                    :label="`${item.field_code} · ${item.latest_version.field_name}`"
                    :value="item.id"
                  />
                </el-select>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </section>
    </div>
  </FullScreenModal>
</template>

<style scoped>
.onboarding-body {
  display: flex;
  flex: 1 1 auto;
  justify-content: center;
  align-items: flex-start;
  padding: var(--spacing-6);
  box-sizing: border-box;
}
.onboarding-panel {
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
.field :deep(.el-select) {
  width: 100%;
}
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
.inline-control {
  display: flex;
  align-items: center;
  min-height: var(--performance-control-height);
}
.panel-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  flex-wrap: wrap;
}
.panel-actions--split {
  justify-content: space-between;
}
.form-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}
.form-section + .form-section {
  margin-top: calc(var(--spacing-5) - var(--spacing-2));
}
.form-section-title {
  margin: 0;
  padding-bottom: var(--spacing-2);
  border-bottom: 1px solid var(--color-border-light);
  color: var(--color-text-primary);
  font-size: var(--font-size-md);
  font-weight: 600;
  line-height: 22px;
}
.manual-row {
  display: flex;
  gap: var(--spacing-2);
  align-items: center;
  flex-wrap: wrap;
}
.match-table {
  width: 100%;
}
.sub {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

@media (max-width: 900px) {
  .field-grid { grid-template-columns: minmax(0, 1fr); }
  .onboarding-body { padding: var(--spacing-3); }
  .onboarding-panel { padding: var(--spacing-5); }
}
</style>
