<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, View, Check, MagicStick, Position } from '@element-plus/icons-vue'
import CalculatedFieldBridge from '@/components/formula/CalculatedFieldBridge.vue'
import ReportBasicInfo from '@/components/report/ReportBasicInfo.vue'
import ReportFieldWorkbench from '@/components/report/ReportFieldWorkbench.vue'
import ReportFilterList from '@/components/report/ReportFilterList.vue'
import ReportListLookupConfig from '@/components/report/ReportListLookupConfig.vue'
import ReportTransposeConfig from '@/components/report/ReportTransposeConfig.vue'
import ReportPreviewTable from '@/components/report/ReportPreviewTable.vue'
import PushTargetList from '@/components/push/PushTargetList.vue'
import type { PushTargetOut } from '@/api/push_targets'
import { reportsApi, deriveValueRules, REPORT_VISIBILITY_LABELS, type AggregationFunc, type ColumnSetting, type DefaultSplitRule, type FilterLogic, type ListLookupConfig, type ReportVisibility, type ReshapeConflictStrategy, type RunResult } from '@/api/reports'
import type { ColumnInfo } from '@/api/data'
import { datasetsApi, type DatasetCalculatedField, type DatasetItem } from '@/api/datasets'
import { useTableOptions } from '@/composables/useTableOptions'
import { SCOPE_STRATEGY_OPTIONS, type ScopeStrategy } from '@/constants/scopeStrategy'
import {
  dependencyCount,
  removeReportColumnInstance,
} from '@/utils/reportColumnDependencies'

const { tables: TABLES } = useTableOptions()

const route = useRoute()
const router = useRouter()

const reportId = computed(() => {
  const id = route.params.id as string
  return id === 'new' ? null : Number(id)
})
const isNew = computed(() => reportId.value === null)
const copySourceId = ref<number | null>(null)
const isCopyMode = computed(() => copySourceId.value !== null)
const saveCreatesReport = computed(() => isNew.value || isCopyMode.value)
const pageTitle = computed(() => {
  if (isNew.value) return '新建报表'
  const name = form.name || '(未命名)'
  return isCopyMode.value
    ? `编辑报表 · ${name}（保存后生成我的副本）`
    : `编辑报表 · ${name}`
})

const form = reactive({
  name: '',
  description: '',
  dataset_id: null as number | null,
  visibility: 'private' as ReportVisibility,
  scope_strategy: null as ScopeStrategy | null,
  selected_codes: [] as string[],
  column_settings: {} as Record<string, ColumnSetting>,
  default_split_rule: { enabled: false, factors: [] } as DefaultSplitRule,
  rounding_group_by: [] as string[],
  filters: [] as any[],
  filter_logic: null as FilterLogic | null,
  sorts: [] as any[],
  value_rules: [] as { target: string; factors: string[] }[],
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
  list_lookup: {
    enabled: false,
    operator: 'union',
    lookup: { target_field: '' },
    sources: [],
  } as ListLookupConfig,
  rounding_corrections: [] as { group_by: string; target_cols: string[] }[],
  acl: [] as { id?: number; role_id: number | null; user_id: number | null }[],
})

async function removeSelectedColumn(instanceId: string) {
  const result = removeReportColumnInstance({
    selectedCodes: form.selected_codes,
    columnSettings: form.column_settings,
    defaultSplitRule: form.default_split_rule,
    sorts: form.sorts,
    aggregations: form.aggregations,
    roundingGroupBy: form.rounding_group_by,
  }, instanceId)
  const count = dependencyCount(result.dependencies)

  if (count) {
    try {
      await ElMessageBox.confirm(
        `该字段被 ${count} 项排序、聚合或分摊配置引用。移除会同步清理这些配置，可能改变报表口径。`,
        '确认移除字段',
        {
          confirmButtonText: '移除并清理依赖',
          cancelButtonText: '取消',
          type: 'warning',
        },
      )
    } catch {
      return
    }
  }

  form.selected_codes = result.state.selectedCodes
  form.column_settings = result.state.columnSettings
  form.default_split_rule = result.state.defaultSplitRule
  form.sorts = result.state.sorts
  form.aggregations = result.state.aggregations
  form.rounding_group_by = result.state.roundingGroupBy
}

