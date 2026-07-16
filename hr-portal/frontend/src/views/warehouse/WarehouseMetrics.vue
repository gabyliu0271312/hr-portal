<script setup lang="ts">
import { formatDateTime } from '@/utils/datetime'
import { computed, onMounted, ref, watch } from 'vue'
import { useUserStore } from '@/stores/user'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Refresh, Edit, Finished, FolderDelete, TrendCharts, VideoPlay, DataAnalysis, Loading } from '@element-plus/icons-vue'
import {
  listMetrics, createMetric, updateMetric, getMetric, publishMetric, archiveMetric,
  computeMetric, recalcMetric, listMetricResults, listMetricRuns, listModels,
  listDwsAggregates, getMetricExplain, METRIC_RUN_STATUS_LABELS,
  type MetricListItem, type MetricDetail, type MetricCreatePayload, type MetricUpdatePayload,
  type MetricResult, type MetricRun, type DwsAggregate,
  type MetricExplainContext,
} from '@/api/warehouse'
import {
  decomposeFormula, batchSaveMetricComponents, listMetricComponents,
  COMPONENT_ROLE_LABELS,
  type ComponentRole, type MetricComponentItem, type FormulaDecomposeResult,
  type MetricComponentBatchPayload,
} from '@/api/warehouse'
import { translateFormula, compileFormula, type FormulaCompileResult } from '@/api/warehouse'
import {
  getMetricLineage, getMetricDownstreamRefs, getMetricResultDetail, exportMetricResult, recordExportAudit, recordAiExplainAudit,
  type LineageGraph, type DownstreamRefsResult, type MetricResultDetail,
} from '@/api/warehouse'
import { dataApi, type ColumnInfo } from '@/api/data'
import { datasetsApi, type DatasetCalculatedField } from '@/api/datasets'
import MetricAutomationPanel from '@/components/warehouse/MetricAutomationPanel.vue'
import FormulaFieldEditor from '@/components/formula/FormulaFieldEditor.vue'

const userStore = useUserStore()
const metrics = ref<MetricListItem[]>([])
const loading = ref(false)
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const statusFilter = ref('')

const TYPE_LABELS: Record<string, string> = { count: '计数', sum: '求和', ratio: '比率', derived: '派生', text: '文本' }
const TYPE_TAG: Record<string, string> = { count: '', sum: 'success', ratio: 'warning', derived: 'info', text: 'info' }
const metricTypeLabel = computed(() => TYPE_LABELS[form.value.metric_type || 'derived'] || '派生')
const metricTypeTagType = computed(() => TYPE_TAG[form.value.metric_type || 'derived'] || 'info')
const STATUS_LABELS: Record<string, string> = { draft: '草稿', published: '已发布', archived: '已归档' }
const STATUS_TAG: Record<string, string> = { draft: 'info', published: 'success', archived: 'info' }

// 详情面板（R0303）
const detailVisible = ref(false)
const detailMetricId = ref<number | null>(null)
const detailMetric = ref<MetricDetail | null>(null)
const results = ref<MetricResult[]>([])
const runs = ref<MetricRun[]>([])
const resultsLoading = ref(false)
const runsLoading = ref(false)
const computePeriod = ref('')
const computing = ref(false)

// MR0301: 指标解释上下文
const explainContext = ref<MetricExplainContext | null>(null)
const explainLoading = ref(false)

// MR0303: 指标血缘图
const lineageGraph = ref<LineageGraph | null>(null)
const lineageLoading = ref(false)

// MR0304: 下游引用列表
const downstreamRefs = ref<DownstreamRefsResult | null>(null)
const downstreamRefsLoading = ref(false)

// MR0306: 结果明细权限态 + MR0101 分页
const resultDetail = ref<MetricResultDetail | null>(null)
const resultDetailLoading = ref(false)
const detailPage = ref(1)
const detailPageSize = ref(50)
const currentDetailResultId = ref<number | null>(null)
const currentDetailPeriod = ref('')
const exporting = ref(false)

// MR0103/0104: 从 dimension_values / measure_values 动态解析列
const detailDimCols = computed<string[]>(() => {
  const rd = resultDetail.value
  if (!rd) return []
  if (rd.dimensions?.length) return rd.dimensions
  const first = rd.rows?.[0]
  return first ? Object.keys(first.dimension_values || {}) : []
})
const detailMeasCols = computed<string[]>(() => {
  const rd = resultDetail.value
  if (!rd) return []
  if (rd.measures?.length) return rd.measures
  const first = rd.rows?.[0]
  return first ? Object.keys(first.measure_values || {}) : []
})

async function load() {
  loading.value = true
  try {
    const params: Record<string, any> = { page: page.value, page_size: pageSize.value }
    if (keyword.value) params.keyword = keyword.value
    if (statusFilter.value) params.status = statusFilter.value
    const res = await listMetrics(params)
    metrics.value = res.items
    total.value = res.total
  } catch { ElMessage.error('加载指标列表失败') }
  finally { loading.value = false }
}

async function openDetail(id: number) {
  clearPollTimer()
  lastComputeStatus.value = null; lastComputeError.value = null; computedResult.value = null
  lineageGraph.value = null; downstreamRefs.value = null; resultDetail.value = null
  detailMetricId.value = id
  detailVisible.value = true
  try {
    detailMetric.value = await getMetric(id)
  } catch { ElMessage.error('加载指标详情失败'); return }
  loadResults()
  loadRuns()
  loadExplainContext(id)
  loadLineage(id)
  loadDownstreamRefs(id)
}

async function loadExplainContext(id: number, period?: string) {
  explainLoading.value = true
  try {
    explainContext.value = await getMetricExplain(id, period)
  } catch { explainContext.value = null }
  finally { explainLoading.value = false }
}

async function loadLineage(id: number) {
  lineageLoading.value = true
  try {
    lineageGraph.value = await getMetricLineage(id)
  } catch { lineageGraph.value = null }
  finally { lineageLoading.value = false }
}

async function loadDownstreamRefs(id: number) {
  downstreamRefsLoading.value = true
  try {
    downstreamRefs.value = await getMetricDownstreamRefs(id)
  } catch { downstreamRefs.value = null }
  finally { downstreamRefsLoading.value = false }
}

async function loadResultDetail(metricId: number, resultId: number, period: string) {
  currentDetailResultId.value = resultId
  currentDetailPeriod.value = period
  resultDetailLoading.value = true
  try {
    resultDetail.value = await getMetricResultDetail(metricId, resultId, period, {
      page: detailPage.value,
      page_size: detailPageSize.value,
    })
    if (resultDetail.value?.permission_level === 'summary_only') {
      ElMessage.warning('您没有数据明细权限，仅可查看汇总值')
    }
  } catch { resultDetail.value = null }
  finally { resultDetailLoading.value = false }
}

async function changeDetailPage(next: number) {
  if (!detailMetricId.value || currentDetailResultId.value == null) return
  detailPage.value = next
  await loadResultDetail(detailMetricId.value, currentDetailResultId.value, currentDetailPeriod.value)
}

// MR0105/0106 + 结果行点击事件：点击计算结果列表的某一期，加载其明细
async function onResultRowClick(row: any) {
  if (row?.id == null) return
  detailPage.value = 1
  await loadResultDetail(detailMetricId.value!, row.id, row.period)
}

