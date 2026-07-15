<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useUserStore } from '@/stores/user'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Refresh, Finished, FolderDelete, DataAnalysis, View } from '@element-plus/icons-vue'
import SmartCodeInput from '@/components/common/SmartCodeInput.vue'
import {
  listDwsAggregates, createDwsAggregate, updateDwsAggregate, deleteDwsAggregate,
  publishDwsAggregate, archiveDwsAggregate, generateDwsView, getDwsViewImpact,
  validateDwsAggregate,
  listModels, listDimensions, listMetrics, diagnoseMetric,
  type DwsAggregate, type Dimension,
} from '@/api/warehouse'

const userStore = useUserStore()
const aggregates = ref<DwsAggregate[]>([])
const loading = ref(false)
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

async function load() {
  loading.value = true
  try {
    const res = await listDwsAggregates({ page: page.value, page_size: pageSize.value })
    aggregates.value = res.items
    total.value = res.total
  } catch { ElMessage.error('加载聚合定义列表失败') }
  finally { loading.value = false }
}

// 维度列表（R0312: group_by 从维度目录加载）
const dimensions = ref<Dimension[]>([])

async function loadDimensions() {
  try {
    dimensions.value = await listDimensions()
  } catch { dimensions.value = [] }
}
// 严格同源过滤：只显示绑定同数据集的维度
const filteredDimensions = computed(() =>
  form.value.source_dataset_id
    ? dimensions.value.filter(d => (d as any).source_dataset_id === form.value.source_dataset_id)
    : []
)

// 数据集下拉（仅 DWD 层）
const datasets = ref<{ id: number; name: string }[]>([])

async function loadDatasets() {
  try {
    const res = await listModels({ page_size: 200, warehouse_layer: 'DWD' })
    datasets.value = res.items.map((m: any) => ({ id: m.id, name: m.label || m.name }))
  } catch { datasets.value = [] }
}

function dimLabel(d: Dimension) {
  const sid = (d as any).source_dataset_id
  if (sid && d.bound_field) return `${d.dimension_code}（#${sid}.${d.bound_field}）`
  return `${d.dimension_code}（未绑定）`
}

// 指标下拉
const metrics = ref<{ id: number; metric_code: string; metric_name: string }[]>([])
const metricsLoading = ref(false)
const autoDeriving = ref(false)

const filteredMetrics = computed(() =>
  form.value.source_dataset_id
    ? metrics.value.filter(m => (m as any).related_dataset_id === form.value.source_dataset_id)
    : []
)

async function loadMetrics() {
  if (metrics.value.length > 0) return
  metricsLoading.value = true
  try {
    const res = await listMetrics({ page_size: 200 })
    metrics.value = (res.items || []).map((m: any) => ({
      id: m.id, metric_code: m.metric_code, metric_name: m.metric_name, related_dataset_id: m.related_dataset_id,
    }))
  } catch { metrics.value = [] }
  finally { metricsLoading.value = false }
}

// 选指标 → 自动推导 time_grain / group_by / source_dataset_id
async function onMetricChange(metricId: number | undefined) {
  form.value.metric_id = metricId
  if (!metricId) return
  autoDeriving.value = true
  try {
    const diag = await diagnoseMetric(metricId)
    if (!diag.automatable) {
      ElMessage.warning('该指标暂不支持自动推导: ' + (diag.errors?.[0] || ''))
      return
    }
    if (diag.time_grain && !form.value.time_grain) {
      form.value.time_grain = diag.time_grain
    }
    if (diag.dimension_fields?.length) {
      const existing = new Set(form.value.group_by)
      for (const d of diag.dimension_fields) {
        if (d !== 'year' && d !== 'quarter' && d !== 'month') existing.add(d)
      }
      form.value.group_by = [...existing]
    }
    if (!form.value.source_dataset_id && diag.source_dataset_id) {
      form.value.source_dataset_id = diag.source_dataset_id
    }
    ElMessage.success('已根据指标自动推导分组参数')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '指标诊断失败')
  }
  finally { autoDeriving.value = false }
}

// 表单弹窗
const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editId = ref<number | null>(null)
const form = ref({
  label: '', name: '', metric_id: undefined as number | undefined, source_dataset_id: undefined as number | undefined,
  group_by: [] as string[], filter: null as Record<string, any> | null,
  time_grain: undefined as string | undefined,
  business_definition: '',
})
const saving = ref(false)

function openCreate() {
  dialogMode.value = 'create'; editId.value = null
  form.value = { label: '', name: '', metric_id: undefined, source_dataset_id: undefined, group_by: [], filter: null, time_grain: undefined, business_definition: '' }
  loadDatasets()
  loadDimensions()
  loadMetrics()
  dialogVisible.value = true
}

