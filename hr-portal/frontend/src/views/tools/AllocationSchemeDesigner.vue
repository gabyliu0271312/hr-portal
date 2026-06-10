<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Check } from '@element-plus/icons-vue'
import AllocationBasicInfo from '@/components/allocation/AllocationBasicInfo.vue'
import CalculatedFieldBridge from '@/components/formula/CalculatedFieldBridge.vue'
import ReportFieldWorkbench from '@/components/report/ReportFieldWorkbench.vue'
import ReportFilterList from '@/components/report/ReportFilterList.vue'
import ReportTransposeConfig from '@/components/report/ReportTransposeConfig.vue'
import ReportPreviewTable from '@/components/report/ReportPreviewTable.vue'
import { allocationApi, type AllocationSchemeIn } from '@/api/allocation'
import type { ColumnInfo } from '@/api/data'
import { datasetsApi, type DatasetCalculatedField, type DatasetItem } from '@/api/datasets'
import type { AggregationFunc, ColumnSetting, DefaultSplitRule, FilterLogic, ReshapeConflictStrategy, RunResult } from '@/api/reports'
import { useTableOptions } from '@/composables/useTableOptions'

const { tables: TABLES } = useTableOptions()

const route = useRoute()
const router = useRouter()

const schemeId = computed(() => {
  const id = route.params.id as string
  return id === 'new' ? null : Number(id)
})
const isNew = computed(() => schemeId.value === null)

const form = reactive({
  name: '',
  description: '',
  dataset_id: null as number | null,
  result_table: 'emp_monthly_cost_result',
  selected_codes: [] as string[],
  column_settings: {} as Record<string, ColumnSetting>,
  default_split_rule: { enabled: false, factor: '' } as DefaultSplitRule,
  rounding_group_by: [] as string[],
  filters: [] as any[],
  filter_logic: null as FilterLogic | null,
  sorts: [] as any[],
  value_rules: [] as { target: string; factor: string }[],
  aggregate: false,
  default_aggregation: 'sum' as AggregationFunc,
  aggregations: {} as Record<string, string>,
  transpose: {
    enabled: false,
    drop_zero_measures: true,
    rules: [] as any[],
    column_to_row: {
      enabled: false,
      source_cols: [] as string[],
      group_by: [] as string[],
      item_label: '项目',
      value_label: '金额',
      conflict_strategy: 'keep_all',
    },
    row_to_column: {
      enabled: false,
      group_by: [] as string[],
      pivot_col: '',
      value_col: '',
      pivot_values: [] as { value: string; label?: string }[],
      fill_value: '--',
      conflict_strategy: 'first',
    },
  },
  rounding_corrections: [] as { group_by: string; target_cols: string[] }[],
})

const allColumns = ref<ColumnInfo[]>([])
const datasets = ref<DatasetItem[]>([])
const currentDataset = ref<DatasetItem | null>(null)
const resultTables = ref<{ table_name: string; label: string }[]>([])
const saving = ref(false)
const previewing = ref(false)
const previewColumns = ref<RunResult['columns']>([])
const previewItems = ref<RunResult['items']>([])
const previewTotal = ref(0)
const previewPage = ref(1)
const previewPageSize = ref(20)

const transposeRef = ref<InstanceType<typeof ReportTransposeConfig> | null>(null)
const filterRef = ref<InstanceType<typeof ReportFilterList> | null>(null)

const selectedColsDetail = computed(() =>
  form.selected_codes.map((c) => allColumns.value.find((x) => x.code === c)).filter(Boolean) as ColumnInfo[]
)
const selectedDimensions = computed(() => selectedColsDetail.value.filter((c) => c.agg_role !== 'measure'))
const selectedMeasures = computed(() => selectedColsDetail.value.filter((c) => c.agg_role === 'measure'))
const isDataset = computed(() => true)

