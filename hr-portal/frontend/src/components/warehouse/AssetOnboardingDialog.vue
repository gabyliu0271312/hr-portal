<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import SmartCodeInput from '@/components/common/SmartCodeInput.vue'
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
const activeFields = computed(() => standardFields.value.filter(item => item.current_active_version_id))
const steps = computed(() => form.source_kind === 'interface'
  ? ['基本信息', '接口预览', '字段匹配']
  : ['基本信息', '字段定义', '字段匹配'])
const matchFields = computed(() => form.source_kind === 'interface'
  ? discovered.value.map(field => ({ code: field.column_code, label: field.label, is_yearmonth: field.is_yearmonth }))
  : manualFields.value.map(field => ({ code: field.column_code, label: field.column_label, is_yearmonth: false })))

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

async function loadTypes() {
  if (types.value.length) return
  try {
    types.value = await datasourcesApi.types('warehouse')
  } catch (cause: any) {
    ElMessage.error(detail(cause, '接入类型加载失败'))
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
  const secretKeys = new Set<string>(currentType.value?.secret_keys || [])
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
  <el-dialog v-model="visible" title="新建资产" width="min(1020px, 96vw)" :close-on-click-modal="false">
    <el-steps :active="step" finish-status="success" simple style="margin-bottom: 18px">
      <el-step v-for="title in steps" :key="title" :title="title" />
    </el-steps>

    <div v-if="step === 0" class="onboarding-section">
      <div class="grid-2">
        <el-form-item label="中文名" required>
          <el-input v-model="form.table_label" placeholder="如 员工月度分摊" />
        </el-form-item>
        <el-form-item label="表名（英文编码）" required>
          <SmartCodeInput
            v-model="form.table_name"
            :label="form.table_label"
            scope="table"
            prefix="ods_"
            context="数据资产表名"
            :existing-codes="props.existingTableNames"
            editable
          />
        </el-form-item>
      </div>
      <el-form-item label="描述">
        <el-input v-model="form.description" type="textarea" :rows="2" placeholder="可选" />
      </el-form-item>
      <div class="grid-2">
        <el-form-item label="来源方式">
          <el-radio-group v-model="form.source_kind">
            <el-radio-button value="interface">接口同步</el-radio-button>
            <el-radio-button value="manual">手工建字段（含 Excel 导入）</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="是否月度表">
          <el-switch v-model="form.is_period" active-text="月度表" inactive-text="非月度" />
        </el-form-item>
      </div>
    </div>

    <div v-else-if="step === 1 && form.source_kind === 'interface'" class="onboarding-section">
      <el-form-item label="接入类型" required>
        <el-select v-model="sourceType" style="width: 100%" @change="onTypeChange">
          <el-option v-for="item in types" :key="item.code" :label="item.label" :value="item.code" />
        </el-select>
        <p v-if="currentType" class="hint">{{ currentType.description }}</p>
      </el-form-item>
      <template v-if="currentType">
        <el-form-item v-for="field in fieldItems" :key="field.key" :label="field.label" :required="field.required">
          <el-input
            v-model="config[field.key]"
            :type="field.type === 'password' ? 'password' : 'text'"
            :show-password="field.type === 'password'"
            :placeholder="field.placeholder || ''"
          />
        </el-form-item>
        <div class="actions">
          <el-button type="primary" :loading="previewing" @click="previewSource">预览字段</el-button>
        </div>
        <el-alert v-if="discovered.length" type="success" :closable="false" :title="`已发现 ${discovered.length} 个字段，进入下一步匹配期间与标准字段`" />
        <p class="hint">预览只读取字段和样本，不保存配置、不创建资产。</p>
      </template>
    </div>

    <div v-else-if="step === 1" class="onboarding-section">
      <div class="actions">
        <el-button size="small" @click="addManualField">添加字段</el-button>
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
        <el-button size="small" text type="danger" @click="removeManualField(index)">删除</el-button>
      </div>
      <p class="hint">手工字段不会参与接口同步；数据通过数据视图的 Excel 导入维护。</p>
    </div>

    <div v-else class="onboarding-section">
      <el-form-item v-if="form.is_period" label="期间字段">
        <el-select v-model="periodField" style="width: 360px" placeholder="选择年月字段">
          <el-option
            v-for="field in matchFields"
            :key="field.code"
            :label="`${field.label} → ${field.code}${field.is_yearmonth ? '' : '（非年月）'}`"
            :value="field.code"
            :disabled="form.source_kind === 'interface' && !field.is_yearmonth"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="业务主键">
        <el-select v-model="businessKeys" multiple filterable style="width: 100%" placeholder="选择构成业务主键的字段">
          <el-option v-for="field in matchFields" :key="field.code" :label="field.label" :value="field.code" />
        </el-select>
      </el-form-item>
      <el-table :data="matchFields" stripe max-height="400" style="width: 100%">
        <el-table-column label="源字段" min-width="200">
          <template #default="{ row }">
            <strong>{{ row.label }}</strong>
            <div class="sub">{{ row.code }}</div>
          </template>
        </el-table-column>
        <el-table-column label="标准字段" min-width="280">
          <template #default="{ row }">
            <el-select v-model="fieldChoice[row.code]" clearable filterable placeholder="选择标准字段" style="width: 100%">
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
      <p class="hint">标准字段必须已有 active 版本；确认绑定会记录审计原因“资产接入向导确认”。</p>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button v-if="step > 0" :disabled="finishing" @click="step -= 1">上一步</el-button>
      <el-button v-if="step < 2" type="primary" @click="next">下一步</el-button>
      <el-button v-else type="primary" :loading="finishing || syncing" @click="finish">完成建资产</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.onboarding-section { display: grid; gap: 12px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.hint { margin: 4px 0 0; color: var(--color-text-secondary); font-size: 12px; line-height: 1.6; }
.sub { color: var(--color-text-secondary); font-size: 11px; }
.manual-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
@media (max-width: 720px) { .grid-2 { grid-template-columns: 1fr; } }
</style>
