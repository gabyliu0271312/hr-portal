<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useUserStore } from '@/stores/user'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Refresh, Edit, Finished, FolderDelete, TrendCharts, VideoPlay, DataAnalysis } from '@element-plus/icons-vue'
import {
  listMetrics, createMetric, updateMetric, getMetric, publishMetric, archiveMetric,
  computeMetric, recalcMetric, listMetricResults, listMetricRuns,
  METRIC_RUN_STATUS_LABELS,
  type MetricListItem, type MetricDetail, type MetricCreatePayload, type MetricUpdatePayload,
  type MetricResult, type MetricRun,
} from '@/api/warehouse'

const userStore = useUserStore()
const metrics = ref<MetricListItem[]>([])
const loading = ref(false)
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const statusFilter = ref('')

const TYPE_LABELS: Record<string, string> = { count: '计数', sum: '求和', ratio: '比率', derived: '派生', text: '文本' }
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

async function doCompute() {
  if (!computePeriod.value || !detailMetricId.value) return
  computing.value = true
  try {
    const res = await computeMetric(detailMetricId.value, computePeriod.value)
    if (res.status === 'success') { ElMessage.success('计算完成'); loadResults(); loadRuns() }
    else ElMessage.warning(res.error_message || '计算失败')
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '计算失败') }
  finally { computing.value = false }
}

async function doRecalc() {
  if (!computePeriod.value || !detailMetricId.value) return
  try {
    await ElMessageBox.confirm('重算将覆盖同周期已有结果，确定？', '确认重算', { type: 'warning' })
    computing.value = true
    try {
      const res = await recalcMetric(detailMetricId.value, computePeriod.value)
      if (res.status === 'success') { ElMessage.success('重算完成'); loadResults(); loadRuns() }
      else ElMessage.warning(res.error_message || '重算失败')
    } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '重算失败') }
    finally { computing.value = false }
  } catch { /* 取消 */ }
}

const trendData = computed(() => {
  return [...results.value].reverse().map(r => ({
    period: r.period,
    value: typeof r.value?.value === 'number' ? r.value.value : 0,
  }))
})

// 新建/编辑弹窗
const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editId = ref<number | null>(null)
const form = ref({
  metric_code: '', metric_name: '', metric_type: 'derived' as MetricCreatePayload['metric_type'],
  subject_area: '', business_definition: '', calculation_desc: '', formula_expr: '',
  stat_period: '', related_dataset_id: undefined as number | undefined, owner_name: '',
})
const saving = ref(false)

function openCreate() {
  dialogMode.value = 'create'; editId.value = null
  form.value = { metric_code: '', metric_name: '', metric_type: 'derived', subject_area: '', business_definition: '', calculation_desc: '', formula_expr: '', stat_period: '', related_dataset_id: undefined, owner_name: '' }
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
      await updateMetric(editId.value!, { ...form.value } as MetricUpdatePayload)
      ElMessage.success('指标已更新')
    }
    dialogVisible.value = false; load()
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '保存失败') }
  finally { saving.value = false }
}

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
            <el-form-item label="周期">
              <el-input v-model="computePeriod" placeholder="2026-07 / 2026Q3 / 2026H1" style="width: 200px" clearable />
            </el-form-item>
            <el-form-item>
              <el-button v-if="userStore.hasOp('warehouse.metrics','U')" type="primary" :icon="VideoPlay" :loading="computing" @click="doCompute">计算</el-button>
              <el-button v-if="userStore.hasOp('warehouse.metrics','U')" :icon="Refresh" :loading="computing" @click="doRecalc">重算</el-button>
            </el-form-item>
          </el-form>
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
        <el-card shadow="never" size="small">
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
      </template>
    </el-drawer>

    <!-- 新建/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="dialogMode==='create'?'新建指标':'编辑指标'" width="600px" @close="editId=null">
      <el-form v-if="dialogVisible" label-width="100px" size="small">
        <el-divider content-position="left">基础信息</el-divider>
        <el-form-item label="指标编码" required><el-input v-model="form.metric_code" :disabled="dialogMode==='edit'" maxlength="64" /></el-form-item>
        <el-form-item label="指标名称" required><el-input v-model="form.metric_name" maxlength="128" /></el-form-item>
        <el-form-item label="指标类型"><el-select v-model="form.metric_type" style="width: 160px"><el-option v-for="(v,k) in TYPE_LABELS" :key="k" :label="v" :value="k" /></el-select></el-form-item>
        <el-form-item label="主题域"><el-input v-model="form.subject_area" placeholder="如：薪酬" /></el-form-item>
        <el-form-item label="负责人"><el-input v-model="form.owner_name" /></el-form-item>
        <el-divider content-position="left">计算口径</el-divider>
        <el-form-item label="业务定义"><el-input v-model="form.business_definition" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="口径说明"><el-input v-model="form.calculation_desc" type="textarea" :rows="2" placeholder="计算口径的文字说明" /></el-form-item>
        <el-form-item label="公式"><el-input v-model="form.formula_expr" placeholder="如：SUM(salary) / COUNT(DISTINCT emp_id)" /></el-form-item>
        <el-form-item label="统计周期"><el-select v-model="form.stat_period" clearable style="width: 160px"><el-option label="月" value="monthly" /><el-option label="季" value="quarterly" /><el-option label="年" value="yearly" /></el-select></el-form-item>
        <el-divider content-position="left">依赖数据</el-divider>
        <el-form-item label="依赖数据集"><el-input-number v-model="form.related_dataset_id" :min="1" placeholder="数据集 ID" style="width: 200px" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
