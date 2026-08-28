<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Refresh, Search, View } from '@element-plus/icons-vue'
import { api } from '@/api/client'
import { formatDateTime } from '@/utils/datetime'

interface AuditField {
  code?: string
  label?: string
  data_type?: string
  is_sensitive?: boolean | null
}

interface AuditFilter {
  source?: string
  column?: string
  op?: string
  has_value?: boolean
  value_count?: number
  value_hmac?: string | null
}

interface SystemLog {
  id: number
  category: string
  action: string
  status: string
  user_id: number | null
  user_display_name: string | null
  request_summary: string | null
  response_summary: string | null
  input_hash: string | null
  output_hash: string | null
  metadata_json: {
    actor?: { user_id?: number; login_name?: string; display_name?: string }
    report?: {
      id?: number
      name?: string
      dataset_id?: number
      owner_id?: number
      visibility?: string
      scope_strategy?: string | null
      config_hash?: string
    }
    content?: {
      fields?: AuditField[]
      filters?: AuditFilter[]
      field_count?: number
      sensitive_field_count?: number
      row_count?: number | null
      page?: number | null
      page_size?: number | null
      format?: string | null
      target_count?: number | null
      targets?: Array<{ id?: number; name?: string; ok?: boolean; rows?: number }>
    }
    client?: { ip?: string | null; user_agent?: string }
    rule_name?: string
    trigger_type?: string
    biz_type?: string
    employee_name?: string
    employee_no?: string
    company?: string
  }
  error: string | null
  trace_id: string | null
  created_at: string
}

interface SystemLogPage {
  items: SystemLog[]
  total: number
  page: number
  page_size: number
}

const LOG_TYPES = [
  { value: 'compensation_calc', label: '补偿金计算' },
  { value: 'automation_notification', label: '自动通知' },
  { value: 'report_access', label: '报表访问' },
]

const REPORT_ACTIONS = [
  { value: 'create', label: '新建' },
  { value: 'update', label: '修改' },
  { value: 'delete', label: '删除' },
  { value: 'view_data', label: '查看数据' },
  { value: 'export_csv', label: '导出 CSV' },
  { value: 'export_xlsx', label: '导出 Excel' },
  { value: 'push', label: '推送' },
  { value: 'access_denied', label: '访问拒绝' },
]

const ACTION_LABELS = Object.fromEntries(REPORT_ACTIONS.map((item) => [item.value, item.label]))
const PAGE_SIZE = 20
const loading = ref(false)
const loadError = ref('')
const rows = ref<SystemLog[]>([])
const total = ref(0)
const page = ref(1)
const logType = ref('compensation_calc')
const action = ref('')
const statusFilter = ref('')
const operator = ref('')
const keyword = ref('')
const dateRange = ref<Date[]>([])
const selectedLog = ref<SystemLog | null>(null)
let debounceTimer: number | undefined
let requestSequence = 0

const isReportAccess = computed(() => logType.value === 'report_access')
const detailFields = computed(() => selectedLog.value?.metadata_json?.content?.fields || [])
const detailFilters = computed(() => selectedLog.value?.metadata_json?.content?.filters || [])
const detailTargets = computed(() => selectedLog.value?.metadata_json?.content?.targets || [])
const detailOpen = computed({
  get: () => selectedLog.value !== null,
  set: (open: boolean) => {
    if (!open) selectedLog.value = null
  },
})

function actionLabel(value: string) {
  return ACTION_LABELS[value] || value || '—'
}

function statusType(value: string): 'success' | 'danger' | 'warning' | 'info' {
  if (value === 'success') return 'success'
  if (value === 'failed') return 'danger'
  if (value === 'denied') return 'warning'
  return 'info'
}

function statusLabel(value: string) {
  return value === 'success' ? '成功' : value === 'failed' ? '失败' : value === 'denied' ? '拒绝' : value
}

function shortHash(value?: string | null) {
  return value ? `${value.slice(0, 12)}…` : '—'
}

