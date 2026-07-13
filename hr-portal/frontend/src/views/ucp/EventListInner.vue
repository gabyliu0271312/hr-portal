<template>
  <div class="event-list">
    <div class="toolbar">
      <el-select v-model="filters.source" placeholder="来源" clearable style="width: 140px" @change="loadList">
        <el-option v-for="s in SOURCES" :key="s" :label="s" :value="s" />
      </el-select>
      <el-select v-model="filters.event_type" placeholder="事件类型" clearable filterable style="width: 180px" @change="loadList">
        <el-option v-for="t in EVENT_TYPES" :key="t" :label="t" :value="t" />
      </el-select>
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 140px" @change="loadList">
        <el-option v-for="s in STATUSES" :key="s.value" :label="s.label" :value="s.value" />
      </el-select>
      <el-button @click="loadList" :icon="Refresh">刷新</el-button>
      <el-button type="primary" :icon="Plus" @click="openIngestDialog">发布事件</el-button>
    </div>

    <!-- 列表 -->
    <el-table :data="items" v-loading="loading" stripe border>
      <el-table-column prop="id" label="DB ID" width="80" />
      <el-table-column prop="event_id" label="Event ID" min-width="220" show-overflow-tooltip>
        <template #default="{ row }">
          <el-link type="primary" @click="goDetail(row)">{{ row.event_id }}</el-link>
        </template>
      </el-table-column>
      <el-table-column prop="event_type" label="事件类型" width="160">
        <template #default="{ row }">
          <el-tag size="small" effect="plain">{{ row.event_type }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="source" label="来源" width="100">
        <template #default="{ row }">
          <el-tag :type="sourceTagType(row.source)" size="small">{{ row.source }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="130">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="matched_trigger_code" label="命中触发器" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">
          <code v-if="row.matched_trigger_code">{{ row.matched_trigger_code }}</code>
          <span v-else class="empty">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="pipeline_run_id" label="Pipeline Run" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          <el-link v-if="row.pipeline_run_id" type="primary" @click.stop="router.push(`/ucp/executions/${row.pipeline_run_id}`)">
            <code>{{ row.pipeline_run_id }}</code>
          </el-link>
          <span v-else class="empty">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="retry_count" label="重试" width="70" align="center" />
      <el-table-column prop="received_at" label="接收时间" width="170">
        <template #default="{ row }">{{ formatTime(row.received_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="goDetail(row)">详情</el-button>
          <el-button
            v-if="['RECEIVED', 'NO_MATCH', 'FAILED'].includes(row.status)"
            size="small"
            link
            type="warning"
            @click="manualDispatch(row)"
          >派发</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      class="pager"
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="[20, 50, 100, 200]"
      layout="total, sizes, prev, pager, next, jumper"
      @current-change="loadList"
      @size-change="loadList"
    />

    <!-- 事件发布 Dialog -->
    <EventIngestDialog :visible="ingestDialogVisible" @update:visible="(v) => (ingestDialogVisible = v)" @success="onIngested" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh, Setting, WarningFilled } from '@element-plus/icons-vue'
import { ucpApi } from '@/api/ucp'
import PermissionButton from '@/components/PermissionButton.vue'
import EventIngestDialog from './EventIngestDialog.vue'

const router = useRouter()

const SOURCES = ['FEISHU', 'BEISEN', 'INTERNAL', 'GENERIC']
const EVENT_TYPES = [
  'EMPLOYEE_ONBOARDING', 'OFFER_STATUS_CHANGE', 'CONTACT_UPDATE',
  'ORG_CHANGE', 'TIMECARD_SUBMIT', 'LEAVE_APPLY', 'GENERIC',
]
const STATUSES = [
  { value: 'RECEIVED', label: '已接收' },
  { value: 'MATCHED', label: '已匹配' },
  { value: 'DISPATCHED', label: '已派发' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'FAILED', label: '失败' },
  { value: 'DEAD_LETTER', label: '死信' },
  { value: 'NO_MATCH', label: '未匹配' },
]

const items = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)

const filters = reactive<{ source?: string; event_type?: string; status?: string }>({})