async function openEdit(id: number) {
  const a = aggregates.value.find(x => x.id === id)
  if (!a) return
  dialogMode.value = 'edit'; editId.value = id
  form.value = {
    label: a.label || '', name: a.name, metric_id: a.metric_id ?? undefined, source_dataset_id: a.source_dataset_id ?? undefined,
    group_by: a.group_by?.slice() || [], filter: a.filter,
    time_grain: a.time_grain ?? undefined,
    business_definition: a.business_definition ?? '',
  }
  await loadDimensions()
  await loadDatasets()
  dialogVisible.value = true
}

async function save() {
  saving.value = true
  try {
    // 保存前校验
    const validation = await validateDwsAggregate(form.value as any)
    if (!validation.valid) {
      ElMessage.warning(validation.errors?.map((e: any) => e.message).join('；'))
      saving.value = false; return
    }
    if (dialogMode.value === 'create') {
      await createDwsAggregate(form.value as any)
      ElMessage.success('聚合定义已创建')
    } else {
      await updateDwsAggregate(editId.value!, form.value as any)
      ElMessage.success('聚合定义已更新')
    }
    dialogVisible.value = false; load()
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '保存失败') }
  finally { saving.value = false }
}

async function doDelete(id: number) {
  try {
    await ElMessageBox.confirm('确定删除该聚合定义？', '确认删除', { type: 'warning' })
    await deleteDwsAggregate(id); ElMessage.success('已删除'); load()
  } catch { /* 取消 */ }
}

async function doPublish(id: number) {
  try {
    await publishDwsAggregate(id); ElMessage.success('已发布'); load()
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '发布失败') }
}

async function doArchive(id: number) {
  try {
    await archiveDwsAggregate(id); ElMessage.success('已归档'); load()
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '归档失败') }
}

// R0311: 视图生成
const viewDialogVisible = ref(false)
const viewAggId = ref<number | null>(null)
const viewLoading = ref(false)
const impact = ref<any>(null)
const viewResult = ref<any>(null)

async function openViewGenerate(id: number) {
  viewAggId.value = id; viewResult.value = null
  viewLoading.value = true
  try {
    impact.value = await getDwsViewImpact(id)
  } catch { impact.value = null }
  finally { viewLoading.value = false }
  viewDialogVisible.value = true
}

async function doGenerateView() {
  if (!viewAggId.value) return
  viewLoading.value = true
  try {
    viewResult.value = await generateDwsView(viewAggId.value)
    ElMessage.success('DWS 视图已生成')
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '视图生成失败') }
  finally { viewLoading.value = false }
}

onMounted(load)
</script>

