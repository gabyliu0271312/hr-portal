<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useUserStore } from '@/stores/user'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Refresh, Edit, Finished, FolderDelete, TrendCharts, VideoPlay, DataAnalysis, Loading } from '@element-plus/icons-vue'
import {
  listMetrics, createMetric, updateMetric, getMetric, publishMetric, archiveMetric,
  computeMetric, recalcMetric, listMetricResults, listMetricRuns, listModels,
  METRIC_RUN_STATUS_LABELS,
  type MetricListItem, type MetricDetail, type MetricCreatePayload, type MetricUpdatePayload,
  type MetricResult, type MetricRun,
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
  detailMetricId.value = id
  detailVisible.value = true
  try {
    detailMetric.value = await getMetric(id)
  } catch { ElMessage.error('加载指标详情失败'); return }
  loadResults()
  loadRuns()
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
const lastComputeStatus = ref<string | null>(null)  // pending | running | success | failed
const lastComputeError = ref<string | null>(null)
const computedResult = ref<any>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

function clearPollTimer() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

// 轮询运行记录状态
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
        } else {
          lastComputeError.value = run.error_message || '计算失败'
          ElMessage.error(lastComputeError.value || '计算失败')
        }
        await loadRuns()
      }
    } catch { /* ignore poll errors */ }
  }, 2000)
  // 30秒超时
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
      // 有 run_id → 开始轮询
      lastComputeStatus.value = 'running'
      await loadRuns()
      pollRunStatus(res.run_id, computePeriod.value)
    } else if (res.status === 'success') {
      lastComputeStatus.value = 'success'
      computing.value = false
      ElMessage.success('计算完成')
      loadResults(); loadRuns()
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

const trendData = computed(() => {
  return [...results.value].reverse().map(r => ({
    period: r.period,
    value: typeof r.value?.value === 'number' ? r.value.value : 0,
  }))
})

// 新建/编辑 — 使用 FormulaFieldEditor 作为统一编辑器
const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editId = ref<number | null>(null)
const form = ref({
  metric_code: '', metric_name: '', metric_type: 'derived' as MetricCreatePayload['metric_type'],
  subject_area: '', business_definition: '', calculation_desc: '', formula_expr: '',
  stat_period: '', related_dataset_id: undefined as number | undefined, owner_name: '',
})
const saving = ref(false)
const datasetOptions = ref<{ id: number; name: string; label: string; layer: string }[]>([])
const loadingDatasets = ref(false)

// 公式编辑器字段
const formulaEditorFields = ref<ColumnInfo[]>([])
const formulaEditorKey = ref(0)
const editorTitle = computed(() => dialogMode.value === 'create' ? '新建指标' : '编辑指标')

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
  form.value = { metric_code: '', metric_name: '', metric_type: 'derived', subject_area: '', business_definition: '', calculation_desc: '', formula_expr: '', stat_period: '', related_dataset_id: undefined, owner_name: '' }
  formulaEditorFields.value = []
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
      stat_period: m.stat_period || '', related_dataset_id: m.related_dataset_id || undefined,
      owner_name: m.owner_name || '',
    }
    if (m.related_dataset_id) { await loadFormulaEditorFields() }
    formulaEditorKey.value++
    dialogVisible.value = true
  } catch { ElMessage.error('加载指标详情失败') }
}

