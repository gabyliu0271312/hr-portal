<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, View, Check } from '@element-plus/icons-vue'
import CalculatedFieldBridge from '@/components/formula/CalculatedFieldBridge.vue'
import ReportBasicInfo from '@/components/report/ReportBasicInfo.vue'
import ReportFieldWorkbench from '@/components/report/ReportFieldWorkbench.vue'
import ReportFilterList from '@/components/report/ReportFilterList.vue'
import ReportSortList from '@/components/report/ReportSortList.vue'
import ReportTransposeConfig from '@/components/report/ReportTransposeConfig.vue'
import ReportPreviewTable from '@/components/report/ReportPreviewTable.vue'
import { reportsApi, type AggregationFunc, type ColumnSetting, type DefaultSplitRule, type FilterLogic, type ReshapeConflictStrategy, type RunResult } from '@/api/reports'
import type { ColumnInfo } from '@/api/data'
import { datasetsApi, type DatasetCalculatedField, type DatasetItem } from '@/api/datasets'
import { useTableOptions } from '@/composables/useTableOptions'

const { tables: TABLES } = useTableOptions()

const route = useRoute()
const router = useRouter()

const reportId = computed(() => {
  const id = route.params.id as string
  return id === 'new' ? null : Number(id)
})
const isNew = computed(() => reportId.value === null)