<template>
  <div style="padding: 24px">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px">
      <h2 style="margin: 0; font-size: 20px">汇总视图</h2>
      <el-button v-if="userStore.hasOp('warehouse.modeling','C')" type="primary" :icon="Plus" @click="openCreate">新建聚合</el-button>
    </div>

    <el-card shadow="never">
      <el-table v-loading="loading" :data="aggregates" border stripe size="small" empty-text="暂无聚合定义">
          <el-table-column label="名称" min-width="120">
            <template #default="{ row }">{{ row.label || row.name }}</template>
          </el-table-column>
          <el-table-column prop="name" label="编码" min-width="100" />
        <el-table-column label="分组维度" min-width="160">
          <template #default="{ row }">
            <el-tag v-for="g in row.group_by" :key="g" size="small" style="margin-right:4px">{{ g }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="time_grain" label="时间粒度" width="80" />
        <el-table-column prop="business_definition" label="口径说明" min-width="120" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status==='published'?'success':row.status==='archived'?'info':''">{{ row.status === 'draft' ? '草稿' : row.status === 'published' ? '已发布' : '已归档' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="300" fixed="right">
          <template #default="{ row }">
            <el-button v-if="userStore.hasOp('warehouse.modeling','C')" text size="small" :icon="View" type="primary" @click="openViewGenerate(row.id)">生成视图</el-button>
            <el-button v-if="userStore.hasOp('warehouse.modeling','U')" text size="small" :icon="Edit" @click="openEdit(row.id)">编辑</el-button>
            <el-button v-if="row.status==='draft'&&userStore.hasOp('warehouse.modeling','U')" text size="small" type="success" :icon="Finished" @click="doPublish(row.id)">发布</el-button>
            <el-button v-if="row.status==='published'&&userStore.hasOp('warehouse.modeling','U')" text size="small" type="warning" :icon="FolderDelete" @click="doArchive(row.id)">归档</el-button>
            <el-button v-if="userStore.hasOp('warehouse.modeling','D')" text size="small" type="danger" :icon="Delete" @click="doDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div style="display: flex; justify-content: flex-end; margin-top: 12px">
        <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[20,50,100]" layout="total,sizes,prev,pager,next" />
      </div>
    </el-card>

    <!-- R0309: DWS 聚合配置表单弹窗 -->
    <el-dialog v-model="dialogVisible" :title="dialogMode==='create'?'新建聚合定义':'编辑聚合定义'" width="600px" @close="editId=null">
      <el-form v-if="dialogVisible" label-width="100px" size="small">
        <el-form-item label="名称" required>
            <el-input v-model="form.label" placeholder="聚合展示名称" />
          </el-form-item>
          <el-form-item label="编码" required>
            <SmartCodeInput v-model="form.name" :label="form.label" scope="table" prefix="dws_" />
          </el-form-item>
        <el-form-item label="关联指标" required>
          <el-select v-model="form.metric_id" clearable filterable placeholder="选择指标" style="width:100%" :loading="metricsLoading" @focus="loadMetrics" @change="onMetricChange">
            <el-option v-for="m in filteredMetrics" :key="m.id" :label="`${m.metric_name} (${m.metric_code})`" :value="m.id" />
          </el-select>
          <span v-if="autoDeriving" style="font-size:11px;color:#409eff">正在从指标自动推导分组参数...</span>
        </el-form-item>
        <el-form-item label="来源数据集">
          <el-select v-model="form.source_dataset_id" clearable filterable placeholder="由指标自动推导" style="width:100%">
            <el-option v-for="ds in datasets" :key="ds.id" :label="`${ds.name} (#${ds.id})`" :value="ds.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="分组维度">
          <el-select v-model="form.group_by" multiple filterable placeholder="由指标自动推导 + 从维度目录选择" style="width:100%">
            <el-option v-for="d in filteredDimensions" :key="d.dimension_code" :label="dimLabel(d)" :value="d.dimension_code">
              <span>{{ d.dimension_code }}</span>
              <span v-if="d.bound_table && d.bound_field" style="color:#909399;font-size:12px;margin-left:8px">{{ d.bound_table }}.{{ d.bound_field }}</span>
              <span v-else style="color:#e6a23c;font-size:12px;margin-left:8px">未绑定字段</span>
            </el-option>
          </el-select>
          <span style="font-size:11px;color:#909399">选关联指标后自动回填，可手动增减</span>
        </el-form-item>
        <el-form-item label="口径说明"><el-input v-model="form.business_definition" type="textarea" :rows="2" placeholder="说明该聚合的业务口径" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- R0311: 视图生成弹窗 -->
    <el-dialog v-model="viewDialogVisible" title="生成 DWS 逻辑视图" width="650px">
      <template v-if="impact">
        <el-descriptions :column="2" size="small" border style="margin-bottom: 16px">
          <el-descriptions-item label="聚合名称">{{ impact.aggregate_name }}</el-descriptions-item>
          <el-descriptions-item label="预计输出字段">{{ impact.estimated_output_fields }} 个</el-descriptions-item>
        </el-descriptions>

        <div v-if="impact.warnings?.length" style="margin-bottom: 12px">
          <el-alert v-for="w in impact.warnings" :key="w" :title="w" type="warning" show-icon :closable="false" style="margin-bottom: 6px" />
        </div>

        <div v-if="impact.dependencies?.length" style="margin-bottom: 12px">
          <div style="font-weight:600;margin-bottom:8px">依赖模型</div>
          <el-table :data="impact.dependencies" size="small" border>
            <el-table-column prop="type" label="类型" width="70" />
            <el-table-column prop="name" label="名称" min-width="120" />
            <el-table-column prop="status" label="状态" width="80" />
          </el-table>
        </div>
      </template>

      <template v-if="viewResult">
        <el-alert title="视图生成成功" type="success" :closable="false" style="margin-bottom: 12px" />
        <el-descriptions :column="1" size="small" border>
          <el-descriptions-item label="视图名称">{{ viewResult.view_name }}</el-descriptions-item>
          <el-descriptions-item label="版本">{{ viewResult.version }}</el-descriptions-item>
          <el-descriptions-item label="输出字段">{{ viewResult.output_fields?.join(', ') }}</el-descriptions-item>
        </el-descriptions>
        <div style="margin-top: 12px">
          <div style="font-weight:600;margin-bottom:6px">SQL 摘要</div>
          <pre style="background:#f5f7fa;padding:12px;border-radius:4px;font-size:12px;overflow-x:auto;max-height:200px"><code>{{ viewResult.sql_summary }}</code></pre>
        </div>
      </template>

      <template #footer>
        <el-button @click="viewDialogVisible=false">关闭</el-button>
        <el-button v-if="!viewResult" type="primary" :icon="DataAnalysis" :loading="viewLoading" @click="doGenerateView">生成视图</el-button>
      </template>
    </el-dialog>
  </div>
</template>