async function loadDatasets() {
  try {
    datasets.value = await datasetsApi.list()
    if (isNew.value && !form.dataset_id) {
      form.dataset_id = datasets.value.find((d) => d.is_active)?.id ?? datasets.value[0]?.id ?? null
    }
  } catch { datasets.value = [] }
}

async function loadResultTables() {
  try { resultTables.value = await allocationApi.listResultTables() } catch { resultTables.value = [] }
}

async function loadScheme() {
  if (isNew.value) return
  try {
    const s = await allocationApi.getScheme(schemeId.value!)
    form.name = s.name
    form.description = s.description ?? ''
    form.dataset_id = s.dataset_id
    form.result_table = s.result_table
    const cfg = s.config
    form.selected_codes = [...(cfg.columns ?? [])]
    form.column_settings = { ...(cfg.column_settings ?? {}) }
    form.default_split_rule = {
      enabled: !!cfg.default_split_rule?.enabled,
      factor: cfg.default_split_rule?.factor || '',
    }
    form.filters = (cfg.filters ?? []).map((f: any) => ({ ...f }))
    form.filter_logic = cfg.filter_logic ?? null
    form.sorts = (cfg.sorts ?? []).map((s: any) => ({ ...s }))
    form.value_rules = (cfg.value_rules ?? []).map((v: any) => ({ ...v }))
    form.aggregate = cfg.aggregate ?? false
    form.default_aggregation = (cfg.default_aggregation || 'sum') as AggregationFunc
    form.aggregations = { ...(cfg.aggregations ?? {}) }
    for (const [code, aggregation] of Object.entries(form.aggregations)) {
      if (aggregation && aggregation !== form.default_aggregation && !form.column_settings[code]?.aggregation) {
        form.column_settings[code] = {
          ...(form.column_settings[code] || {}),
          aggregation: aggregation as AggregationFunc,
        }
      }
    }
    const tp = cfg.transpose
    form.transpose = {
      enabled: tp?.enabled ?? false,
      drop_zero_measures: tp?.drop_zero_measures ?? true,
      rules: (tp?.rules ?? []).map((r: any) => ({
        source_col: r.source_col,
        target_cols: [...(r.target_cols ?? [])],
        dims: Object.entries(r.dim_updates ?? {}).map(([dim, value]) => ({ dim, value })),
      })),
      column_to_row: {
        enabled: !!tp?.column_to_row?.enabled,
        source_cols: [...(tp?.column_to_row?.source_cols ?? [])],
        group_by: [...(tp?.column_to_row?.group_by ?? [])],
        item_label: tp?.column_to_row?.item_label || '项目',
        value_label: tp?.column_to_row?.value_label || '金额',
        conflict_strategy: tp?.column_to_row?.conflict_strategy || 'keep_all',
      },
      row_to_column: {
        enabled: !!tp?.row_to_column?.enabled,
        group_by: [...(tp?.row_to_column?.group_by ?? [])],
        pivot_col: tp?.row_to_column?.pivot_col || '',
        value_col: tp?.row_to_column?.value_col || '',
        pivot_values: (tp?.row_to_column?.pivot_values ?? []).map((item: any) => ({
          value: item.value,
          label: item.label || '',
        })),
        fill_value: tp?.row_to_column?.fill_value ?? '--',
        conflict_strategy: tp?.row_to_column?.conflict_strategy || 'first',
      },
    }
    form.rounding_corrections = (cfg.rounding_corrections ?? []).map((rc: any) => ({
      group_by: Array.isArray(rc.group_by) ? rc.group_by[0] ?? '' : rc.group_by ?? '',
      target_cols: [...(rc.target_cols ?? [])],
    }))
    const firstRounding = cfg.rounding_corrections?.[0]
    form.rounding_group_by = Array.isArray(firstRounding?.group_by)
      ? [...firstRounding.group_by]
      : firstRounding?.group_by
        ? [firstRounding.group_by]
        : []
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载方案失败')
  }
}