const allColumns = ref<ColumnInfo[]>([])
const datasets = ref<DatasetItem[]>([])
const currentDataset = ref<DatasetItem | null>(null)
const saving = ref(false)
const previewing = ref(false)
const explaining = ref(false)
const explainOpen = ref(false)
const explainResult = ref<Awaited<ReturnType<typeof reportsApi.explainConfig>> | null>(null)
const explainInput = ref('')
const explainScrollRef = ref<HTMLElement | null>(null)
const previewColumns = ref<RunResult['columns']>([])
const previewItems = ref<RunResult['items']>([])
const previewTotal = ref(0)
const previewPage = ref(1)
const previewPageSize = ref(20)
const reportPushSourceTable = computed(() => reportId.value ? `report:${reportId.value}` : '')
const reportPushColumns = computed(() => selectedColsDetail.value.map((c) => ({
  code: instanceIdOf(c),
  label: outputLabel(c),
  data_type: c.data_type || 'text',
  is_pk_part: false,
  is_sensitive: !!c.is_sensitive,
  is_visible: true,
  display_order: form.selected_codes.indexOf(instanceIdOf(c)),
  auto_discovered: false,
  agg_role: c.agg_role || '',
  is_computed: !!c.is_computed,
})))
const reportPushTargets = ref<PushTargetOut[]>([])
const reportPushEnabled = computed(() => reportPushTargets.value.length > 0)
const basicSettingsOpen = ref(false)
const currentDatasetName = computed(() => currentDataset.value?.name || datasets.value.find((d) => d.id === form.dataset_id)?.name || '未选择数据集')
const publishStatusLabel = computed(() => REPORT_VISIBILITY_LABELS[form.visibility])
const scopeStrategyLabel = computed(() => SCOPE_STRATEGY_OPTIONS.find((item) => item.value === form.scope_strategy)?.label || '继承默认')
const filterSummary = computed(() => form.filters.length ? `${form.filters.length} 条筛选` : '未设置筛选')
const pushSummary = computed(() => reportPushTargets.value.length ? `${reportPushTargets.value.length} 个推送配置` : '未配置推送')

const transposeRef = ref<InstanceType<typeof ReportTransposeConfig> | null>(null)
const filterRef = ref<InstanceType<typeof ReportFilterList> | null>(null)

interface ExplainChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  traceId?: string | null
}

let explainChatId = 0
const explainMessages = ref<ExplainChatMessage[]>([])

