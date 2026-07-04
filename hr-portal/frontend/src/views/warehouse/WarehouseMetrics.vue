<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useUserStore } from '@/stores/user'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Refresh, Edit, Finished, FolderDelete } from '@element-plus/icons-vue'
import { listMetrics, createMetric, updateMetric, getMetric, publishMetric, archiveMetric, type MetricListItem, type MetricDetail, type MetricCreatePayload, type MetricUpdatePayload } from '@/api/warehouse'

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

async function load() {
  loading.value = true
  try {
    const params: Record<string, any> = { page: page.value, page_size: pageSize.value }
    if (keyword.value) params.keyword = keyword.value
    if (statusFilter.value) params.status = statusFilter.value
    const res = await listMetrics(params)
    metrics.value = res.items
    total.value = res.total
  } catch {
    ElMessage.error('加载指标列表失败')
  } finally { loading.value = false }
}

// 新建/编辑弹窗
const dialogVisible = ref(false)
const dialogMode = ref<'create'|'edit'>('create')
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
      <el-table v-loading="loading" :data="metrics" border stripe size="small" empty-text="暂无指标">
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
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button v-if="userStore.hasOp('warehouse.metrics','U')" text size="small" :icon="Edit" @click="openEdit(row.id)">编辑</el-button>
            <el-button v-if="row.status==='draft'&&userStore.hasOp('warehouse.metrics','U')" text size="small" type="success" :icon="Finished" @click="doPublish(row.id)">发布</el-button>
            <el-button v-if="row.status==='published'&&userStore.hasOp('warehouse.metrics','U')" text size="small" type="warning" :icon="FolderDelete" @click="doArchive(row.id)">归档</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div style="display: flex; justify-content: flex-end; margin-top: 12px">
        <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[20,50,100]" layout="total,sizes,prev,pager,next" />
      </div>
    </el-card>

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