function resetForm() {
  form.selected_codes = []
  form.column_settings = {}
  form.default_split_rule = { enabled: false, factor: '' }
  form.rounding_group_by = []
  form.filters = []
  form.filter_logic = null
  form.sorts = []
  form.value_rules = []
  form.aggregate = false
  form.default_aggregation = 'sum'
  form.aggregations = {}
  form.transpose = {
    enabled: false,
    drop_zero_measures: true,
    rules: [],
    column_to_row: {
      enabled: false,
      source_cols: [],
      group_by: [],
      item_label: '项目',
      value_label: '金额',
      conflict_strategy: 'keep_all',
    },
    row_to_column: {
      enabled: false,
      group_by: [],
      pivot_col: '',
      value_col: '',
      pivot_values: [],
      fill_value: '--',
      conflict_strategy: 'first',
    },
  }
  form.rounding_corrections = []
  filterRef.value?.clearCache()
  previewColumns.value = []
  previewItems.value = []
  previewTotal.value = 0
}

function onDatasetChange() {
  resetForm()
}

function onCalculatedFieldSaved(field: DatasetCalculatedField) {
  const code = `calc.${field.code}`
  if (!form.selected_codes.includes(code)) {
    form.selected_codes = [...form.selected_codes, code]
  }
}

function buildPayload(): AllocationSchemeIn {
  const selectedMeasureCodes = selectedMeasures.value.map((c) => c.code)
  const c2r = form.transpose.column_to_row || {}
  const r2c = form.transpose.row_to_column || {}
  const filterLogic: FilterLogic | null =
    form.filter_logic?.mode === 'custom' && form.filter_logic.expression?.trim()
      ? { mode: 'custom', expression: form.filter_logic.expression.trim() }
      : null
  const valueRulesByTarget = new Map<string, string>()
  if (form.default_split_rule.enabled && form.default_split_rule.factor) {
    for (const measure of selectedMeasureCodes) {
      const setting = form.column_settings[measure] || {}
      if (setting.split_mode === 'none') continue
      if (setting.split_mode === 'custom' && setting.split_factor) {
        valueRulesByTarget.set(measure, setting.split_factor)
      } else {
        valueRulesByTarget.set(measure, form.default_split_rule.factor)
      }
    }
  }
  for (const rule of form.value_rules) {
    if (rule.target && rule.factor) valueRulesByTarget.set(rule.target, rule.factor)
  }
  for (const measure of selectedMeasureCodes) {
    const setting = form.column_settings[measure] || {}
    if (setting.split_mode === 'none') valueRulesByTarget.delete(measure)
    if (setting.split_mode === 'custom' && setting.split_factor) valueRulesByTarget.set(measure, setting.split_factor)
  }

  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    dataset_id: form.dataset_id!,
    result_table: form.result_table,
    is_active: true,
    config: {
      columns: form.selected_codes,
      column_settings: form.column_settings,
      default_split_rule: form.default_split_rule,
      filters: form.filters.filter((f) => f.column).map((f) => {
        const op = f.op
        let value = f.value
        if (op === 'is_null' || op === 'is_not_null') value = null
        else if ((op === 'between' || op === 'in') && typeof value === 'string')
          value = value.split(',').map((s: string) => s.trim()).filter(Boolean)
        return { column: f.column, op, value, visible: f.visible ?? true, locked: f.locked ?? false }
      }),
      filter_logic: filterLogic,
      sorts: form.sorts.filter((s) => s.column),
      value_rules: [...valueRulesByTarget.entries()].map(([target, factor]) => ({ target, factor })),
      aggregate: form.aggregate,
      default_aggregation: form.default_aggregation || 'sum',
      aggregations: form.aggregate
        ? Object.fromEntries(
            selectedMeasures.value.map((c) => [
              c.code,
              form.column_settings[c.code]?.aggregation || form.default_aggregation || 'sum',
            ]),
          )
        : {},
      transpose: {
        enabled: form.transpose.enabled,
        drop_zero_measures: form.transpose.drop_zero_measures,
        rules: form.transpose.rules
          .filter((r: any) => r.source_col && r.target_cols.length)
          .map((r: any) => {
            const du: Record<string, string> = {}
            for (const d of r.dims) if (d.dim && d.value !== '') du[d.dim] = d.value
            return { source_col: r.source_col, target_cols: r.target_cols, dim_updates: du }
          }),
        column_to_row: {
          enabled: !!c2r.enabled,
          source_cols: [...(c2r.source_cols || [])].filter((code) => form.selected_codes.includes(code)),
          group_by: [...(c2r.group_by || [])].filter((code) => form.selected_codes.includes(code)),
          item_label: c2r.item_label || '项目',
          value_label: c2r.value_label || '金额',
          conflict_strategy: (c2r.conflict_strategy || 'keep_all') as ReshapeConflictStrategy,
        },
        row_to_column: {
          enabled: !!r2c.enabled,
          group_by: [...(r2c.group_by || [])].filter((code) => form.selected_codes.includes(code)),
          pivot_col: form.selected_codes.includes(r2c.pivot_col || '') ? r2c.pivot_col : '',
          value_col: form.selected_codes.includes(r2c.value_col || '') ? r2c.value_col : '',
          pivot_values: (r2c.pivot_values || [])
            .filter((item: any) => item.value !== '')
            .map((item: any) => ({ value: item.value, label: item.label || '' })),
          fill_value: r2c.fill_value ?? '--',
          conflict_strategy: (r2c.conflict_strategy || 'first') as Exclude<ReshapeConflictStrategy, 'keep_all'>,
        },
      },
      rounding_corrections: form.aggregate && form.rounding_group_by.length && selectedMeasureCodes.length
        ? [{ group_by: [...form.rounding_group_by], target_cols: selectedMeasureCodes }]
        : form.aggregate
          ? form.rounding_corrections
            .filter((rc) => rc.group_by && rc.target_cols.length)
            .map((rc) => ({ group_by: rc.group_by, target_cols: [...rc.target_cols] }))
          : [],
    },
  }
}