/** Track B: source_code lookup — strip #N suffix from instance_id */
function sourceCode(instanceId: string): string {
  return instanceId.replace(/#\d+$/, '')
}

const selectedColsDetail = computed(() =>
  form.selected_codes
    .map((id) => {
      const col = allColumns.value.find((c) => c.code === sourceCode(id))
      return col ? { ...col, _instance_id: id } as ColumnInfo & { _instance_id: string } : null
    })
    .filter(Boolean) as (ColumnInfo & { _instance_id: string })[]
)
function isCountAggregation(value?: string) {
  return value === 'count' || value === 'count_distinct'
}

function instanceIdOf(col: ColumnInfo & { _instance_id?: string }) {
  return col._instance_id || col.code
}

function outputLabel(col: ColumnInfo & { _instance_id?: string }) {
  const instanceId = instanceIdOf(col)
  const label = form.column_settings[instanceId]?.display_name || col.label || col.code
  return instanceId === col.code ? label : `${label} (${instanceId.split('#').pop()})`
}

function isCountMetric(col: ColumnInfo & { _instance_id?: string }) {
  return col.agg_role !== 'measure' && isCountAggregation(form.column_settings[instanceIdOf(col)]?.aggregation)
}

function isMeasureLike(col: ColumnInfo) {
  return col.agg_role === 'measure' || isCountMetric(col)
}

const selectedDimensions = computed(() =>
  selectedColsDetail.value.filter((c) => !isMeasureLike(c))
)
const selectedMeasures = computed(() =>
  selectedColsDetail.value.filter((c) => isMeasureLike(c))
)
const isDataset = computed(() => true)

async function loadDatasets() {
  try {
    const all = await datasetsApi.list()
    // P3-01: 报表只能引用 DWD/DWS 数据集
    datasets.value = all.filter((d) => d.warehouse_layer === 'DWD' || d.warehouse_layer === 'DWS')
    if (isNew.value && !form.dataset_id) {
      form.dataset_id = datasets.value.find((d) => d.is_active)?.id ?? datasets.value[0]?.id ?? null
    }
  } catch {
    datasets.value = []
  }
}

async function loadReport() {
  if (isNew.value) return
  try {
    const r = await reportsApi.get(reportId.value!)
    copySourceId.value = r.can_edit ? null : r.id
    form.name = r.can_edit ? r.name : `${r.name} - 副本`
    form.description = r.description ?? ''
    form.dataset_id = r.dataset_id
    form.visibility = r.can_edit ? (r.visibility ?? 'private') : 'private'
    form.scope_strategy = r.scope_strategy
    form.acl = r.can_edit
      ? (r.acl || []).map((a) => ({ id: a.id, role_id: a.role_id, user_id: a.user_id }))
      : []
    form.selected_codes = [...(r.config.columns ?? [])].map(c =>
      typeof c === 'string' ? c : c.instance_id
    )
    form.column_settings = { ...(r.config.column_settings ?? {}) }
    form.default_split_rule = {
      enabled: !!r.config.default_split_rule?.enabled,
      factors: r.config.default_split_rule?.factors ?? (r.config.default_split_rule?.factor ? [r.config.default_split_rule.factor] : []),
    }
    form.filters = (r.config.filters ?? []).map((f) => ({ ...f }))
    form.filter_logic = r.config.filter_logic ?? null
    form.sorts = (r.config.sorts ?? []).map((s) => ({ ...s }))
    // 拆分规则只由 column_settings + default_split_rule 派生（见 buildPayload），
    // 不再回写旧 value_rules，否则历史脏规则会反复复活。
    form.value_rules = []
    form.aggregate = r.config.aggregate ?? false
    form.default_aggregation = (r.config.default_aggregation || 'sum') as AggregationFunc
    form.aggregations = { ...(r.config.aggregations ?? {}) }
    for (const [code, aggregation] of Object.entries(form.aggregations)) {
      if (aggregation && !form.column_settings[code]?.aggregation) {
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
    form.list_lookup = {
      enabled: !!r.config.list_lookup?.enabled,
      operator: r.config.list_lookup?.operator || 'union',
      lookup: {
        target_field: r.config.list_lookup?.lookup?.target_field || '',
      },
      sources: (r.config.list_lookup?.sources || []).map((source) => ({
        ...source,
        filters: (source.filters || []).map((f) => ({ ...f })),
        filter_logic: source.filter_logic || null,
        resolver: source.resolver ? { ...source.resolver } : undefined,
      })),
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
    if (!r.can_edit) {
      ElMessage.info('正在编辑副本，保存后会生成你的新报表')
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载报表失败')
  }
}

function resetForm() {
  form.selected_codes = []
  form.column_settings = {}
  form.default_split_rule = { enabled: false, factors: [] }
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
  form.list_lookup = {
    enabled: false,
    operator: 'union',
    lookup: { target_field: '' },
    sources: [],
  }
  form.rounding_corrections = []
  filterRef.value?.clearCache()
  previewColumns.value = []
  previewItems.value = []
  previewTotal.value = 0
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

function normalizeFilters(filters: any[], withViewControls = false) {
  return (filters || [])
    .filter((f) => f.column)
    .map((f) => {
      const op = f.op
      let value: any = f.value
      if (op === 'is_null' || op === 'is_not_null') value = null
      else if ((op === 'between' || op === 'in') && typeof value === 'string') {
        value = value.split(',').map((s: string) => s.trim()).filter(Boolean)
      }
      const out: any = { column: f.column, op, value }
      if (withViewControls) {
        out.visible = f.visible ?? true
        out.locked = f.locked ?? false
      }
      return out
    })
}

function normalizeColumnSettings() {
  return Object.fromEntries(
    Object.entries(form.column_settings)
      .map(([code, setting]) => {
      const next: ColumnSetting = { ...setting }
      next.metric_filters = normalizeFilters(next.metric_filters || [])
      next.metric_filter_logic =
        next.metric_filter_logic?.mode === 'custom' && next.metric_filter_logic.expression?.trim()
          ? { mode: 'custom', expression: next.metric_filter_logic.expression.trim() }
          : null
      if (!next.metric_filters.length) {
        delete next.metric_filters
        delete next.metric_filter_logic
      }
      return [code, next]
    }),
  )
}

function buildPayload() {
  const tailCode = (q: string) => {
    const source = sourceCode(q)
    return source.includes('.') ? source.slice(source.indexOf('.') + 1) : source
  }
  // 剔除数据集里已不存在的字段引用（如已删除的计算字段），避免脏引用被持久化后在查看时反复告警。
  // 守卫 allColumns 非空：字段尚未加载完时保持原样，不误清空。
  // Track B: 转为 ColumnInstance[] 格式发送
  const validSelectedColumns = form.selected_codes.map((id) => ({
    source_code: sourceCode(id),
    instance_id: id,
  }))
  const selectedDimCodes = selectedDimensions.value.map(instanceIdOf)
  const selectedMeasureCodes = selectedMeasures.value.map(instanceIdOf)
  const selectedPhysicalMeasureCodes = selectedMeasures.value
    .filter((c) => c.agg_role === 'measure')
    .map(instanceIdOf)
  const c2r = form.transpose.column_to_row || {}
  const r2c = form.transpose.row_to_column || {}
  const filterLogic: FilterLogic | null =
    form.filter_logic?.mode === 'custom' && form.filter_logic.expression?.trim()
      ? { mode: 'custom', expression: form.filter_logic.expression.trim() }
      : null
  const valueRules = deriveValueRules(
    form.column_settings,
    form.default_split_rule,
    selectedPhysicalMeasureCodes,
  )

  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    dataset_id: form.dataset_id!,
    visibility: form.visibility,
    scope_strategy: form.scope_strategy || null,
    acl: form.visibility === 'scoped'
      ? form.acl
          .filter((a) => a.role_id != null || a.user_id != null)
          .map((a) => ({ role_id: a.role_id, user_id: a.user_id }))
      : [],
    config: {
      columns: validSelectedColumns,
      column_settings: normalizeColumnSettings(),
      default_split_rule: form.default_split_rule,
      filters: normalizeFilters(form.filters, true),
      filter_logic: filterLogic,
      sorts: form.sorts.filter((s) => s.column),
      value_rules: valueRules,
      aggregate: form.aggregate,
      default_aggregation: form.default_aggregation || 'sum',
      aggregations: form.aggregate
        ? Object.fromEntries(
            selectedMeasures.value.map((c) => {
              const id = (c as any)._instance_id || c.code
              const key = id
              return [
                key,
                form.column_settings[id]?.aggregation
                  || form.default_aggregation
                  || 'sum',
              ]
            }),
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
          source_cols: [...(c2r.source_cols || [])],
          group_by: [...(c2r.group_by || [])],
          item_label: c2r.item_label || '项目',
          value_label: c2r.value_label || '金额',
          conflict_strategy: (c2r.conflict_strategy || 'keep_all') as ReshapeConflictStrategy,
        },
        row_to_column: {
          enabled: !!r2c.enabled,
          group_by: [...(r2c.group_by || [])],
          pivot_col: r2c.pivot_col || '',
          value_col: r2c.value_col || '',
          pivot_values: (r2c.pivot_values || [])
            .filter((item: any) => item.value !== '')
            .map((item: any) => ({ value: item.value, label: item.label || '' })),
          fill_value: r2c.fill_value ?? '--',
          conflict_strategy: (r2c.conflict_strategy || 'first') as Exclude<ReshapeConflictStrategy, 'keep_all'>,
        },
      },
      list_lookup: {
        enabled: !!form.list_lookup.enabled,
        operator: form.list_lookup.operator || 'union',
        lookup: {
          target_field: form.list_lookup.lookup?.target_field || '',
        },
        sources: (form.list_lookup.sources || [])
          .filter((source) => {
            if (source.type === 'field_values') return !!source.source_field
            return !!source.return_field
          })
          .map((source) => ({
            ...source,
            filters: (source.filters || [])
              .filter((f) => f.column)
              .map((f) => {
                const op = f.op
                let value: any = f.value
                if (op === 'is_null' || op === 'is_not_null') value = null
                else if ((op === 'between' || op === 'in') && typeof value === 'string') {
                  value = value.split(',').map((s: string) => s.trim()).filter(Boolean)
                }
                return { column: f.column, op, value }
              }),
            filter_logic: source.filter_logic?.mode === 'custom' && source.filter_logic.expression?.trim()
              ? ({ mode: 'custom', expression: source.filter_logic.expression.trim() } as FilterLogic)
              : null,
            resolver: source.type === 'field_values'
              ? {
                  enabled: source.resolver?.enabled === true,
                  match_field: source.resolver?.match_field || '',
                  return_field: source.resolver?.return_field || '',
                }
              : undefined,
          })),
      },
      rounding_corrections: form.aggregate && form.rounding_group_by.length && selectedPhysicalMeasureCodes.length
        ? [{ group_by: [...form.rounding_group_by], target_cols: selectedPhysicalMeasureCodes }]
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
  if (!form.dataset_id) { ElMessage.warning('请选择数据集'); return }
  saving.value = true
  try {
    if (form.transpose.enabled && form.transpose.rules?.length) await transposeRef.value?.ensureCcMaster()
    const payload = buildPayload()
    if (saveCreatesReport.value) {
      const r = await reportsApi.create(payload)
      ElMessage.success(isCopyMode.value ? '已另存为你的报表' : '已创建')
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
  if (saveCreatesReport.value) { ElMessage.info('请先保存为你的报表后再预览'); return }
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

function explainHistoryPayload() {
  return explainMessages.value.slice(-8).map((item) => ({
    role: item.role,
    content: item.content,
  }))
}

function scrollExplainToBottom() {
  nextTick(() => {
    const el = explainScrollRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function buildExplainPayload(question: string) {
  const payload = buildPayload()
  return {
    report_id: reportId.value,
    report_name: payload.name || '未命名报表',
    description: payload.description,
    columns: payload.config.columns,
    filters: payload.config.filters,
    sorts: payload.config.sorts,
    aggregate: payload.config.aggregate,
    aggregations: payload.config.aggregations,
    column_settings: payload.config.column_settings,
    question,
    history: explainHistoryPayload().filter((item) => item.content !== question),
  }
}

async function sendExplainQuestion(question: string, options: { showUserMessage?: boolean } = {}) {
  if (!form.selected_codes.length) { ElMessage.warning('至少选择一个字段才能解释'); return }
  const text = question.trim()
  if (!text) {
    ElMessage.warning('请先输入要追问的问题')
    return
  }
  if (options.showUserMessage !== false) {
    explainMessages.value.push({
      id: ++explainChatId,
      role: 'user',
      content: text,
    })
  }
  explainOpen.value = true
  explainInput.value = ''
  scrollExplainToBottom()
  explaining.value = true
  try {
    const result = await reportsApi.explainConfig(buildExplainPayload(text))
    explainResult.value = result
    explainMessages.value.push({
      id: ++explainChatId,
      role: 'assistant',
      content: result.answer || result.summary,
      traceId: result.trace_id,
    })
    scrollExplainToBottom()
  } catch (e: any) {
    const message = explainErrorMessage(e)
    ElMessage.error(message)
    explainMessages.value.push({
      id: ++explainChatId,
      role: 'assistant',
      content: message,
    })
    scrollExplainToBottom()
  } finally {
    explaining.value = false
  }
}

async function explainConfig() {
  if (!explainMessages.value.length) {
    await sendExplainQuestion('请解释当前报表配置。', { showUserMessage: false })
    return
  }
  explainOpen.value = true
  scrollExplainToBottom()
}

function sendExplainInput() {
  sendExplainQuestion(explainInput.value)
}

function handleExplainKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendExplainInput()
  }
}

function explainErrorMessage(e: any) {
  if (e?.code === 'ECONNABORTED') {
    return '模型回答超时了，请稍后重试，或在 AI 基础配置里调大超时时间。'
  }
  return e?.response?.data?.detail || 'AI 解释失败'
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
      copySourceId.value = null
      Object.assign(form, {
        name: '', description: '', dataset_id: datasets.value.find((d) => d.is_active)?.id ?? datasets.value[0]?.id ?? null,
        visibility: 'private', scope_strategy: null, selected_codes: [], filters: [], sorts: [],
        value_rules: [], aggregate: false, default_aggregation: 'sum', aggregations: {},
        column_settings: {}, default_split_rule: { enabled: false, factors: [] }, rounding_group_by: [], filter_logic: null,
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
        list_lookup: {
          enabled: false,
          operator: 'union',
          lookup: { target_field: '' },
          sources: [],
        },
        rounding_corrections: [],
      })
      previewItems.value = []
      previewColumns.value = []
    } else {
      copySourceId.value = null
      await loadReport()
    }
  }
)
</script>

<template>
  <div class="designer-page">
    <el-card class="designer-card">
      <template #header>
        <div class="designer-header">
          <div class="designer-title-wrap">
            <el-button link class="back-button" @click="router.push('/report/list')">
              <el-icon><ArrowLeft /></el-icon>返回列表
            </el-button>
            <div class="designer-title-block">
              <span class="designer-title">{{ pageTitle }}</span>
              <span class="designer-subtitle">{{ currentDatasetName }} · {{ publishStatusLabel }} · {{ form.selected_codes.length }} 个字段 · {{ filterSummary }}</span>
            </div>
          </div>
          <div class="designer-actions">
            <el-button plain @click="basicSettingsOpen = true">基础设置</el-button>
            <el-button :loading="explaining" @click="explainConfig">
              <el-icon style="margin-right: 4px"><MagicStick /></el-icon>AI 解释
            </el-button>
            <el-button :loading="previewing" :disabled="saveCreatesReport" @click="preview">
              <el-icon style="margin-right: 4px"><View /></el-icon>预览
            </el-button>
            <el-button type="primary" :loading="saving" @click="save">
              <el-icon style="margin-right: 4px"><Check /></el-icon>保存
            </el-button>
          </div>
        </div>
      </template>

      <el-form label-position="top" class="designer-form">
        <div class="section-title compact-section-title">
          字段编排（{{ form.selected_codes.length }} 个字段）
        </div>
        <CalculatedFieldBridge
          :dataset-id="form.dataset_id"
          :datasets="datasets"
          :tables="TABLES"
          @columns-change="allColumns = $event"
          @dataset-change="currentDataset = $event"
          @saved="onCalculatedFieldSaved"
        >
          <template #default="{ columns, loading, sourceGroups, canCreateField, createField, editField }">
            <ReportFieldWorkbench
              v-model:selected-codes="form.selected_codes"
              v-model:column-settings="form.column_settings"
              v-model:default-split-rule="form.default_split_rule"
              v-model:default-aggregation="form.default_aggregation"
              v-model:aggregate="form.aggregate"
              v-model:rounding-group-by="form.rounding_group_by"
              v-model:sorts="form.sorts"
              @remove-column="removeSelectedColumn"
              :all-columns="columns"
              :source-groups="sourceGroups"
              :current-dataset-tables="currentDataset?.tables"
              :loading="loading"
              :lookup-enabled="form.list_lookup.enabled"
              :push-enabled="reportPushEnabled"
              :push-target-count="reportPushTargets.length"
              :is-dataset="isDataset"
              :can-create-field="canCreateField"
              @create-field="createField"
              @edit-field="editField"
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

              <template #lookup>
                <ReportListLookupConfig
                  v-model:list-lookup="form.list_lookup"
                  :all-columns="allColumns"
                  :current-dataset-tables="currentDataset?.tables"
                />
              </template>

              <template #push>
                <el-alert
                  v-if="saveCreatesReport"
                  type="info"
                  :closable="false"
                  show-icon
                  title="保存为你的报表后，可为该报表配置多个对外推送配置；从他人报表进入编辑时不会带入原报表推送配置。"
                  style="margin-bottom: 12px"
                />
                <PushTargetList
                  v-else-if="reportPushSourceTable"
                  :source-table="reportPushSourceTable"
                  :source-columns="reportPushColumns"
                  compact
                  hide-header
                  @targets-change="reportPushTargets = $event"
                />
              </template>
            </ReportFieldWorkbench>
          </template>
        </CalculatedFieldBridge>

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

    <el-drawer
      v-model="basicSettingsOpen"
      title="报表基础设置"
      size="min(720px, 92vw)"
      append-to-body
      class="report-settings-drawer"
    >
      <el-form label-position="top">
        <ReportBasicInfo
          v-model:name="form.name"
          v-model:description="form.description"
          v-model:dataset-id="form.dataset_id"
          v-model:visibility="form.visibility"
          v-model:scope-strategy="form.scope_strategy"
          v-model:acl="form.acl"
          :datasets="datasets"
          :current-dataset="currentDataset"
          @dataset-change="onDatasetChange"
        />
      </el-form>
    </el-drawer>

    <el-drawer
      v-model="explainOpen"
      title="AI 报表助手"
      size="min(640px, 92vw)"
      append-to-body
      class="report-ai-drawer"
    >
      <div class="report-ai-chat">
        <section class="ai-drawer-intro">
          <strong>帮你读懂当前报表配置</strong>
          <span>可以追问字段、筛选、排序、汇总口径，也可以让它帮你检查配置是否符合预期。</span>
        </section>
        <div ref="explainScrollRef" class="report-chat-thread">
          <div v-if="!explainMessages.length && !explaining" class="chat-empty">
            打开后会先解释当前报表配置，你也可以继续追问字段、筛选、排序和后续功能阶段。
          </div>
          <div
            v-for="item in explainMessages"
            :key="item.id"
            class="chat-message"
            :class="item.role"
          >
            <div class="chat-bubble">
              <div class="chat-content">{{ item.content }}</div>
              <div v-if="item.traceId" class="trace-line">trace_id: {{ item.traceId }}</div>
            </div>
          </div>
          <div v-if="explaining" class="chat-message assistant">
            <div class="chat-bubble">正在读取当前配置并回答...</div>
          </div>
        </div>

        <div class="ai-send-box">
          <el-input
            v-model="explainInput"
            class="ai-send-input"
            type="textarea"
            :autosize="{ minRows: 1, maxRows: 3 }"
            resize="none"
            placeholder="继续追问，例如：这个报表的筛选条件是什么意思？"
            @keydown="handleExplainKeydown"
          />
          <div class="ai-send-actions">
            <span class="send-hint">Enter 发送，Shift+Enter 换行</span>
            <el-button
              class="send-icon-button"
              type="primary"
              circle
              :loading="explaining"
              @click="sendExplainInput"
            >
              <el-icon><Position /></el-icon>
            </el-button>
          </div>
        </div>

        <template v-if="explainResult">
          <div class="explain-metrics">
            <div>
              <strong>{{ explainResult.field_count }}</strong>
              <span>字段</span>
            </div>
            <div>
              <strong>{{ explainResult.filter_count }}</strong>
              <span>筛选</span>
            </div>
            <div>
              <strong>{{ explainResult.sort_count }}</strong>
              <span>排序</span>
            </div>
            <div>
              <strong>{{ explainResult.aggregation_count }}</strong>
              <span>聚合</span>
            </div>
          </div>

          <el-collapse>
            <el-collapse-item title="配置上下文" name="context">
              <section class="explain-section">
                <div class="explain-title">可见字段</div>
                <div class="tag-list">
                  <el-tag
                    v-for="field in explainResult.visible_fields"
                    :key="field"
                    size="small"
                    effect="plain"
                  >
                    {{ field }}
                  </el-tag>
                </div>
              </section>

              <section v-if="explainResult.warnings.length" class="explain-section">
                <div class="explain-title">提示</div>
                <el-alert
                  v-for="item in explainResult.warnings"
                  :key="item"
                  :title="item"
                  type="warning"
                  show-icon
                  :closable="false"
                  class="warning-item"
                />
              </section>

              <section class="explain-section">
                <div class="explain-title">Context Packet</div>
                <pre class="context-json">{{ JSON.stringify(explainResult.context_packet, null, 2) }}</pre>
              </section>
            </el-collapse-item>
          </el-collapse>
        </template>
      </div>
    </el-drawer>
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

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-title-row :deep(.el-button) {
  text-transform: none;
  letter-spacing: 0;
}


.designer-card :deep(.el-card__header) {
  position: sticky;
  top: 0;
  z-index: 6;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(10px);
}
.designer-card :deep(.el-card__body) {
  padding: 12px 16px 16px;
}
.designer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
}
.designer-title-wrap {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 10px;
}
.back-button {
  flex: 0 0 auto;
}
.designer-title-block {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.designer-title {
  overflow: hidden;
  color: var(--color-text-primary);
  font-size: 16px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.designer-subtitle {
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.designer-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex: 0 0 auto;
  flex-wrap: wrap;
}
.designer-form {
  display: grid;
  gap: 12px;
}
.compact-section-title {
  margin: 0 0 2px;
}
@media (max-width: 900px) {
  .designer-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .designer-actions {
    width: 100%;
    justify-content: flex-start;
  }
}

.report-settings-drawer :deep(.el-drawer__body) {
  padding: 16px;
  background: var(--color-bg-page);
}
.report-settings-drawer :deep(.report-basic-info) {
  border-radius: 12px;
}
.report-settings-drawer :deep(.basic-grid) {
  grid-template-columns: 1fr;
}
.report-ai-chat {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
}

.report-ai-drawer :deep(.el-drawer__body) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 16px;
  background: var(--color-bg-page);
}

.ai-drawer-intro {
  display: grid;
  gap: 4px;
  padding: 14px 16px;
  border: 1px solid var(--color-border-light);
  border-radius: 12px;
  background:
    radial-gradient(circle at top left, rgba(20, 86, 240, 0.12), transparent 34%),
    #fff;
}

.ai-drawer-intro strong {
  color: var(--color-text-primary);
  font-size: 15px;
}

.ai-drawer-intro span {
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.report-chat-thread {
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: 260px;
  flex: 1;
  overflow: auto;
  padding: 14px;
  border: 1px solid var(--color-border-light);
  border-radius: 12px;
  background: var(--color-bg-subtle);
  overscroll-behavior: contain;
}

.chat-empty {
  color: var(--color-text-placeholder);
  font-size: 13px;
  line-height: 1.6;
}

.chat-message {
  display: flex;
  min-width: 0;
}

.chat-message.user {
  justify-content: flex-end;
}

.chat-message.assistant {
  justify-content: flex-start;
}

.chat-bubble {
  display: grid;
  gap: 6px;
  max-width: 86%;
  padding: 11px 13px;
  border: 1px solid var(--color-border-light);
  border-radius: 12px;
  background: #fff;
  color: var(--color-text-primary);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.chat-message.user .chat-bubble {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}

.trace-line {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-placeholder);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ai-send-box {
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--color-border-light);
  border-radius: 24px;
  background: #fff;
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.08);
}

.ai-send-input :deep(.el-textarea__inner) {
  min-height: 30px !important;
  padding: 2px 0;
  border: 0;
  box-shadow: none;
  color: var(--color-text-primary);
  font-size: 14px;
  line-height: 1.6;
}

.ai-send-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.send-hint {
  min-width: 0;
  color: var(--color-text-placeholder);
  font-size: 12px;
}

.send-icon-button {
  flex: 0 0 auto;
}

.explain-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.explain-metrics > div {
  border: 1px solid var(--color-border-light);
  border-radius: 10px;
  padding: 10px 8px;
  text-align: center;
  background: var(--color-bg-soft);
}

.explain-metrics strong {
  display: block;
  font-size: 20px;
  line-height: 1.2;
}

.explain-metrics span {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.explain-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.explain-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.warning-item + .warning-item {
  margin-top: 6px;
}

.context-json {
  max-height: 280px;
  overflow: auto;
  margin: 0;
  padding: 12px;
  border-radius: 10px;
  background: #111827;
  color: #e5e7eb;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
