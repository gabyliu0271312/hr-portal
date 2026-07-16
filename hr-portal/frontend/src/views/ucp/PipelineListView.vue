<template>
  <div class="pipeline-list">
    <div class="page-header">
      <h2>流程编排</h2>
      <p class="desc">管理数据同步流水线，支持手动/定时/事件触发方式。</p>
    </div>

    <!-- 统计卡片 -->
    <div class="stat-row">
      <el-card class="stat-card">
        <div class="stat-label">流程总数</div>
        <div class="stat-value">{{ totalCount }}</div>
      </el-card>
      <el-card class="stat-card">
        <div class="stat-label">启用流程</div>
        <div class="stat-value text-success">{{ enabledCount }}</div>
      </el-card>
      <el-card class="stat-card">
        <div class="stat-label">禁用流程</div>
        <div class="stat-value text-danger">{{ disabledCount }}</div>
      </el-card>
      <el-card class="stat-card" :class="{ 'stat-card-warn': recentFailedCount > 0 }">
        <div class="stat-label">最近失败流程</div>
        <div class="stat-value text-warning">{{ recentFailedCount }}</div>
      </el-card>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar">
      <el-input v-model="keyword" placeholder="搜索流水线编码/名称" clearable style="width: 220px" @clear="loadList" @keyup.enter="loadList" />
      <el-select v-model="filterTrigger" placeholder="触发方式" clearable style="width: 150px" @change="loadList">
        <el-option label="手动（manual）" value="manual" />
        <el-option label="定时（cron）" value="cron" />
        <el-option label="事件（event）" value="event" />
      </el-select>
      <el-select v-model="filterStatus" placeholder="状态" clearable style="width: 130px" @change="loadList">
        <el-option label="启用" :value="1" />
        <el-option label="禁用" :value="2" />
      </el-select>
      <el-button :icon="Refresh" @click="loadList">刷新</el-button>
      <el-button type="primary" :icon="Plus" @click="openDesigner">创建流水线</el-button>
    </div>

    <!-- 流水线列表 -->
    <el-table :data="items" v-loading="loading" stripe border>
      <el-table-column prop="id" label="ID" width="65" />
      <el-table-column prop="pipeline_code" label="流水线编码" min-width="170" show-overflow-tooltip />
      <el-table-column prop="pipeline_name" label="名称" min-width="150" show-overflow-tooltip />
      <el-table-column label="触发方式" width="120">
        <template #default="{ row }">
          <el-tag size="small">{{ triggerLabel(row.trigger_type) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80" align="center">
        <template #default="{ row }">
          <el-tag size="small" :type="row.status === 1 ? 'success' : 'info'">
            {{ row.status === 1 ? '启用' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="updated_at" label="更新时间" width="170">
        <template #default="{ row }">{{ formatTime(row.updated_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="openDesigner(row)">编排</el-button>
          <el-button size="small" link type="success" @click="runPipeline(row)" :loading="runningId === row.id">执行</el-button>
          <el-button size="small" link :type="row.status === 1 ? 'warning' : 'success'" @click="toggleStatus(row)">
            {{ row.status === 1 ? '禁用' : '启用' }}
          </el-button>
          <el-button size="small" link type="danger" @click="deletePipeline(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      class="pager"
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="totalCount"
      :page-sizes="[20, 50, 100]"
      layout="total, sizes, prev, pager, next, jumper"
      @current-change="loadList"
      @size-change="loadList"
    />
  </div>
</template>

<script setup lang="ts">
import { formatDateTime } from '@/utils/datetime'
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import { ucpApi } from '@/api/ucp'

const router = useRouter()
const items = ref<any[]>([])
const totalCount = ref(0)
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const filterTrigger = ref('')
const filterStatus = ref<number | string>('')
const runningId = ref<number | null>(null)

const enabledCount = computed(() => items.value.filter(x => x.status === 1).length)
const disabledCount = computed(() => items.value.filter(x => x.status === 2).length)
const recentFailedCount = computed(() => items.value.filter(x => (x as any).recent_run_status === 'FAILED').length)

const triggerLabel = (t: string) => {
  switch (t) {
    case 'manual': return '手动'
    case 'cron': return '定时'
    case 'event': return '事件'
    default: return t || '-'
  }
}

const formatTime = (s: string | null) => (s ? formatDateTime(s) : '-')

const loadList = async () => {
  loading.value = true
  try {
    const res = await ucpApi.pipelines(filterTrigger.value || undefined)
    let data = res.items || []
    if (filterStatus.value !== '') {
      data = data.filter(x => x.status === Number(filterStatus.value))
    }
    if (keyword.value) {
      const kw = keyword.value.toLowerCase()
      data = data.filter(x => (x.pipeline_code || '').toLowerCase().includes(kw) || (x.pipeline_name || '').toLowerCase().includes(kw))
    }
    items.value = data
    totalCount.value = res.total || data.length
  } catch (e: any) {
    ElMessage.error('加载流水线列表失败: ' + (e?.message || e))
  } finally {
    loading.value = false
  }
}

const openDesigner = (row?: any) => {
  if (row) {
    router.push({ name: 'UcpPipelineDesigner', query: { code: row.pipeline_code } })
  } else {
    router.push({ name: 'UcpPipelineDesigner' })
  }
}

const runPipeline = async (row: any) => {
  try {
    await ElMessageBox.confirm(`确认手动执行流水线「${row.pipeline_name || row.pipeline_code}」？`, '提示', { type: 'info' })
    runningId.value = row.id
    const result = await ucpApi.runPipeline(row.pipeline_code, { dry_run: false })
    ElMessage.success(`流水线已触发，执行 ID: ${result.pipeline_run_id}`)
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error('执行失败: ' + (e?.response?.data?.detail || e?.message || e))
  } finally {
    runningId.value = null
  }
}

const toggleStatus = async (row: any) => {
  const newStatus = row.status === 1 ? 2 : 1
  try {
    await ElMessageBox.confirm(`确认${newStatus === 1 ? '启用' : '禁用'}流水线「${row.pipeline_name || row.pipeline_code}」？`, '提示', { type: 'warning' })
    await ucpApi.togglePipeline(row.id, newStatus)
    ElMessage.success('操作成功')
    loadList()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error('操作失败: ' + (e?.message || e))
  }
}

const deletePipeline = async (row: any) => {
  try {
    await ElMessageBox.confirm(`确认删除流水线「${row.pipeline_name || row.pipeline_code}」？此操作不可恢复。`, '确认删除', { type: 'warning' })
    await ucpApi.deletePipeline(row.id)
    ElMessage.success('删除成功')
    loadList()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error('删除失败: ' + (e?.message || e))
  }
}

onMounted(() => {
  loadList()
})
</script>

<style scoped>
.pipeline-list { padding: 16px; }
.page-header h2 { margin: 0 0 4px 0; }
.desc { color: #909399; font-size: 13px; margin: 0 0 16px 0; }
.stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
.stat-card { text-align: center; }
.stat-card :deep(.el-card__body) { padding: 14px 8px; }
.stat-label { font-size: 12px; color: #909399; }
.stat-value { font-size: 24px; font-weight: 600; margin-top: 4px; }
.text-success { color: #67c23a; }
.text-danger { color: #f56c6c; }
.toolbar { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; }
.pager { margin-top: 12px; text-align: right; }
</style>