async function save() {
  saving.value = true
  try {
    if (dialogMode.value === 'create') {
      await createMetric({ ...form.value } as MetricCreatePayload)
      ElMessage.success('指标已创建')
    } else {
      const { metric_code, ...updatePayload } = form.value
      await updateMetric(editId.value!, updatePayload as MetricUpdatePayload)
      ElMessage.success('指标已更新')
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
  if (f.includes('COUNT(') || f.includes('COUNT_DISTINCT(')) return 'count'
  if (f.includes('/') && (f.includes('SUM(') || f.includes('COUNT(') || f.includes('AVG('))) return 'ratio'
  if (!f.match(/SUM|COUNT|AVG|MAX|MIN|ROUND|IF/)) return 'text'
  return 'derived'
}

// 公式变化时自动推导类型（不覆盖用户已有类型，除非用户改了公式）
watch(() => form.value.formula_expr, (val) => {
  if (val) form.value.metric_type = deriveMetricType(val) as any
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

    <!-- 指标详情抽屉（R0303：趋势 + 计算 + 运行记录） -->
    <el-drawer v-model="detailVisible" title="指标计算结果" size="650px" :close-on-click-modal="false">
      <template v-if="detailMetric">
        <el-descriptions :column="2" size="small" border style="margin-bottom: 16px">
          <el-descriptions-item label="编码">{{ detailMetric.metric_code }}</el-descriptions-item>
          <el-descriptions-item label="名称">{{ detailMetric.metric_name }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ TYPE_LABELS[detailMetric.metric_type] || detailMetric.metric_type }}</el-descriptions-item>
          <el-descriptions-item label="状态"><el-tag size="small" :type="STATUS_TAG[detailMetric.status]||'info'">{{ STATUS_LABELS[detailMetric.status]||detailMetric.status }}</el-tag></el-descriptions-item>
          <el-descriptions-item v-if="detailMetric.formula_expr" label="公式" :span="2">{{ detailMetric.formula_expr }}</el-descriptions-item>
        </el-descriptions>

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
          <!-- 计算状态提示 -->
          <div v-if="lastComputeStatus" style="margin-top:6px">
            <el-alert v-if="lastComputeStatus === 'running'" type="info" :closable="false"
              title="计算执行中，运行记录区将自动更新..." show-icon />
            <el-alert v-else-if="lastComputeStatus === 'success' && computedResult" type="success" :closable="false"
              :title="`上次计算完成 · 结果: ${computedResult.period}`" show-icon>
              <template #default>
                <span style="font-size:13px">计算结果: {{ computedResult.value?.value }}</span>
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
              <span style="font-size:11px;margin-bottom:4px;color:#303133;font-weight:600">{{ d.value }}</span>
              <div :style="{height: Math.max(4, (d.value / Math.max(...trendData.map(x=>x.value),1)) * 100)+'%', width:'100%', maxWidth:'40px', background:'#409eff', borderRadius:'4px 4px 0 0', minHeight:'4px'}"></div>
              <span style="font-size:10px;color:#909399;margin-top:4px;writing-mode:horizontal-tb">{{ d.period }}</span>
            </div>
          </div>
        </el-card>

        <!-- 计算结果列表 -->
        <el-card shadow="never" size="small" style="margin-bottom: 16px">
          <template #header><span style="font-weight: 600">计算结果</span></template>
          <el-table v-loading="resultsLoading" :data="results" size="small" border empty-text="暂无结果" max-height="200">
            <el-table-column prop="period" label="周期" width="120" />
            <el-table-column prop="value.value" label="计算结果" min-width="100" />
            <el-table-column prop="computed_at" label="计算时间" width="160">
              <template #default="{ row }">{{ row.computed_at?.substring(0, 19) }}</template>
            </el-table-column>
          </el-table>
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
              <template #default="{ row }">{{ row.started_at?.substring(0, 19) }}</template>
            </el-table-column>
            <el-table-column prop="finished_at" label="结束时间" width="160">
              <template #default="{ row }">{{ row.finished_at?.substring(0, 19) }}</template>
            </el-table-column>
          </el-table>
        </el-card>

        <!-- 自动化数仓开发面板（X05） -->
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
              <span style="font-size:11px;color:#909399">DWS 生成时自动派生 year/quarter/month，BI 端支持自然下钻</span>
            </el-form-item>
            <el-form-item label="业务定义">
              <el-input v-model="form.business_definition" type="textarea" :rows="2" />
            </el-form-item>
            <el-form-item label="口径说明">
              <el-input v-model="form.calculation_desc" type="textarea" :rows="2" placeholder="计算口径的文字说明" />
            </el-form-item>
          </el-form>
        </section>
      </template>

      <template #actions>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存指标</el-button>
      </template>
    </FormulaFieldEditor>
  </div>
</template>