async function load() {
  const sequence = ++requestSequence
  loading.value = true
  loadError.value = ''
  try {
    const params: Record<string, unknown> = {
      category: logType.value,
      paged: true,
      page: page.value,
      page_size: PAGE_SIZE,
      action: action.value || undefined,
      status: statusFilter.value || undefined,
      operator: operator.value.trim() || undefined,
      keyword: keyword.value.trim() || undefined,
      start_at: dateRange.value[0]?.toISOString(),
      end_at: dateRange.value[1]?.toISOString(),
    }
    const result = await api.get<SystemLogPage>('/system-logs', { params }).then((response) => response.data)
    if (sequence !== requestSequence) return
    rows.value = result.items
    total.value = result.total
    if (page.value > Math.max(1, Math.ceil(result.total / PAGE_SIZE))) {
      page.value = 1
    }
  } catch (error: any) {
    if (sequence !== requestSequence) return
    rows.value = []
    total.value = 0
    loadError.value = error?.response?.data?.detail || '加载日志失败'
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

function reloadFromFirstPage() {
  if (page.value === 1) {
    void load()
  } else {
    page.value = 1
  }
}

function scheduleLoad() {
  window.clearTimeout(debounceTimer)
  debounceTimer = window.setTimeout(reloadFromFirstPage, 300)
}

function changeLogType() {
  action.value = ''
  statusFilter.value = ''
  operator.value = ''
  keyword.value = ''
  dateRange.value = []
  reloadFromFirstPage()
}

watch([operator, keyword], scheduleLoad)
watch(page, () => void load())

onMounted(load)
onBeforeUnmount(() => window.clearTimeout(debounceTimer))
</script>

<template>
  <section class="operation-log-page">
    <div class="log-toolbar">
      <div class="log-filters" role="search" aria-label="筛选操作日志">
        <el-select v-model="logType" class="type-filter" @change="changeLogType">
          <el-option v-for="item in LOG_TYPES" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-date-picker
          v-model="dateRange"
          type="datetimerange"
          range-separator="至"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          class="date-filter"
          @change="reloadFromFirstPage"
        />
        <el-input v-model="operator" clearable placeholder="操作人" class="operator-filter" />
        <el-select
          v-if="isReportAccess"
          v-model="action"
          clearable
          placeholder="全部动作"
          class="action-filter"
          @change="reloadFromFirstPage"
        >
          <el-option v-for="item in REPORT_ACTIONS" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-input v-model="keyword" clearable :placeholder="isReportAccess ? '搜索报表' : '搜索操作对象'" class="keyword-filter">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-model="statusFilter" clearable placeholder="全部状态" class="status-filter" @change="reloadFromFirstPage">
          <el-option label="成功" value="success" />
          <el-option label="失败" value="failed" />
          <el-option label="拒绝" value="denied" />
        </el-select>
      </div>
      <el-tooltip content="刷新日志" placement="top">
        <el-button circle aria-label="刷新日志" :loading="loading" @click="load"><el-icon><Refresh /></el-icon></el-button>
      </el-tooltip>
    </div>

    <div v-if="loadError && !loading" class="log-error" role="alert">
      <el-empty :description="loadError"><el-button type="primary" @click="load">重新加载</el-button></el-empty>
    </div>

    <template v-else>
      <div class="log-table-region">
        <el-table v-loading="loading" :data="rows" stripe height="100%">
          <el-table-column label="操作时间" min-width="170">
            <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
          </el-table-column>
          <el-table-column label="操作人" min-width="130">
            <template #default="{ row }">
              {{ row.user_display_name || row.metadata_json?.actor?.display_name || (row.user_id ? `用户#${row.user_id}` : '系统') }}
            </template>
          </el-table-column>

          <template v-if="isReportAccess">
            <el-table-column label="动作" min-width="110">
              <template #default="{ row }">{{ actionLabel(row.action) }}</template>
            </el-table-column>
            <el-table-column label="报表" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">{{ row.metadata_json?.report?.name || row.request_summary || '—' }}</template>
            </el-table-column>
            <el-table-column label="字段数" width="90" align="center">
              <template #default="{ row }">{{ row.metadata_json?.content?.field_count ?? '—' }}</template>
            </el-table-column>
            <el-table-column label="行数" width="100" align="right">
              <template #default="{ row }">{{ row.metadata_json?.content?.row_count ?? '—' }}</template>
            </el-table-column>
            <el-table-column label="格式" width="90" align="center">
              <template #default="{ row }">{{ row.metadata_json?.content?.format?.toUpperCase() || '—' }}</template>
            </el-table-column>
          </template>

          <template v-else-if="logType === 'automation_notification'">
            <el-table-column label="规则名称" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">{{ row.metadata_json?.rule_name || '—' }}</template>
            </el-table-column>
            <el-table-column label="触发类型" min-width="130">
              <template #default="{ row }">{{ row.metadata_json?.trigger_type || '—' }}</template>
            </el-table-column>
            <el-table-column label="业务范围" min-width="140" show-overflow-tooltip>
              <template #default="{ row }">{{ row.metadata_json?.biz_type || '—' }}</template>
            </el-table-column>
            <el-table-column label="摘要" min-width="220" show-overflow-tooltip>
              <template #default="{ row }">{{ row.response_summary || '—' }}</template>
            </el-table-column>
          </template>

          <template v-else>
            <el-table-column label="被查员工" min-width="140">
              <template #default="{ row }">{{ row.metadata_json?.employee_name || '—' }}</template>
            </el-table-column>
            <el-table-column label="工号" min-width="110">
              <template #default="{ row }">{{ row.metadata_json?.employee_no || '—' }}</template>
            </el-table-column>
            <el-table-column label="公司" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">{{ row.metadata_json?.company || '—' }}</template>
            </el-table-column>
            <el-table-column label="结果摘要" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">{{ row.response_summary || '—' }}</template>
            </el-table-column>
          </template>

          <el-table-column label="状态" width="90" align="center">
            <template #default="{ row }">
              <el-tag :type="statusType(row.status)" size="small" effect="plain">{{ statusLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80" fixed="right" align="center">
            <template #default="{ row }">
              <el-button link size="small" aria-label="查看日志详情" @click="selectedLog = row"><el-icon><View /></el-icon></el-button>
            </template>
          </el-table-column>
          <template #empty><el-empty description="暂无符合条件的操作日志" /></template>
        </el-table>
      </div>

      <footer class="log-pagination">
        <span>共 {{ total }} 条</span>
        <el-pagination
          v-if="total > PAGE_SIZE"
          v-model:current-page="page"
          :page-size="PAGE_SIZE"
          :total="total"
          layout="prev, pager, next"
          background
        />
      </footer>
    </template>

    <el-drawer v-model="detailOpen" title="操作日志详情" size="min(720px, 92vw)" append-to-body>
      <template v-if="selectedLog">
        <section class="detail-section">
          <h3>操作信息</h3>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="操作时间">{{ formatDateTime(selectedLog.created_at) }}</el-descriptions-item>
            <el-descriptions-item label="操作人">{{ selectedLog.user_display_name || selectedLog.metadata_json?.actor?.display_name || '系统' }}</el-descriptions-item>
            <el-descriptions-item label="动作">{{ actionLabel(selectedLog.action) }}</el-descriptions-item>
            <el-descriptions-item label="状态">{{ statusLabel(selectedLog.status) }}</el-descriptions-item>
            <el-descriptions-item label="报表">{{ selectedLog.metadata_json?.report?.name || '—' }}</el-descriptions-item>
            <el-descriptions-item label="数据集 ID">{{ selectedLog.metadata_json?.report?.dataset_id || '—' }}</el-descriptions-item>
            <el-descriptions-item label="权限范围">{{ selectedLog.metadata_json?.report?.scope_strategy || '—' }}</el-descriptions-item>
            <el-descriptions-item label="行数">{{ selectedLog.metadata_json?.content?.row_count ?? '—' }}</el-descriptions-item>
          </el-descriptions>
        </section>

        <section v-if="detailFields.length" class="detail-section">
          <h3>字段清单</h3>
          <el-table :data="detailFields" size="small" max-height="280">
            <el-table-column prop="label" label="字段名称" min-width="160" />
            <el-table-column prop="code" label="字段编码" min-width="180" show-overflow-tooltip />
            <el-table-column prop="data_type" label="类型" width="100" />
            <el-table-column label="敏感" width="80" align="center">
              <template #default="{ row }"><el-tag v-if="row.is_sensitive" type="danger" size="small">敏感</el-tag><span v-else>—</span></template>
            </el-table-column>
          </el-table>
        </section>

        <section v-if="detailFilters.length" class="detail-section">
          <h3>筛选摘要</h3>
          <el-table :data="detailFilters" size="small" max-height="220">
            <el-table-column prop="source" label="来源" width="100" />
            <el-table-column prop="column" label="字段" min-width="160" />
            <el-table-column prop="op" label="条件" width="100" />
            <el-table-column label="值指纹" min-width="150">
              <template #default="{ row }">{{ shortHash(row.value_hmac) }}</template>
            </el-table-column>
          </el-table>
          <p class="privacy-note">筛选值已使用 HMAC 指纹记录，日志中不保存原始敏感值。</p>
        </section>

        <section v-if="detailTargets.length" class="detail-section">
          <h3>推送目标</h3>
          <el-table :data="detailTargets" size="small" max-height="220">
            <el-table-column prop="name" label="目标名称" min-width="180" />
            <el-table-column prop="id" label="目标 ID" width="100" />
            <el-table-column prop="rows" label="行数" width="100" align="right" />
            <el-table-column label="状态" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="row.ok ? 'success' : 'danger'" size="small" effect="plain">
                  {{ row.ok ? '成功' : '失败' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </section>

        <section class="detail-section">
          <h3>追踪信息</h3>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="配置 Hash">{{ selectedLog.input_hash || selectedLog.metadata_json?.report?.config_hash || '—' }}</el-descriptions-item>
            <el-descriptions-item label="结果 Hash">{{ selectedLog.output_hash || '—' }}</el-descriptions-item>
            <el-descriptions-item label="Trace ID">{{ selectedLog.trace_id || '—' }}</el-descriptions-item>
            <el-descriptions-item label="客户端 IP">{{ selectedLog.metadata_json?.client?.ip || '—' }}</el-descriptions-item>
            <el-descriptions-item label="User-Agent">{{ selectedLog.metadata_json?.client?.user_agent || '—' }}</el-descriptions-item>
            <el-descriptions-item v-if="selectedLog.error" label="失败原因">{{ selectedLog.error }}</el-descriptions-item>
          </el-descriptions>
        </section>
      </template>
    </el-drawer>
  </section>
</template>

<style scoped>
.operation-log-page {
  box-sizing: border-box;
  display: flex;
  min-height: calc(100vh - 56px);
  padding: 24px 32px 16px;
  flex-direction: column;
  gap: 16px;
}
.log-toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.log-filters { display: flex; align-items: center; gap: 10px; min-width: 0; flex-wrap: wrap; }
.type-filter { width: 150px; }
.date-filter { width: 340px; }
.operator-filter { width: 150px; }
.action-filter { width: 150px; }
.keyword-filter { width: 220px; }
.status-filter { width: 130px; }
.log-table-region { min-height: 380px; flex: 1 1 auto; }
.log-pagination { display: flex; align-items: center; justify-content: space-between; min-height: 32px; color: var(--color-text-secondary); font-size: 13px; }
.log-error { display: grid; min-height: 380px; flex: 1; place-items: center; }
.detail-section + .detail-section { margin-top: 24px; }
.detail-section h3 { margin: 0 0 12px; font-size: 14px; letter-spacing: 0; }
.privacy-note { margin: 8px 0 0; color: var(--color-text-secondary); font-size: 12px; }
@media (max-width: 900px) {
  .operation-log-page { padding: 16px; }
  .date-filter { width: min(100%, 340px); }
}
</style>