const form = reactive({
  name: '',
  description: '',
  source_type: 'single' as 'single' | 'dataset',
  table_name: 'emp_realtime_roster',
  dataset_id: null as number | null,
  is_published: false,
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
const saving = ref(false)
const previewing = ref(false)
const previewColumns = ref<RunResult['columns']>([])
const previewItems = ref<RunResult['items']>([])
const previewTotal = ref(0)
const previewPage = ref(1)
const previewPageSize = ref(20)
const singleTableDatasetId = ref<number | null>(null)

const transposeRef = ref<InstanceType<typeof ReportTransposeConfig> | null>(null)
const filterRef = ref<InstanceType<typeof ReportFilterList> | null>(null)

const selectedColsDetail = computed(() =>
  form.selected_codes
    .map((code) => allColumns.value.find((c) => c.code === code))
    .filter(Boolean) as ColumnInfo[]
)
const selectedDimensions = computed(() =>
  selectedColsDetail.value.filter((c) => c.agg_role !== 'measure')
)
const selectedMeasures = computed(() =>
  selectedColsDetail.value.filter((c) => c.agg_role === 'measure')
)
const isDataset = computed(() => form.source_type === 'dataset')

async function loadDatasets() {
  try {
    datasets.value = await datasetsApi.list()
  } catch {
    datasets.value = []
  }
}

async function loadReport() {
  if (isNew.value) return
  try {
    const r = await reportsApi.get(reportId.value!)
    form.name = r.name
    form.description = r.description ?? ''
    form.source_type = r.dataset_id ? 'dataset' : 'single'
    form.table_name = r.table_name || 'emp_realtime_roster'
    form.dataset_id = r.dataset_id
    form.is_published = r.is_published
    form.selected_codes = [...(r.config.columns ?? [])]
    form.column_settings = { ...(r.config.column_settings ?? {}) }
    singleTableDatasetId.value = r.config.single_table_dataset_id || null
    form.default_split_rule = {
      enabled: !!r.config.default_split_rule?.enabled,
      factor: r.config.default_split_rule?.factor || '',
    }
    form.filters = (r.config.filters ?? []).map((f) => ({ ...f }))
    form.filter_logic = r.config.filter_logic ?? null
    form.sorts = (r.config.sorts ?? []).map((s) => ({ ...s }))
    form.value_rules = (r.config.value_rules ?? []).map((v) => ({ ...v }))
    form.aggregate = r.config.aggregate ?? false
    form.default_aggregation = (r.config.default_aggregation || 'sum') as AggregationFunc
    form.aggregations = { ...(r.config.aggregations ?? {}) }
    for (const [code, aggregation] of Object.entries(form.aggregations)) {
      if (aggregation && aggregation !== form.default_aggregation && !form.column_settings[code]?.aggregation) {
        form.column_settings[code] = {
          ...(form.column_settings[code] || {}),
          aggregation: aggregation as AggregationFunc,
        }
      }
    }
    const tp = r.config.transpose
    form.transpose = {
      enabled: tp?.enabled ?? false,
      drop_zero_measures: tp?.drop_zero_measures ?? true,
      rules: (tp?.rules ?? []).map((rule) => ({
        source_col: rule.source_col,
        target_cols: [...(rule.target_cols ?? [])],
        dims: Object.entries(rule.dim_updates ?? {}).map(([dim, value]) => ({ dim, value })),
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
    form.rounding_corrections = (r.config.rounding_corrections ?? []).map((rc: any) => ({
      group_by: Array.isArray(rc.group_by) ? rc.group_by[0] ?? '' : rc.group_by ?? '',
      target_cols: [...(rc.target_cols ?? [])],
    }))
    const firstRounding = r.config.rounding_corrections?.[0]
    form.rounding_group_by = Array.isArray(firstRounding?.group_by)
      ? [...firstRounding.group_by]
      : firstRounding?.group_by
        ? [firstRounding.group_by]
        : []
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载报表失败')
  }
}

function resetForm() {
  singleTableDatasetId.value = null
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

async function onSourceChange() {
  resetForm()
}

async function onTableChange() {
  resetForm()
}

async function onDatasetChange() {
  resetForm()
}

function onCalculatedFieldSaved(field: DatasetCalculatedField) {
  const code = `calc.${field.code}`
  if (!form.selected_codes.includes(code)) {
    form.selected_codes = [...form.selected_codes, code]
  }
}

function buildPayload() {
  const tailCode = (q: string) => (q.includes('.') ? q.slice(q.indexOf('.') + 1) : q)
  const selectedDimCodes = selectedDimensions.value.map((c) => c.code)
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
    table_name: form.source_type === 'single' ? form.table_name : '',
    dataset_id: form.source_type === 'dataset' ? form.dataset_id : null,
    is_published: form.is_published,
    config: {
      columns: form.selected_codes,
      column_settings: form.column_settings,
      single_table_dataset_id: form.source_type === 'single' ? singleTableDatasetId.value : null,
      default_split_rule: form.default_split_rule,
      filters: form.filters
        .filter((f) => f.column)
        .map((f) => {
          const op = f.op
          let value: any = f.value
          if (op === 'is_null' || op === 'is_not_null') value = null
          else if ((op === 'between' || op === 'in') && typeof value === 'string') {
            value = value.split(',').map((s: string) => s.trim()).filter(Boolean)
          }
          return {
            column: f.column,
            op,
            value,
            visible: f.visible ?? true,
            locked: f.locked ?? false,
          }
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
              form.column_settings[c.code]?.aggregation
                || form.default_aggregation
                || 'sum',
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
            for (const d of r.dims) {
              if (d.dim && d.value !== '') du[d.dim] = d.value
            }
            const codeQuals = selectedDimCodes.filter((c) => tailCode(c) === '编码')
            for (const [dim, val] of Object.entries({ ...du })) {
              if (tailCode(dim) !== '维度值' && tailCode(dim) !== '名称') continue
              const opt = (transposeRef.value as any)?.ccNameOptions?.find((o: any) => o.value === val)
              if (!opt?.extra) continue
              for (const cq of codeQuals) {
                if (du[cq] === undefined) du[cq] = opt.extra
              }
            }
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
  if (!form.name.trim()) { ElMessage.warning('请填写报表名'); return }
  if (!form.selected_codes.length) { ElMessage.warning('至少选择一个字段'); return }
  saving.value = true
  try {
    if (form.transpose.enabled && form.transpose.rules?.length) await transposeRef.value?.ensureCcMaster()
    const payload = buildPayload()
    if (isNew.value) {
      const r = await reportsApi.create(payload)
      ElMessage.success('已创建')
      router.replace(`/report/designer/${r.id}`)
    } else {
      await reportsApi.update(reportId.value!, payload)
      ElMessage.success('已保存')
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    saving.value = false
  }
}

async function preview() {
  if (!form.selected_codes.length) { ElMessage.warning('至少选择一个字段才能预览'); return }
  if (isNew.value) { ElMessage.info('请先保存草稿后再预览'); return }
  previewing.value = true
  try {
    if (form.transpose.enabled && form.transpose.rules?.length) await transposeRef.value?.ensureCcMaster()
    await reportsApi.update(reportId.value!, buildPayload())
    const res = await reportsApi.run(reportId.value!, previewPage.value, previewPageSize.value)
    previewColumns.value = res.columns
    previewItems.value = res.items
    previewTotal.value = res.total
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '预览失败')
  } finally {
    previewing.value = false
  }
}

onMounted(async () => {
  await loadDatasets()
  if (!isNew.value) await loadReport()
})

watch(
  () => route.params.id,
  async (v) => {
    if (!v) return
    if (v === 'new') {
      Object.assign(form, {
        name: '', description: '', source_type: 'single',
        table_name: 'emp_realtime_roster', dataset_id: null,
        is_published: false, selected_codes: [], filters: [], sorts: [],
        value_rules: [], aggregate: false, default_aggregation: 'sum', aggregations: {},
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
      singleTableDatasetId.value = null
    } else {
      await loadReport()
    }
  }
)
</script>

<template>
  <div style="padding: 24px">
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <div>
            <el-button link @click="router.push('/report/list')">
              <el-icon><ArrowLeft /></el-icon>返回列表
            </el-button>
            <span style="font-size: 16px; font-weight: 600; margin-left: 8px">
              {{ isNew ? '新建报表' : `编辑报表 · ${form.name || '(未命名)'}` }}
            </span>
          </div>
          <div>
            <el-button :loading="previewing" :disabled="isNew" @click="preview">
              <el-icon style="margin-right: 4px"><View /></el-icon>预览
            </el-button>
            <el-button type="primary" :loading="saving" @click="save">
              <el-icon style="margin-right: 4px"><Check /></el-icon>保存
            </el-button>
          </div>
        </div>
      </template>

      <el-form label-position="top">
        <div class="section-title">基本信息</div>
        <ReportBasicInfo
          v-model:name="form.name"
          v-model:description="form.description"
          v-model:source-type="form.source_type"
          v-model:table-name="form.table_name"
          v-model:dataset-id="form.dataset_id"
          v-model:is-published="form.is_published"
          :tables="TABLES"
          :datasets="datasets"
          :current-dataset="currentDataset"
          @source-change="onSourceChange"
          @table-change="onTableChange"
          @dataset-change="onDatasetChange"
        />

        <div class="section-title">报表设置（{{ form.selected_codes.length }} 个字段）</div>
        <CalculatedFieldBridge
          v-model:single-table-dataset-id="singleTableDatasetId"
          :source-type="form.source_type"
          :table-name="form.table_name"
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
              :all-columns="columns"
              :source-groups="sourceGroups"
              :loading="loading"
              :is-dataset="isDataset"
              :can-create-field="canCreateField"
              @create-field="createField"
            />
          </template>
        </CalculatedFieldBridge>

        <div class="section-title">筛选条件（{{ form.filters.length }} 个，多个之间为 AND）</div>
        <ReportFilterList
          ref="filterRef"
          v-model:filters="form.filters"
          v-model:filter-logic="form.filter_logic"
          :all-columns="allColumns"
          :table-name="form.table_name"
          :source-type="form.source_type"
          :current-dataset-tables="currentDataset?.tables"
        />

        <div class="section-title">排序（{{ form.sorts.length }} 个，按顺序应用）</div>
        <ReportSortList
          v-model:sorts="form.sorts"
          :all-columns="allColumns"
        />

        <template v-if="isDataset">
          <div class="section-title">转置 / 重映射</div>
          <ReportTransposeConfig
            ref="transposeRef"
            v-model:transpose="form.transpose"
            :selected-dimensions="selectedDimensions"
            :selected-measures="selectedMeasures"
            :selected-columns="selectedColsDetail"
          />

        </template>

        <template v-if="previewItems.length || previewTotal">
          <div class="section-title">预览结果（共 {{ previewTotal }} 行）</div>
          <ReportPreviewTable
            :columns="previewColumns"
            :items="previewItems"
            :total="previewTotal"
            :page="previewPage"
            :page-size="previewPageSize"
            :loading="previewing"
            @update:page="previewPage = $event"
            @update:page-size="previewPageSize = $event"
            @page-change="preview"
          />
        </template>
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
  margin: 24px 0 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--color-border-light);
}
</style>