async function save() {
  if (!form.name.trim()) { ElMessage.warning('请填写方案名'); return }
  if (!form.selected_codes.length) { ElMessage.warning('至少选择一个字段'); return }
  if (!form.dataset_id) { ElMessage.warning('请选择数据集'); return }
  saving.value = true
  try {
    if (form.transpose.enabled && form.transpose.rules?.length) await transposeRef.value?.ensureCcMaster()
    const payload = buildPayload()
    if (isNew.value) {
      const s = await allocationApi.createScheme(payload)
      ElMessage.success('已创建')
      router.replace(`/tools/allocation-designer/${s.id}`)
    } else {
      await allocationApi.updateScheme(schemeId.value!, payload)
      ElMessage.success('已保存')
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally { saving.value = false }
}

async function preview() {
  if (!form.selected_codes.length) { ElMessage.warning('至少选择一个字段才能预览'); return }
  if (isNew.value) { ElMessage.info('请先保存后再预览'); return }
  previewing.value = true
  try {
    if (form.transpose.enabled && form.transpose.rules?.length) await transposeRef.value?.ensureCcMaster()
    await allocationApi.updateScheme(schemeId.value!, buildPayload())
    // 复用 report run 接口预览——创建一个临时 report 或直接调 scheme run preview
    // 此处简化：通过 scheme 的 dataset_id 直接查询（待后续优化）
    ElMessage.info('预览功能需绑定报表，请先保存后在列表点击"计算"验证数据')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '预览失败')
  } finally { previewing.value = false }
}

onMounted(async () => {
  await Promise.all([loadDatasets(), loadResultTables()])
  if (!isNew.value) await loadScheme()
})

watch(() => route.params.id, async (v) => {
  if (!v) return
  if (v === 'new') {
    Object.assign(form, {
      name: '', description: '', dataset_id: datasets.value.find((d) => d.is_active)?.id ?? datasets.value[0]?.id ?? null,
      result_table: 'emp_monthly_cost_result',
      selected_codes: [], filters: [], sorts: [], value_rules: [],
      aggregate: false, default_aggregation: 'sum', aggregations: {},
      column_settings: {}, default_split_rule: { enabled: false, factor: '' }, rounding_group_by: [], filter_logic: null,
      transpose: {
        enabled: false,
        drop_zero_measures: true,
        rules: [],
        column_to_row: {
          enabled: false,
          source_cols: [],
          group_by: [],
          item_label: '项目',
          value_label: '金额',
          conflict_strategy: 'keep_all',
        },
        row_to_column: {
          enabled: false,
          group_by: [],
          pivot_col: '',
          value_col: '',
          pivot_values: [],
          fill_value: '--',
          conflict_strategy: 'first',
        },
      },
      rounding_corrections: [],
    })
    previewItems.value = []
    previewColumns.value = []
  } else {
    await loadScheme()
  }
})
</script>

<template>
  <div class="designer-page">
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <div>
            <el-button link @click="router.push('/tools/cost-allocation')">
              <el-icon><ArrowLeft /></el-icon>返回方案列表
            </el-button>
            <span style="font-size: 16px; font-weight: 600; margin-left: 8px">
              {{ isNew ? '新建分摊方案' : `编辑方案 · ${form.name || '(未命名)'}` }}
            </span>
          </div>
          <div>
            <el-button type="primary" :loading="saving" @click="save">
              <el-icon style="margin-right: 4px"><Check /></el-icon>保存
            </el-button>
          </div>
        </div>
      </template>

      <el-form label-position="top">
        <div class="section-title">基本信息</div>
        <AllocationBasicInfo
          v-model:name="form.name"
          v-model:description="form.description"
          v-model:dataset-id="form.dataset_id"
          v-model:result-table="form.result_table"
          :datasets="datasets"
          :current-dataset="currentDataset"
          :result-tables="resultTables"
          @dataset-change="onDatasetChange"
        />

        <div class="section-title">报表设置（{{ form.selected_codes.length }} 个字段）</div>
        <CalculatedFieldBridge
          :dataset-id="form.dataset_id"
          :datasets="datasets"
          :tables="TABLES"
          @columns-change="allColumns = $event"
          @dataset-change="currentDataset = $event"
          @saved="onCalculatedFieldSaved"
        >
          <template #default="{ columns, loading, sourceGroups, canCreateField, createField }">
            <ReportFieldWorkbench
              v-model:selected-codes="form.selected_codes"
              v-model:column-settings="form.column_settings"
              v-model:default-split-rule="form.default_split_rule"
              v-model:default-aggregation="form.default_aggregation"
              v-model:aggregate="form.aggregate"
              v-model:rounding-group-by="form.rounding_group_by"
              v-model:sorts="form.sorts"
              :all-columns="columns"
              :source-groups="sourceGroups"
              :loading="loading"
              :is-dataset="isDataset"
              :can-create-field="canCreateField"
              @create-field="createField"
            >
              <template #filters>
                <ReportFilterList
                  ref="filterRef"
                  v-model:filters="form.filters"
                  v-model:filter-logic="form.filter_logic"
                  :all-columns="allColumns"
                  :current-dataset-tables="currentDataset?.tables"
                />
              </template>

              <template #reshape>
                <ReportTransposeConfig
                  ref="transposeRef"
                  v-model:transpose="form.transpose"
                  :selected-dimensions="selectedDimensions"
                  :selected-measures="selectedMeasures"
                  :selected-columns="selectedColsDetail"
                />
              </template>
            </ReportFieldWorkbench>
          </template>
        </CalculatedFieldBridge>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 14px 0 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--color-border-light);
}
.designer-page {
  padding: 16px;
}
</style>