// MR0102: 导出结果明细为 CSV 文件
async function handleExportDetail() {
  if (!detailMetricId.value || currentDetailResultId.value == null) return
  exporting.value = true
  try {
    const blob = await exportMetricResult(detailMetricId.value, currentDetailResultId.value, currentDetailPeriod.value)
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `metric_${detailMetricId.value}_${currentDetailPeriod.value}_result.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
    await recordExportAudit(detailMetricId.value, currentDetailResultId.value)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '导出失败')
  } finally { exporting.value = false }
}

async function handleExportAudit() {
  if (!detailMetricId.value || !computedResult.value) return
  try {
    await recordExportAudit(detailMetricId.value, computedResult.value.id)
  } catch { /* 审计记录失败不阻塞用户 */ }
}

async function handleAiExplainAudit() {
  if (!detailMetricId.value || !computePeriod.value) return
  try {
    await recordAiExplainAudit(detailMetricId.value, computePeriod.value)
  } catch { /* 审计记录失败不阻塞用户 */ }
}

async function loadResults() {
  if (!detailMetricId.value) return
  resultsLoading.value = true
  try {
    const res = await listMetricResults(detailMetricId.value)
    results.value = res.items
  } catch { results.value = [] }
  finally { resultsLoading.value = false }
}

async function loadRuns() {
  if (!detailMetricId.value) return
  runsLoading.value = true
  try {
    const res = await listMetricRuns(detailMetricId.value)
    runs.value = res.items
  } catch { runs.value = [] }
  finally { runsLoading.value = false }
}

// 计算状态增强
const lastComputeStatus = ref<string | null>(null)
const lastComputeError = ref<string | null>(null)
const computedResult = ref<any>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

function clearPollTimer() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

async function pollRunStatus(runId: number, period: string) {
  clearPollTimer()
  pollTimer = setInterval(async () => {
    try {
      const runRes = await listMetricRuns(detailMetricId.value!)
      const run = (runRes.items || []).find((r: any) => r.period === period && r.status !== 'pending')
      if (run) {
        clearPollTimer()
        lastComputeStatus.value = run.status
        computing.value = false
        if (run.status === 'success') {
          ElMessage.success('计算完成')
          await loadResults()
          computedResult.value = (await listMetricResults(detailMetricId.value!)).items?.find((r: any) => r.period === period) || null
          if (computedResult.value) {
            detailPage.value = 1
            await loadResultDetail(detailMetricId.value!, computedResult.value.id, period)
          }
          loadExplainContext(detailMetricId.value!, period)
        } else {
          lastComputeError.value = run.error_message || '计算失败'
          ElMessage.error(lastComputeError.value || '计算失败')
        }
        await loadRuns()
      }
    } catch { /* ignore poll errors */ }
  }, 2000)
  setTimeout(() => { if (pollTimer) { clearPollTimer(); computing.value = false; ElMessage.warning('计算超时，请手动刷新查看结果') } }, 30000)
}

async function doCompute() {
  if (!computePeriod.value || !detailMetricId.value) {
    if (!computePeriod.value) ElMessage.warning('请输入计算期号')
    return
  }
  computing.value = true
  lastComputeStatus.value = 'pending'
  lastComputeError.value = null
  computedResult.value = null
  try {
    const res = await computeMetric(detailMetricId.value, computePeriod.value)
    if (res.run_id) {
      lastComputeStatus.value = 'running'
      await loadRuns()
      pollRunStatus(res.run_id, computePeriod.value)
    } else if (res.status === 'success') {
      lastComputeStatus.value = 'success'
      computing.value = false
      ElMessage.success('计算完成')
      loadResults(); loadRuns()
      if (detailMetricId.value) {
        loadExplainContext(detailMetricId.value, computePeriod.value)
        loadLineage(detailMetricId.value)
        loadDownstreamRefs(detailMetricId.value)
      }
      handleAiExplainAudit()
    } else {
      lastComputeStatus.value = 'failed'
      lastComputeError.value = res.error_message || '计算失败'
      computing.value = false
      ElMessage.error(res.error_message || '计算失败')
    }
  } catch (e: any) {
    lastComputeStatus.value = 'failed'
    lastComputeError.value = e?.response?.data?.detail || '计算失败'
    computing.value = false
    ElMessage.error(lastComputeError.value || '计算失败')
  }
}

async function doRecalc() {
  if (!computePeriod.value || !detailMetricId.value) {
    if (!computePeriod.value) ElMessage.warning('请输入计算期号')
    return
  }
  try {
    await ElMessageBox.confirm('重算将覆盖同周期已有结果，确定？', '确认重算', { type: 'warning' })
    computing.value = true
    lastComputeStatus.value = 'pending'
    lastComputeError.value = null
    try {
      const res = await recalcMetric(detailMetricId.value, computePeriod.value)
      if (res.run_id) {
        lastComputeStatus.value = 'running'
        await loadRuns()
        pollRunStatus(res.run_id, computePeriod.value)
      } else if (res.status === 'success') {
        lastComputeStatus.value = 'success'
        computing.value = false
        ElMessage.success('重算完成')
        loadResults(); loadRuns()
      } else {
        lastComputeStatus.value = 'failed'
        lastComputeError.value = res.error_message || '重算失败'
        computing.value = false
        ElMessage.error(res.error_message || '重算失败')
      }
    } catch (e: any) {
      lastComputeStatus.value = 'failed'
      lastComputeError.value = e?.response?.data?.detail || '重算失败'
      computing.value = false
      ElMessage.error(lastComputeError.value || '计算失败')
    }
    finally { computing.value = false }
  } catch { /* 取消 */ }
}

function metricResultDisplay(result: any): string {
  const summary = result?.value?.summary_value ?? result?.value?.value
  if (summary !== null && summary !== undefined) return String(summary)
  const rowCount = result?.value?.row_count ?? result?.rows?.length
  return rowCount !== undefined ? `${rowCount} 行结果` : '-'
}

function metricResultNumber(result: any): number {
  const summary = result?.value?.summary_value ?? result?.value?.value
  return typeof summary === 'number' ? summary : 0
}

// MR0303 辅助：从血缘图中获取节点标签
function getNodeLabel(nodeId: string): string {
  if (!lineageGraph.value) return nodeId
  const node = lineageGraph.value.nodes.find(n => n.id === nodeId)
  return node?.label ?? nodeId
}

// MR0304 辅助：下游引用类型中文
function downstreamTypeLabel(type: string): string {
  const map: Record<string, string> = {
    dataset: '数据集', report: '报表', metric: '指标', result: '结果集',
    dws: 'DWS聚合', datasource: '数据源', ucp_resource: 'UCP资源', table: '数据表',
    unknown: '其他',
  }
  return map[type] ?? type
}

const trendData = computed(() => {
  return [...results.value].reverse().map(r => ({
    period: r.period,
    value: metricResultNumber(r),
    label: metricResultDisplay(r),
  }))
})

// 新建/编辑 — 使用 FormulaFieldEditor 作为统一编辑器
const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editId = ref<number | null>(null)
const form = ref({
  metric_code: '', metric_name: '', metric_type: 'derived' as MetricCreatePayload['metric_type'],
  subject_area: '', business_definition: '', calculation_desc: '', formula_expr: '',
  formula_sql: '',
  stat_period: '', related_dataset_id: undefined as number | undefined, owner_name: '',
})
const saving = ref(false)
const datasetOptions = ref<{ id: number; name: string; label: string; layer: string }[]>([])
const loadingDatasets = ref(false)

// 公式编辑器字段
const formulaEditorFields = ref<ColumnInfo[]>([])
const formulaEditorKey = ref(0)
const editorTitle = computed(() => dialogMode.value === 'create' ? '新建指标' : '编辑指标')

// ========== MR0210-MR0212: 组件模式状态 ==========

/** 组件模式：'formula' = 公式模式, 'component' = 组件模式 */
const editMode = ref<'formula' | 'component'>('formula')

/** 比率公式检测结果（自动弹出提示的前提条件） */
const ratioFormulaDetected = ref(false)
const decomposeResult = ref<FormulaDecomposeResult | null>(null)
const decomposing = ref(false)

/** 组件配置数据 */
const componentRows = ref<Array<{
  role: ComponentRole
  component_code: string
  component_name: string
  expression: string
  aggregate_id: number | null
  new_aggregate_index: number | null  // 指向 newAggregates 数组的索引
  is_auto_created: boolean
  display_order: number
}>>([])

/** 自动创建的聚合定义数据 */
const newAggregates = ref<Array<{
  source_dataset_id: number
  name: string
  label: string
  group_by: string[]
  aggregation: string
  measure_field?: string
  filter?: Record<string, any> | null
  time_grain?: string | null
  business_definition?: string | null
  is_auto_created: boolean
}>>([])

/** 组合规则 */
const combinationRule = ref<string>('numerator / denominator')

/** 维度推断结果 */
const inferredDimensions = ref<string[]>([])

/** 已发布聚合定义列表（用于引用已有聚合） */
const publishedAggregates = ref<DwsAggregate[]>([])
const loadingAggregates = ref(false)

/** 已有组件列表（编辑模式下加载） */
const existingComponents = ref<MetricComponentItem[]>([])

// 比率公式检测（MR0210）
function isRatioFormula(formula: string): boolean {
  if (!formula) return false
  const f = formula.toUpperCase()
  // 检测 / 运算符 + 聚合函数 → 比率
  return f.includes('/') && (f.includes('COUNT(') || f.includes('COUNTIF(') || f.includes('SUM(') || f.includes('AVG(') || f.includes('COUNT_DISTINCT('))
}

// 公式变化时检测比率公式 + 推导类型
watch(() => form.value.formula_expr, (val) => {
  if (val) {
    const derived = deriveMetricType(val)
    const isRatio = isRatioFormula(val)
    const isFormulaMode = editMode.value === 'formula'
    form.value.metric_type = derived as any
    ratioFormulaDetected.value = isRatio && isFormulaMode
  } else {
    ratioFormulaDetected.value = false
    decomposeResult.value = null
  }
})

// 切换到组件模式时清除比率提示
watch(editMode, (mode) => {
  if (mode === 'component') {
    ratioFormulaDetected.value = false
  } else {
    // 回退到公式模式时清除组件数据
    componentRows.value = []
    newAggregates.value = []
    decomposeResult.value = null
  }
})

// 一键拆解公式 → 组件配置
async function switchToComponentMode() {
  const dsId = form.value.related_dataset_id
  const formula = form.value.formula_expr
  if (!formula || !dsId) {
    ElMessage.warning('请先填写公式并选择数据集')
    return
  }
  decomposing.value = true
  try {
    const result = await decomposeFormula(formula, dsId, form.value.metric_code || undefined)
    decomposeResult.value = result
    if (!result.is_ratio || result.components.length === 0) {
      ElMessage.info('该公式未检测到比率结构，继续使用公式模式')
      return
    }
    // 填入组件配置
    editMode.value = 'component'
    combinationRule.value = result.combination_rule || 'numerator / denominator'
    inferredDimensions.value = result.dimensions || []

    // 生成自动聚合定义 + 组件行
    newAggregates.value = result.components.map((c, i) => ({
      source_dataset_id: dsId,
      name: `dws_${form.value.metric_code || 'new_metric'}_${c.role}`,
      label: `${form.value.metric_name || '新指标'}·${COMPONENT_ROLE_LABELS[c.role]}`,
      group_by: result.dimensions || [],
      aggregation: c.suggested_aggregation,
      measure_field: c.expression,
      is_auto_created: true,
    }))

    componentRows.value = result.components.map((c, i) => ({
      role: c.role,
      component_code: c.suggested_code || `${form.value.metric_code || 'new_metric'}_${c.role}`,
      component_name: c.suggested_name || `${form.value.metric_name || '新指标'}·${COMPONENT_ROLE_LABELS[c.role]}`,
      expression: c.expression,
      aggregate_id: null,      // 新建的，暂无 ID
      new_aggregate_index: i,  // 指向 newAggregates[i]
      is_auto_created: true,
      display_order: i,
    }))

    // 加载已发布聚合定义供引用
    await loadPublishedAggregates()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '公式拆解失败')
  } finally {
    decomposing.value = false
  }
}

// 加载已发布聚合定义列表
async function loadPublishedAggregates() {
  loadingAggregates.value = true
  try {
    const res = await listDwsAggregates({ status: 'published', page_size: 200 })
    publishedAggregates.value = res.items || []
  } catch { publishedAggregates.value = [] }
  finally { loadingAggregates.value = false }
}

// 判断已有聚合的维度是否与当前推断维度匹配
function isDimensionMatch(agg: DwsAggregate): boolean {
  if (!inferredDimensions.value.length) return true
  const aggDims = (agg.group_by || []).map(d => d.toLowerCase().replace(/\s/g, ''))
  const inferred = inferredDimensions.value.map(d => d.toLowerCase().replace(/\s/g, ''))
  return inferred.every(d => aggDims.includes(d))
}

// 组件行引用已有聚合 → 设置 aggregate_id, 清除 new_aggregate_index
function setExistingAggregate(rowIdx: number, aggId: number | null) {
  const row = componentRows.value[rowIdx]
  if (aggId) {
    row.aggregate_id = aggId
    row.new_aggregate_index = null
    row.is_auto_created = false
    // 从聚合定义中获取名称
    const agg = publishedAggregates.value.find(a => a.id === aggId)
    if (agg) {
      row.component_name = `${form.value.metric_name || '新指标'}·${COMPONENT_ROLE_LABELS[row.role]}`
    }
  } else {
    // 取消引用 → 回到自动创建模式
    row.aggregate_id = null
    row.new_aggregate_index = rowIdx
    row.is_auto_created = true
  }
}

async function loadFormulaEditorFields() {
  const dsId = form.value.related_dataset_id
  if (!dsId) { formulaEditorFields.value = []; return }
  try {
    const ds = await datasetsApi.get(dsId)
    const allCols: ColumnInfo[] = []
    for (const table of ds.tables) {
      try {
        const cols = await dataApi.columns(table.table_name)
        for (const col of cols) {
          allCols.push({ ...col, code: `${table.alias}.${col.code}` })
        }
      } catch { /* skip */ }
    }
    formulaEditorFields.value = allCols
  } catch { formulaEditorFields.value = [] }
}

async function loadDatasetOptions() {
  if (datasetOptions.value.length > 0) return
  loadingDatasets.value = true
  try {
    const res = await listModels({ page_size: 200, warehouse_layer: 'DWD' })
    datasetOptions.value = (res.items || []).map((m: any) => ({
      id: m.id, name: m.name, label: m.label || m.name, layer: m.warehouse_layer || '',
    }))
  } catch { datasetOptions.value = [] }
  finally { loadingDatasets.value = false }
}

function openCreate() {
  dialogMode.value = 'create'; editId.value = null
  form.value = { metric_code: '', metric_name: '', metric_type: 'derived', subject_area: '', business_definition: '', calculation_desc: '', formula_expr: '', formula_sql: '', stat_period: '', related_dataset_id: undefined, owner_name: '' }
  formulaEditorFields.value = []
  editMode.value = 'formula'
  ratioFormulaDetected.value = false
  decomposeResult.value = null
  componentRows.value = []
  newAggregates.value = []
  formulaEditorKey.value++
  dialogVisible.value = true
}

async function openEdit(id: number) {
  dialogMode.value = 'edit'; editId.value = id
  try {
    const m = await getMetric(id)
    form.value = {
      metric_code: m.metric_code, metric_name: m.metric_name, metric_type: m.metric_type as any,
      subject_area: m.subject_area || '', business_definition: m.business_definition || '',
      calculation_desc: m.calculation_desc || '', formula_expr: m.formula_expr || '',
      formula_sql: (m as any).formula_sql || '',
      stat_period: m.stat_period || '', related_dataset_id: m.related_dataset_id || undefined,
      owner_name: m.owner_name || '',
    }
    if (m.related_dataset_id) { await loadFormulaEditorFields() }

    // 加载已有组件
    try {
      const comps = await listMetricComponents(id)
      existingComponents.value = comps
      if (comps.length > 0) {
        editMode.value = 'component'
        componentRows.value = comps.map(c => ({
          role: c.role as ComponentRole,
          component_code: c.component_code,
          component_name: c.component_name,
          expression: c.expression || '',
          aggregate_id: c.aggregate_id,
          new_aggregate_index: null,
          is_auto_created: c.is_auto_created,
          display_order: c.display_order,
        }))
        inferredDimensions.value = comps[0].aggregate_group_by || []
        await loadPublishedAggregates()
      } else {
        editMode.value = 'formula'
        ratioFormulaDetected.value = isRatioFormula(form.value.formula_expr || '')
      }
    } catch { /* 组件加载失败不影响编辑 */ }

    formulaEditorKey.value++
    dialogVisible.value = true
  } catch { ElMessage.error('加载指标详情失败') }
}

// 保存指标 + 组件
async function save() {
  saving.value = true
  try {
    const { formula_sql, ...payload } = form.value

    // 组件模式需要先保存/更新指标获取 ID，再批量保存组件
    let savedMetricId: number

    if (dialogMode.value === 'create') {
      const created = await createMetric(payload as MetricCreatePayload)
      savedMetricId = created.id
      ElMessage.success('指标已创建')
    } else {
      const { metric_code, ...updatePayload } = payload
      await updateMetric(editId.value!, updatePayload as MetricUpdatePayload)
      savedMetricId = editId.value!
      ElMessage.success('指标已更新')
    }

    // 如果是组件模式 → 批量保存组件（MR0213）
    if (editMode.value === 'component' && componentRows.value.length > 0) {
      try {
        const batchPayload: MetricComponentBatchPayload = {
          new_aggregates: newAggregates.value.map(a => ({
            ...a,
            // 用实际 metric_code 替换占位符
            name: a.name.replace('new_metric', form.value.metric_code || 'metric'),
            label: a.label.replace('新指标', form.value.metric_name || '指标'),
          })),
          components: componentRows.value.map(c => ({
            component_code: c.component_code.replace('new_metric', form.value.metric_code || 'metric'),
            component_name: c.component_name.replace('新指标', form.value.metric_name || '指标'),
            aggregate_id: c.aggregate_id,
            new_aggregate_index: c.new_aggregate_index,
            role: c.role,
            expression: c.expression || null,
            display_order: c.display_order,
            is_auto_created: c.is_auto_created,
          })),
        }
        await batchSaveMetricComponents(savedMetricId, batchPayload)
        ElMessage.success('组件配置已保存')
      } catch (e: any) {
        ElMessage.warning(`组件保存失败: ${e?.response?.data?.detail || e.message || '未知错误'}`)
      }
    }

    dialogVisible.value = false; load()
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '保存失败') }
  finally { saving.value = false }
}

function onDatasetChange(dsId: number | undefined) {
  form.value.related_dataset_id = dsId
  if (dsId) { loadFormulaEditorFields(); formulaEditorKey.value++ }
  else { formulaEditorFields.value = [] }
}

// 从公式自动推导指标类型
function deriveMetricType(formula: string): string {
  const f = (formula || '').toUpperCase()
  if (f.includes('SUM(')) return 'sum'
  if (f.includes('COUNT(') || f.includes('COUNTIF(') || f.includes('COUNT_DISTINCT(')) return 'count'
  if (f.includes('/') && (f.includes('SUM(') || f.includes('COUNT(') || f.includes('COUNTIF(') || f.includes('AVG('))) return 'ratio'
  if (!f.match(/SUM|COUNT|AVG|MAX|MIN|ROUND|IF/)) return 'text'
  return 'derived'
}

// 公式/数据集变化时实时调用 AST 编译器，预览编译结果（AST0017）
let translateTimer: ReturnType<typeof setTimeout> | null = null
const translating = ref(false)
const compileResult = ref<FormulaCompileResult | null>(null)
const compiling = ref(false)
const showSql = ref(false)
// 公式是否应该禁用保存按钮：编译中、编译未就绪、或已有结果但无效时禁用
const formulaHasError = computed(() => {
  if (!form.value.formula_expr) return false
  if (compiling.value) return true
  if (!compileResult.value) return true
  return !compileResult.value.valid
})
watch([() => form.value.formula_expr, () => form.value.related_dataset_id], ([expr, dsId]) => {
  if (translateTimer) clearTimeout(translateTimer)
  if (!expr || !dsId) {
    form.value.formula_sql = ''
    compileResult.value = null
    return
  }
  translateTimer = setTimeout(async () => {
    translating.value = true
    compiling.value = true
    try {
      const res = await compileFormula({ dataset_id: dsId, formula_expr: expr, mode: 'metric', include_ast: false, preview: true })
      compileResult.value = res
      // 仅当有效时回填用于保存的 SQL；无效时保留错误提示由面板展示
      if (res.valid) {
        form.value.formula_sql = res.sql
      } else {
        form.value.formula_sql = (res.errors || []).map(e => e.message).join('；')
      }
    } catch {
      compileResult.value = null
      form.value.formula_sql = ''
    } finally {
      translating.value = false
      compiling.value = false
    }
  }, 500)
})

async function doPublish(id: number) {
  try {
    await ElMessageBox.confirm('确定发布该指标？', '确认', { type: 'info' })
    await publishMetric(id); ElMessage.success('已发布'); load()
  } catch { /* 取消 */ }
}

async function doArchive(id: number) {
  try {
    await ElMessageBox.confirm('归档后指标将不可用，确定？', '确认归档', { type: 'warning' })
    await archiveMetric(id); ElMessage.success('已归档'); load()
  } catch { /* 取消 */ }
}

watch([page, pageSize], () => load())
onMounted(load)
</script>

<template>
  <div style="padding: 24px">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px">
      <h2 style="margin: 0; font-size: 20px">指标管理</h2>
      <el-button v-if="userStore.hasOp('warehouse.metrics','C')" type="primary" :icon="Plus" @click="openCreate">新建指标</el-button>
    </div>

    <el-card shadow="never" style="margin-bottom: 16px">
      <el-form :inline="true" size="small">
        <el-form-item label="搜索"><el-input v-model="keyword" placeholder="编码/名称" clearable style="width: 180px" @keyup.enter="(page=1,load())" /></el-form-item>
        <el-form-item label="状态">
          <el-select v-model="statusFilter" clearable placeholder="全部" style="width: 110px" @change="(page=1,load())">
            <el-option label="草稿" value="draft" /><el-option label="已发布" value="published" /><el-option label="已归档" value="archived" />
          </el-select>
        </el-form-item>
        <el-form-item><el-button type="primary" :icon="Search" @click="(page=1,load())">查询</el-button><el-button :icon="Refresh" @click="(keyword='',statusFilter='',page=1,load())">重置</el-button></el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table v-loading="loading" :data="metrics" border stripe size="small" empty-text="暂无指标" highlight-current-row @row-click="(row: any) => openDetail(row.id)" style="cursor: pointer">
        <el-table-column prop="metric_code" label="编码" width="120" />
        <el-table-column prop="metric_name" label="名称" min-width="120" />
        <el-table-column prop="metric_type" label="类型" width="70">
          <template #default="{ row }">{{ TYPE_LABELS[row.metric_type] || row.metric_type }}</template>
        </el-table-column>
        <el-table-column prop="business_definition" label="定义" min-width="140" show-overflow-tooltip />
        <el-table-column prop="subject_area" label="主题域" width="80" />
        <el-table-column prop="related_dataset_id" label="依赖数据集" width="90" />
        <el-table-column prop="owner_name" label="负责人" width="80" />
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }"><el-tag size="small" :type="STATUS_TAG[row.status]||'info'">{{ STATUS_LABELS[row.status]||row.status }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="version" label="版本" width="60" align="center" />
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button text size="small" :icon="TrendCharts" type="primary" @click="openDetail(row.id)">趋势</el-button>
            <el-button v-if="userStore.hasOp('warehouse.metrics','U')" text size="small" :icon="Edit" @click="openEdit(row.id)">编辑</el-button>
            <el-button v-if="row.status==='draft'&&userStore.hasOp('warehouse.metrics','U')" text size="small" type="success" :icon="Finished" @click.stop="doPublish(row.id)">发布</el-button>
            <el-button v-if="row.status==='published'&&userStore.hasOp('warehouse.metrics','U')" text size="small" type="warning" :icon="FolderDelete" @click.stop="doArchive(row.id)">归档</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div style="display: flex; justify-content: flex-end; margin-top: 12px">
        <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[20,50,100]" layout="total,sizes,prev,pager,next" />
      </div>
    </el-card>

    <!-- 指标详情抽屉 -->
    <el-drawer v-model="detailVisible" title="指标计算结果" size="650px" :close-on-click-modal="false">
      <template v-if="detailMetric">
        <el-descriptions :column="2" size="small" border style="margin-bottom: 16px">
          <el-descriptions-item label="编码">{{ detailMetric.metric_code }}</el-descriptions-item>
          <el-descriptions-item label="名称">{{ detailMetric.metric_name }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ TYPE_LABELS[detailMetric.metric_type] || detailMetric.metric_type }}</el-descriptions-item>
          <el-descriptions-item label="状态"><el-tag size="small" :type="STATUS_TAG[detailMetric.status]||'info'">{{ STATUS_LABELS[detailMetric.status]||detailMetric.status }}</el-tag></el-descriptions-item>
          <el-descriptions-item v-if="detailMetric.formula_expr" label="公式" :span="2">{{ detailMetric.formula_expr }}</el-descriptions-item>
        </el-descriptions>

        <!-- ========== MR0301: 指标解释卡片 ========== -->
        <el-card v-if="explainContext && explainContext.components.length > 0" shadow="never" size="small" style="margin-bottom: 16px">
          <template #header>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-weight:600">指标解释</span>
              <span v-if="explainContext.metric_version" style="font-size:11px;color:#909399">口径版本 v{{ explainContext.metric_version }}</span>
            </div>
          </template>

          <!-- 组合规则 -->
          <div v-if="explainContext.combination_rule" style="margin-bottom:12px;padding:8px 12px;background:#f0f9eb;border-radius:4px;font-size:13px">
            <span style="font-weight:600;color:#67C23A">{{ explainContext.combination_rule }}</span>
            <span style="color:#909399;margin-left:4px">= {{ explainContext.metric_name }}</span>
          </div>

          <!-- 组件明细 -->
          <el-table :data="explainContext.components" size="small" border style="margin-bottom:8px">
            <el-table-column prop="role" label="角色" width="70">
              <template #default="{ row }">
                <el-tag size="small" :type="row.role === 'numerator' ? 'danger' : row.role === 'denominator' ? 'warning' : 'info'">
                  {{ COMPONENT_ROLE_LABELS[row.role as ComponentRole] || row.role }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="component_name" label="组件名称" min-width="100" />
            <el-table-column prop="aggregate_label" label="聚合定义" min-width="100">
              <template #default="{ row }">
                <span>{{ row.aggregate_label || row.aggregate_name || '-' }}</span>
                <el-tag v-if="row.is_auto_created" size="small" type="info" style="margin-left:4px">自动</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="expression" label="表达式" min-width="80" show-overflow-tooltip />
          </el-table>

          <!-- 业务定义 + 口径说明 -->
          <div v-if="explainContext.business_definition || explainContext.calculation_desc" style="margin-top:8px">
            <p v-if="explainContext.business_definition" style="font-size:12px;color:#606266;margin:4px 0">
              <span style="font-weight:600">业务定义：</span>{{ explainContext.business_definition }}
            </p>
            <p v-if="explainContext.calculation_desc" style="font-size:12px;color:#606266;margin:4px 0">
              <span style="font-weight:600">口径说明：</span>{{ explainContext.calculation_desc }}
            </p>
          </div>

          <!-- MR0302: 计算时间 -->
          <div v-if="explainContext.computed_at" style="margin-top:8px;font-size:11px;color:#909399">
            计算时间：{{ formatDateTime(explainContext.computed_at) }}
          </div>
        </el-card>

        <!-- 非复合指标提示（无组件） -->
        <el-card v-if="explainContext && explainContext.components.length === 0 && explainContext.formula_expr" shadow="never" size="small" style="margin-bottom: 16px">
          <template #header><span style="font-weight:600">指标口径</span></template>
          <div style="font-size:13px;color:#606266;line-height:1.6">
            <p><span style="font-weight:600">公式：</span>{{ explainContext.formula_expr }}</p>
            <p v-if="explainContext.business_definition"><span style="font-weight:600">业务定义：</span>{{ explainContext.business_definition }}</p>
            <p v-if="explainContext.calculation_desc"><span style="font-weight:600">口径说明：</span>{{ explainContext.calculation_desc }}</p>
            <p v-if="explainContext.metric_version" style="font-size:11px;color:#909399;margin-top:6px">
              口径版本 v{{ explainContext.metric_version }}
              <span v-if="explainContext.computed_at"> · 计算时间 {{ formatDateTime(explainContext.computed_at) }}</span>
            </p>
          </div>
        </el-card>

        <!-- ========== MR0303: 指标血缘图 ========== -->
        <el-card v-if="lineageGraph" shadow="never" size="small" style="margin-bottom: 16px">
          <template #header><span style="font-weight: 600">数据血缘 (DWD → DWS → Result)</span></template>
          <div style="max-height: 240px; overflow-y: auto">
            <div v-for="edge in lineageGraph.edges" :key="edge.source_id + edge.target_id"
              style="margin-bottom: 6px; display: flex; align-items: center; gap: 6px; font-size: 13px">
              <el-tag size="small" :type="edge.direction === 'upstream' ? 'info' : 'success'">
                {{ edge.direction === 'upstream' ? '↑ 上游' : '↓ 下游' }}
              </el-tag>
              <span style="color: #606266">{{ getNodeLabel(edge.source_id) }}</span>
              <span style="color: #909399">→</span>
              <span style="color: #303133">{{ getNodeLabel(edge.target_id) }}</span>
              <el-tag v-if="edge.label" size="small" type="warning">{{ edge.label }}</el-tag>
            </div>
            <el-alert v-if="lineageGraph.truncated" type="warning" :closable="false" style="margin-top: 8px">
              {{ lineageGraph.truncation_message }}
            </el-alert>
          </div>
        </el-card>
        <div v-else-if="lineageLoading" style="text-align: center; margin-bottom: 16px">
          <el-icon class="is-loading"><Loading /></el-icon> 加载血缘图...
        </div>

        <!-- ========== MR0304: 下游引用列表 ========== -->
        <el-card v-if="downstreamRefs" shadow="never" size="small" style="margin-bottom: 16px">
          <template #header><span style="font-weight: 600">下游引用</span></template>
          <el-table :data="downstreamRefs.refs" size="small" stripe style="width: 100%"
            :max-height="200" empty-text="暂无下游引用">
            <el-table-column prop="type" label="类型" width="80">
              <template #default="{ row }">
                <el-tag size="small">{{ downstreamTypeLabel(row.type) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="name" label="名称" min-width="120" show-overflow-tooltip />
            <el-table-column prop="usage" label="引用方式" min-width="100" show-overflow-tooltip />
            <el-table-column prop="risk_level" label="风险" width="60" align="center">
              <template #default="{ row }">
                <el-tag v-if="row.risk_level === 'high'" type="danger" size="small">高</el-tag>
                <el-tag v-else-if="row.risk_level === 'medium'" type="warning" size="small">中</el-tag>
                <el-tag v-else type="info" size="small">低</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
        <div v-else-if="downstreamRefsLoading" style="text-align: center; margin-bottom: 16px">
          <el-icon class="is-loading"><Loading /></el-icon> 加载下游引用...
        </div>

        <!-- 计算操作区 -->
        <el-card shadow="never" size="small" style="margin-bottom: 16px">
          <template #header><span style="font-weight: 600">触发计算</span></template>
          <el-form :inline="true" size="small">
            <el-form-item label="计算期号">
              <el-input v-model="computePeriod" placeholder="2026-07 / 2026Q3 / 2026H1" style="width: 200px" clearable
                :disabled="computing" />
            </el-form-item>
            <el-form-item>
              <el-button v-if="userStore.hasOp('warehouse.metrics','U')" type="primary"
                :icon="computing ? Loading : VideoPlay" :loading="computing"
                @click="doCompute">
                {{ computing ? (lastComputeStatus === 'running' ? '执行中...' : '已提交') : '计算' }}
              </el-button>
              <el-button v-if="userStore.hasOp('warehouse.metrics','U')" :icon="Refresh"
                :loading="computing" :disabled="computing" @click="doRecalc">重算</el-button>
            </el-form-item>
          </el-form>
          <div v-if="lastComputeStatus" style="margin-top:6px">
            <el-alert v-if="lastComputeStatus === 'running'" type="info" :closable="false"
              title="计算执行中，运行记录区将自动更新..." show-icon />
            <el-alert v-else-if="lastComputeStatus === 'success' && computedResult" type="success" :closable="false"
              :title="`上次计算完成 · 结果: ${computedResult.period}`" show-icon>
              <template #default>
                <span style="font-size:13px">计算结果: {{ metricResultDisplay(computedResult) }}</span>
              </template>
            </el-alert>
            <el-alert v-else-if="lastComputeStatus === 'failed'" type="error" :closable="false"
              :title="lastComputeError || '计算失败'" show-icon>
              <template #default>
                <el-button size="small" text @click="doCompute" :disabled="computing">重试</el-button>
              </template>
            </el-alert>
          </div>
        </el-card>

        <!-- 趋势图 -->
        <el-card shadow="never" size="small" style="margin-bottom: 16px">
          <template #header><span style="font-weight: 600">计算趋势</span></template>
          <div v-if="trendData.length === 0" style="text-align:center;color:#909399;padding:24px 0">
            <el-empty description="暂无计算结果" :image-size="80" />
          </div>
          <div v-else style="display:flex;align-items:flex-end;gap:4px;height:120px;padding:8px 0">
            <div v-for="(d, i) in trendData" :key="i" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">
              <span style="font-size:11px;margin-bottom:4px;color:#303133;font-weight:600">{{ d.label }}</span>
              <div :style="{height: Math.max(4, (d.value / Math.max(...trendData.map(x=>x.value),1)) * 100)+'%', width:'100%', maxWidth:'40px', background:'#409eff', borderRadius:'4px 4px 0 0', minHeight:'4px'}"></div>
              <span style="font-size:10px;color:#909399;margin-top:4px;writing-mode:horizontal-tb">{{ d.period }}</span>
            </div>
          </div>
        </el-card>

        <!-- 计算结果列表 -->
        <el-card shadow="never" size="small" style="margin-bottom: 16px">
          <template #header><span style="font-weight: 600">计算结果</span></template>
          <el-table v-loading="resultsLoading" :data="results" size="small" border empty-text="暂无结果" max-height="200" highlight-current-row @row-click="onResultRowClick">
            <el-table-column prop="period" label="周期" width="120" />
            <el-table-column label="计算结果" min-width="120">
              <template #default="{ row }">{{ metricResultDisplay(row) }}</template>
            </el-table-column>
            <el-table-column label="明细行数" width="90" align="center">
              <template #default="{ row }">{{ row.value?.row_count ?? row.rows?.length ?? 0 }}</template>
            </el-table-column>
            <el-table-column prop="computed_at" label="计算时间" width="160">
              <template #default="{ row }">{{ formatDateTime(row.computed_at) }}</template>
            </el-table-column>
          </el-table>
        </el-card>

        <!-- 结果明细（MR0103/0104 动态列 + MR0105 空态 + MR0106 失败态 + MR0101 分页 + MR0102 导出） -->
        <el-card shadow="never" size="small" style="margin-bottom: 16px">
          <template #header>
            <span style="font-weight: 600">结果明细</span>
            <el-button v-if="resultDetail?.permission_level === 'full'" size="small" type="primary" :loading="exporting" @click="handleExportDetail" style="float: right">导出 CSV</el-button>
          </template>
          <div v-if="resultDetailLoading" v-loading="true" style="height: 140px" />
          <template v-else-if="resultDetail && resultDetail.permission_level === 'full'">
            <el-table :data="resultDetail.rows || []" size="small" border max-height="340" empty-text="计算成功，但无明细数据">
              <el-table-column v-for="c in detailDimCols" :key="'d-' + c" :prop="c" :label="c">
                <template #default="{ row }">{{ row.dimension_values?.[c] ?? '' }}</template>
              </el-table-column>
              <el-table-column v-for="c in detailMeasCols" :key="'m-' + c" :prop="c" :label="c">
                <template #default="{ row }">{{ row.measure_values?.[c] ?? '' }}</template>
              </el-table-column>
              <el-table-column prop="value" label="值" width="120" />
            </el-table>
            <div v-if="(resultDetail.total || 0) > detailPageSize" style="margin-top: 8px; text-align: right; color: #909399; font-size: 12px">
              共 {{ resultDetail.total || 0 }} 行 · 第 {{ resultDetail.page || 1 }}/{{ Math.ceil((resultDetail.total || 0) / (resultDetail.page_size || 1)) }} 页
              <el-button text size="small" :disabled="(resultDetail.page || 1) <= 1" @click="changeDetailPage((resultDetail.page || 1) - 1)">上一页</el-button>
              <el-button text size="small" :disabled="(resultDetail.page || 1) >= Math.ceil((resultDetail.total || 0) / (resultDetail.page_size || 1))" @click="changeDetailPage((resultDetail.page || 1) + 1)">下一页</el-button>
            </div>
          </template>
          <el-empty v-else-if="resultDetail && resultDetail.permission_level === 'summary_only'" description="您没有数据明细权限，仅可查看汇总值" :image-size="80" />
          <el-empty v-else-if="lastComputeStatus === 'failed'" :description="lastComputeError || '计算失败，无法加载明细'" :image-size="80" />
          <el-empty v-else description="点击上方某一期计算结果，查看其明细" :image-size="80" />
        </el-card>

        <!-- 运行记录 -->
        <el-card shadow="never" size="small" style="margin-bottom: 16px">
          <template #header><span style="font-weight: 600">运行记录</span></template>
          <el-table v-loading="runsLoading" :data="runs" size="small" border empty-text="暂无记录" max-height="200">
            <el-table-column prop="status" label="状态" width="80">
              <template #default="{ row }">
                <el-tag size="small" :type="row.status==='success'?'success':row.status==='failed'?'danger':row.status==='running'?'warning':'info'">
                  {{ METRIC_RUN_STATUS_LABELS[row.status] || row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="period" label="周期" width="100" />
            <el-table-column prop="error_message" label="错误信息" min-width="160" show-overflow-tooltip />
            <el-table-column prop="started_at" label="开始时间" width="160">
              <template #default="{ row }">{{ formatDateTime(row.started_at) }}</template>
            </el-table-column>
            <el-table-column prop="finished_at" label="结束时间" width="160">
              <template #default="{ row }">{{ formatDateTime(row.finished_at) }}</template>
            </el-table-column>
          </el-table>
        </el-card>

        <!-- 自动化数仓开发面板 -->
        <MetricAutomationPanel
          v-if="detailMetric"
          :metric-id="detailMetric.id"
          :metric-code="detailMetric.metric_code"
          :metric-name="detailMetric.metric_name"
        />
      </template>
    </el-drawer>

    <!-- 新建/编辑：统一使用 FormulaFieldEditor -->
    <FormulaFieldEditor
      v-if="dialogVisible"
      :key="formulaEditorKey"
      :visible="dialogVisible"
      @update:visible="dialogVisible = $event"
      :title="editorTitle"
      subtitle="从左侧选择字段和函数编写公式，右侧配置指标基础信息"
      :dataset-id="form.related_dataset_id || null"
      :fields="formulaEditorFields"
      :initial-formula="form.formula_expr"
      :source-groups="[]"
      :hide-default-config="true"
      :hide-default-actions="true"
      @formula-change="(v: string) => form.formula_expr = v"
    >
      <template #config>
        <section class="config-card">
          <div class="section-head compact-head">
            <span class="section-marker"></span>
            <span>指标配置</span>
          </div>
          <el-form label-position="top" class="config-form" size="small">

            <!-- ========== AST0017: 公式编译预览面板 ========== -->
            <el-form-item v-if="form.related_dataset_id && form.formula_expr" label="公式编译预览">
              <el-card shadow="never" size="small" style="width:100%;background:#fafafa">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
                  <el-tag v-if="compiling" type="info" size="small" effect="plain">
                    <el-icon style="margin-right:4px"><Loading /></el-icon>编译中…
                  </el-tag>
                  <el-tag v-else-if="compileResult && compileResult.valid" type="success" size="small">
                    公式有效
                  </el-tag>
                  <el-tag v-else-if="compileResult && !compileResult.valid" type="danger" size="small">
                    公式无效（{{ (compileResult.errors || []).length }} 处错误）
                  </el-tag>
                  <el-tag v-else type="info" size="small" effect="plain">等待输入</el-tag>
                  <span v-if="compileResult && compileResult.compiler" style="font-size:11px;color:#909399">
                    {{ compileResult.compiler.engine }} · v{{ compileResult.compiler.version }}
                  </span>
                </div>

                <!-- 识别字段 -->
                <div v-if="compileResult && (compileResult.dependencies || []).length" style="margin-bottom:8px">
                  <span style="font-size:12px;color:#606266;margin-right:6px">识别字段：</span>
                  <el-tag v-for="dep in compileResult.dependencies" :key="dep.field_code" size="small" type="primary" effect="plain" style="margin:2px">
                    {{ dep.field_label || dep.field_code }}
                  </el-tag>
                </div>

                <!-- 识别函数 -->
                <div v-if="compileResult && (compileResult.functions || []).length" style="margin-bottom:8px">
                  <span style="font-size:12px;color:#606266;margin-right:6px">识别函数：</span>
                  <el-tag v-for="fn in compileResult.functions" :key="fn" size="small" type="warning" effect="plain" style="margin:2px">
                    {{ fn }}
                  </el-tag>
                </div>

                <!-- 生成 SQL（可折叠） -->
                <div v-if="compileResult && compileResult.sql" style="margin-bottom:8px">
                  <div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer" @click="showSql = !showSql">
                    <span style="font-size:12px;color:#606266">生成 SQL：</span>
                    <el-button text size="small" type="primary">{{ showSql ? '收起' : '展开' }}</el-button>
                  </div>
                  <el-input v-if="showSql" :model-value="compileResult.sql" type="textarea" :rows="4" readonly
                            style="font-family:monospace;font-size:12px;margin-top:4px" />
                  <div v-else style="font-family:monospace;font-size:12px;color:#606266;background:#fff;padding:4px 6px;border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ compileResult.sql }}</div>
                </div>

                <!-- 样本预览值 -->
                <div v-if="compileResult && compileResult.preview_result" style="margin-bottom:8px">
                  <span style="font-size:12px;color:#606266">样本预览值：</span>
                  <code style="background:#fff;padding:2px 6px;border-radius:4px">{{ compileResult.preview_result.value }}</code>
                  <span style="font-size:11px;color:#909399;margin-left:6px">行数 {{ compileResult.preview_result.row_count }}</span>
                </div>

                <!-- 警告（不阻断保存） -->
                <el-alert v-for="(w, i) in (compileResult ? compileResult.warnings : [])" :key="'w' + i"
                          type="warning" :closable="false" show-icon style="margin-bottom:6px">
                  <template #title>{{ w.message }}</template>
                </el-alert>

                <!-- 错误（定位到公式片段，阻断保存） -->
                <el-alert v-for="(e, i) in (compileResult ? compileResult.errors : [])" :key="'e' + i"
                          type="error" :closable="false" show-icon style="margin-bottom:6px">
                  <template #title>
                    <span style="font-weight:600">[{{ e.code }}]</span> {{ e.message }}
                  </template>
                  <template #default v-if="e.fragment || e.suggestion">
                    <div style="font-size:12px;line-height:1.6">
                      <span v-if="e.fragment" style="font-family:monospace">片段：<code>{{ e.fragment }}</code></span>
                      <span v-if="e.suggestion" style="margin-left:8px;color:#909399">建议：{{ e.suggestion }}</span>
                    </div>
                  </template>
                </el-alert>
              </el-card>
            </el-form-item>

            <el-form-item label="指标编码" required>
              <el-input v-model="form.metric_code" :disabled="dialogMode === 'edit'" maxlength="64" />
            </el-form-item>
            <el-form-item label="指标名称" required>
              <el-input v-model="form.metric_name" maxlength="128" />
            </el-form-item>
            <el-form-item label="指标类型">
              <el-tag :type="metricTypeTagType" size="default">
                {{ metricTypeLabel }}
              </el-tag>
              <span style="font-size:11px;color:#909399;margin-left:6px">由公式自动推导</span>
            </el-form-item>
            <el-form-item label="主题域">
              <el-input v-model="form.subject_area" placeholder="如：薪酬" />
            </el-form-item>
            <el-form-item label="负责人">
              <el-input v-model="form.owner_name" />
            </el-form-item>
            <el-form-item label="依赖数据集">
              <el-select v-model="form.related_dataset_id" clearable filterable placeholder="选择数据集" style="width: 100%" :loading="loadingDatasets" @focus="loadDatasetOptions" @change="onDatasetChange">
                <el-option v-for="ds in datasetOptions" :key="ds.id" :label="`${ds.label} (${ds.layer})`" :value="ds.id">
                  <span>{{ ds.label }}</span>
                  <el-tag size="small" type="info" style="margin-left:8px">{{ ds.layer }}</el-tag>
                </el-option>
              </el-select>
              <span style="font-size:11px;color:#909399">DWS 生成时自动派生 year/quarter/month</span>
            </el-form-item>

            <!-- ========== MR0210: 比率公式检测提示 ========== -->
            <el-form-item v-if="ratioFormulaDetected && editMode === 'formula' && form.related_dataset_id" label="">
              <el-alert type="warning" :closable="false" show-icon style="width: 100%">
                <template #title>
                  <span style="font-weight:600">检测到比率公式</span>
                </template>
                <template #default>
                  <div style="font-size:12px;line-height:1.6">
                    <p style="margin:4px 0">当前公式包含除法运算，建议拆解为组件模式，以便：</p>
                    <ul style="margin:2px 0;padding-left:18px">
                      <li>保留分子/分母独立值（如离职5人/总120人=4.17%）</li>
                      <li>支持结果解释与溯源</li>
                      <li>分母为0时返回明确提示而非报错</li>
                    </ul>
                  </div>
                  <div style="margin-top:8px;display:flex;gap:8px">
                    <el-button size="small" @click="ratioFormulaDetected = false">保持公式模式</el-button>
                    <el-button size="small" type="primary" :loading="decomposing" @click="switchToComponentMode">
                      切换到组件模式
                    </el-button>
                  </div>
                </template>
              </el-alert>
            </el-form-item>

            <!-- ========== MR0210: 模式切换按钮（手动切换） ========== -->
            <el-form-item v-if="form.related_dataset_id && form.formula_expr" label="计算模式">
              <el-radio-group v-model="editMode" size="small">
                <el-radio-button value="formula">公式模式</el-radio-button>
                <el-radio-button value="component" :disabled="!isRatioFormula(form.formula_expr)">组件模式</el-radio-button>
              </el-radio-group>
              <span style="font-size:11px;color:#909399;margin-left:6px">
                {{ editMode === 'formula' ? '公式直接计算，结果为单值' : '拆解分子/分母，结果含多度量值' }}
              </span>
            </el-form-item>

            <!-- ========== MR0211-MR0212: 组件配置区 ========== -->
            <div v-if="editMode === 'component'" style="margin-top:12px;border:1px solid #e4e7ed;border-radius:6px;padding:12px;background:#fafafa">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <span style="font-weight:600;font-size:13px;color:#303133">组件配置</span>
                <el-button size="small" type="primary" :loading="decomposing" @click="switchToComponentMode">
                  重新拆解公式
                </el-button>
              </div>

              <!-- 组件角色表格 -->
              <el-table :data="componentRows" size="small" border style="width:100%;margin-bottom:12px">
                <el-table-column prop="role" label="角色" width="70">
                  <template #default="{ row }">
                    <el-tag size="small" :type="row.role === 'numerator' ? 'danger' : row.role === 'denominator' ? 'warning' : 'info'">
                      {{ COMPONENT_ROLE_LABELS[row.role as ComponentRole] || row.role }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="component_name" label="组件名称" min-width="100">
                  <template #default="{ row }">
                    <el-input v-model="row.component_name" size="small" />
                  </template>
                </el-table-column>
                <el-table-column prop="expression" label="表达式" min-width="120">
                  <template #default="{ row }">
                    <span style="font-size:11px;font-family:monospace;color:#606266">{{ row.expression }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="聚合定义" min-width="180">
                  <template #default="{ row, $index }">
                    <!-- 引用已有聚合 -->
                    <div v-if="row.aggregate_id" style="display:flex;align-items:center;gap:4px">
                      <el-tag size="small" type="success">{{ publishedAggregates.find(a => a.id === row.aggregate_id)?.name || `#${row.aggregate_id}` }}</el-tag>
                      <el-button size="small" text type="danger" @click="setExistingAggregate($index, null)">取消引用</el-button>
                    </div>
                    <!-- 自动创建 -->
                    <div v-else-if="row.new_aggregate_index !== null" style="display:flex;align-items:center;gap:4px">
                      <el-tag size="small" type="info">自动创建</el-tag>
                      <span style="font-size:11px;color:#909399">{{ newAggregates[row.new_aggregate_index]?.name }}</span>
                    </div>
                    <!-- 无聚合（异常态） -->
                    <span v-else style="font-size:11px;color:#F56C6C">未配置</span>
                  </template>
                </el-table-column>
                <el-table-column label="引用已有聚合" width="140">
                  <template #default="{ row, $index }">
                    <el-select
                      v-model="row.aggregate_id"
                      size="small"
                      clearable
                      filterable
                      placeholder="引用已有聚合"
                      :loading="loadingAggregates"
                      @change="(val: any) => setExistingAggregate($index, val || null)"
                      style="width:100%"
                    >
                      <el-option
                        v-for="agg in publishedAggregates"
                        :key="agg.id"
                        :label="agg.name"
                        :value="agg.id"
                      >
                        <span>{{ agg.name }}</span>
                        <el-tag size="small" :type="isDimensionMatch(agg) ? 'success' : 'danger'" style="margin-left:6px">
                          {{ isDimensionMatch(agg) ? '维度匹配' : '维度不匹配' }}
                        </el-tag>
                      </el-option>
                    </el-select>
                  </template>
                </el-table-column>
              </el-table>

              <!-- 组合规则 + 维度推断 -->
              <el-form label-position="left" label-width="80px" size="small">
                <el-form-item label="组合规则">
                  <el-input v-model="combinationRule" readonly style="font-family:monospace" />
                  <span style="font-size:11px;color:#909399">由公式拆解自动生成</span>
                </el-form-item>
                <el-form-item label="分组维度">
                  <div style="display:flex;gap:4px;flex-wrap:wrap">
                    <el-tag v-for="dim in inferredDimensions" :key="dim" size="small" type="success">{{ dim }}</el-tag>
                    <span v-if="!inferredDimensions.length" style="font-size:11px;color:#909399">从数据集自动推断</span>
                  </div>
                </el-form-item>
              </el-form>
            </div>

            <el-form-item label="业务定义">
              <el-input v-model="form.business_definition" type="textarea" :rows="2" />
            </el-form-item>
            <el-form-item label="口径说明">
              <el-input v-model="form.calculation_desc" type="textarea" :rows="2" placeholder="计算口径的文字说明" />
            </el-form-item>
            <el-form-item v-if="form.related_dataset_id && editMode === 'formula'" label="SQL 翻译">
              <el-input v-if="translating" model-value="翻译中..." type="textarea" :rows="3" readonly style="font-family: monospace; font-size: 12px" />
              <el-input v-else-if="form.formula_sql" :model-value="form.formula_sql" type="textarea" :rows="3" readonly style="font-family: monospace; font-size: 12px" />
              <span v-else style="font-size:11px;color:#909399">输入公式后自动翻译</span>
              <span style="font-size:11px;color:#909399">由 Excel 公式自动翻译，保存后生效</span>
            </el-form-item>
          </el-form>
        </section>
      </template>

      <template #actions>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" :disabled="formulaHasError" @click="save">
          {{ editMode === 'component' ? '保存指标 + 组件' : '保存指标' }}
        </el-button>
      </template>
    </FormulaFieldEditor>
  </div>
</template>