const stats = reactive({ todayCount: 0, dispatchedCount: 0, noMatchCount: 0, failedCount: 0 })

const ingestDialogVisible = ref(false)

async function loadList() {
  loading.value = true
  try {
    const res = await ucpApi.listEvents({
      source: filters.source,
      event_type: filters.event_type,
      status: filters.status,
      limit: pageSize.value,
      offset: (page.value - 1) * pageSize.value,
    })
    items.value = res.items || []
    total.value = res.total || 0
    await loadStats()
  } finally {
    loading.value = false
  }
}

async function loadStats() {
  // 稳健实现：分批拉取，每次 200 条，最多拉 1000 条做统计
  // 避免单次 limit 过大触发后端参数校验失败
  try {
    let all: any[] = []
    const batchSize = 200
    const maxRows = 1000
    let offset = 0
    while (offset < maxRows) {
      const res = await ucpApi.listEvents({ limit: batchSize, offset })
      const items = res.items || []
      all = all.concat(items)
      if (items.length < batchSize) break  // 已拉完
      offset += batchSize
    }
    const today = new Date().toISOString().slice(0, 10)
    stats.todayCount = all.filter((e: any) => (e.received_at || '').slice(0, 10) === today).length
    stats.dispatchedCount = all.filter((e: any) => ['DISPATCHED', 'COMPLETED'].includes(e.status)).length
    stats.noMatchCount = all.filter((e: any) => e.status === 'NO_MATCH').length
    stats.failedCount = all.filter((e: any) => ['FAILED', 'DEAD_LETTER'].includes(e.status)).length
  } catch {
    // 静默：统计失败不影响主列表
  }
}

function openIngestDialog() {
  ingestDialogVisible.value = true
}

function onIngested() {
  page.value = 1
  loadList()
}

function goDetail(row: any) {
  router.push({ name: 'UcpEventDetail', params: { eventId: String(row.id) } })
}

defineExpose({ loadList })

async function manualDispatch(row: any) {
  await ElMessageBox.confirm(
    `确认对事件 ${row.event_id} 重新匹配并派发？`,
    '手动派发',
    { type: 'warning' },
  )
  try {
    const res = await ucpApi.manualDispatchEvent(String(row.id))
    ElMessage.success(`已派发：${res.status} / ${res.matched_trigger_code || '无匹配'}`)
    loadList()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '派发失败')
  }
}

function statusTagType(s: string) {
  switch (s) {
    case 'COMPLETED': return 'success'
    case 'DISPATCHED': return 'success'
    case 'MATCHED': return 'info'
    case 'RECEIVED': return 'info'
    case 'FAILED': return 'danger'
    case 'DEAD_LETTER': return 'danger'
    case 'NO_MATCH': return 'warning'
    default: return ''
  }
}

function statusLabel(s: string) {
  return STATUSES.find((x) => x.value === s)?.label || s
}

function sourceTagType(s: string) {
  switch (s) {
    case 'FEISHU': return 'success'
    case 'BEISEN': return 'warning'
    case 'INTERNAL': return 'info'
    default: return ''
  }
}

function formatTime(t: string | null) {
  if (!t) return '-'
  return t.replace('T', ' ').slice(0, 19)
}

onMounted(loadList)
</script>

<style scoped>
.event-list { padding: 16px; }
.page-header h2 { margin: 0 0 4px; font-size: 20px; }
.page-header .desc { color: #909399; margin: 0 0 16px; font-size: 13px; }
.stat-row { margin-bottom: 16px; }
.stat-card { text-align: center; }
.stat-label { color: #909399; font-size: 12px; margin-bottom: 4px; }
.stat-value { font-size: 24px; font-weight: 600; color: #303133; }
.stat-value.success { color: #67c23a; }
.stat-value.warning { color: #e6a23c; }
.stat-value.danger { color: #f56c6c; }
.toolbar { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; }
.pager { margin-top: 16px; text-align: right; }
.empty { color: #c0c4cc; }
code { font-family: 'JetBrains Mono', Consolas, monospace; font-size: 12px; }
</style>
