<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, VideoPlay, CaretRight } from '@element-plus/icons-vue'
import { ucpApi, type PipelineExecutionItem } from '@/api/ucp'
import { formatDateTime } from '@/utils/datetime'
import PermissionButton from '@/components/PermissionButton.vue'
import ManualTriggerDialog from './ManualTriggerDialog.vue'

const MENU_CODE = 'ucp.executions'

const router = useRouter()
const total = ref(0)
const list = ref<PipelineExecutionItem[]>([])
const loading = ref(false)

// Phase 2-4: 手动触发对话框
const triggerDialogVisible = ref(false)
const triggerDialogCode = ref('')

const filterPipeline = ref('')
const filterStatus = ref('')
const filterTrigger = ref('')

const STATUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'SUCCESS', label: '成功' },
  { value: 'PARTIAL_SUCCESS', label: '部分成功' },
  { value: 'FAILED', label: '失败' },
  { value: 'RUNNING', label: '运行中' },
  { value: 'PENDING', label: '待执行' },
]

const TRIGGER_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'cron', label: '定时调度' },
  { value: 'manual', label: '手动触发' },
  { value: 'event', label: '事件触发' },
]

function statusType(s: string): 'success' | 'danger' | 'warning' | 'info' | '' {
  if (s === 'SUCCESS') return 'success'
  if (s === 'FAILED') return 'danger'
  if (s === 'PARTIAL_SUCCESS') return 'warning'
  if (s === 'RUNNING') return ''
  if (s === 'PENDING') return 'info'
  return 'info'
}

function statusLabel(s: string): string {
  if (s === 'SUCCESS') return '成功'
  if (s === 'FAILED') return '失败'
  if (s === 'PARTIAL_SUCCESS') return '部分成功'
  if (s === 'RUNNING') return '运行中'
  if (s === 'PENDING') return '待执行'
  return s
}

// Phase 2-3：PARTIAL 严重度展示
interface PartialSeverity {
  severity: 'NONE' | 'WARNING' | 'CRITICAL'
  label: string
  total: number
  total_failed: number
  total_not_found: number
}

function getPartialSeverity(row: PipelineExecutionItem): PartialSeverity | null {
  const ctx = (row as any).context_summary
  if (row.status !== 'PARTIAL_SUCCESS' || !ctx || !ctx.partial_severity) return null
  return ctx.partial_severity
}

function severityType(sev: string): 'success' | 'warning' | 'danger' {
  if (sev === 'CRITICAL') return 'danger'
  if (sev === 'WARNING') return 'warning'
  return 'success'
}

function severityLabel(sev: string): string {
  if (sev === 'CRITICAL') return '严重'
  if (sev === 'WARNING') return '警告'
  return '正常'
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

function triggerLabel(t: string): string {
  if (t === 'cron') return '定时调度'
  if (t === 'manual') return '手动触发'
  if (t === 'event') return '事件触发'
  return t
}

async function load() {
  loading.value = true
  try {
    const params: Record<string, any> = { limit: 100 }
    if (filterPipeline.value) params.pipeline_code = filterPipeline.value
    if (filterStatus.value) params.status = filterStatus.value
    if (filterTrigger.value) params.trigger_type = filterTrigger.value
    const res = await ucpApi.executions(params)
    total.value = res.total
    list.value = res.items
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载执行列表失败')
  } finally {
    loading.value = false
  }
}

function viewDetail(row: PipelineExecutionItem) {
  router.push({ name: 'UcpExecDetail', params: { id: row.pipeline_run_id } })
}

async function triggerOfferSync() {
  triggerDialogCode.value = 'offer_sync'
  triggerDialogVisible.value = true
}

async function onTriggerDialogSubmit(
  params: { dry_run: boolean; time_range: { start: string; end: string } | null; override_params: Record<string, any> | null },
  resolve: (result: any) => void,
  reject: (err: any) => void
) {
  try {
    const result = await ucpApi.runPipeline(triggerDialogCode.value, params)
    await load()
    resolve(result)
  } catch (e) {
    reject(e)
  }
}

async function seedOfferSync() {
  try {
    await ElMessageBox.confirm(
      '将初始化 Offer 同步 Pipeline 配置（创建凭据、连接器、Pipeline、调度任务），确认继续？此操作幂等，已有配置不会被覆盖。',
      '初始化 Offer 同步配置',
      { type: 'info', confirmButtonText: '确认初始化', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  loading.value = true
  try {
    const result = await ucpApi.seedOfferSync()
    ElMessage.success(`初始化完成：凭据 ${result.created.credentials} 个、连接器 ${result.created.connectors} 个、Pipeline ${result.created.pipelines} 个、调度 Job #${result.created.scheduler_job_id}`)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '初始化失败')
  } finally {
    loading.value = false
  }
}

watch([filterPipeline, filterStatus, filterTrigger], load)

onMounted(load)
</script>

<template>
  <div style="padding: 24px">
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span style="font-size: 16px; font-weight: 600">Pipeline 执行历史（共 {{ total }} 条）</span>
          <div style="display: flex; gap: 8px">
            <PermissionButton :menu="MENU_CODE" op="C" type="primary" @click="triggerOfferSync">
              <el-icon style="margin-right: 4px"><VideoPlay /></el-icon>手动触发同步
            </PermissionButton>
            <PermissionButton :menu="MENU_CODE" op="C" plain @click="seedOfferSync">
              <el-icon style="margin-right: 4px"><CaretRight /></el-icon>初始化配置
            </PermissionButton>
            <el-button @click="load">
              <el-icon style="margin-right: 4px"><Refresh /></el-icon>刷新
            </el-button>
          </div>
        </div>
      </template>

      <el-alert
        title="UCP Pipeline 执行记录 · 含定时调度、手动触发与事件触发"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
      >
        <p style="margin: 0; line-height: 1.6">
          Pipeline 按 CONNECTOR → CONNECTOR_LOOP → TRANSFORM → NOTIFY 步骤顺序执行。
          部分成功表示 Loop 步骤中部分条目失败；可点击详情查看失败项并重试。
        </p>
      </el-alert>

      <el-form inline style="margin-bottom: 16px">
        <el-form-item label="Pipeline">
          <el-select v-model="filterPipeline" placeholder="全部" clearable style="width: 180px">
            <el-option label="Offer 同步" value="offer_sync" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filterStatus" placeholder="全部" clearable style="width: 140px">
            <el-option v-for="s in STATUS_OPTIONS" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="触发方式">
          <el-select v-model="filterTrigger" placeholder="全部" clearable style="width: 140px">
            <el-option v-for="t in TRIGGER_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
      </el-form>

      <div style="overflow-x: auto">
        <el-table v-loading="loading" :data="list" stripe style="width: 100%" max-height="600">
          <el-table-column label="Pipeline" min-width="160">
            <template #default="{ row }">
              <strong>{{ row.pipeline_code }}</strong>
            </template>
          </el-table-column>
          <el-table-column label="Trace ID" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">
              <span style="font-size: 12px; color: var(--color-text-secondary)">{{ row.trace_id }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="160">
            <template #default="{ row }">
              <div style="display: flex; flex-direction: column; gap: 2px">
                <el-tag :type="statusType(row.status)" size="small">
                  {{ statusLabel(row.status) }}
                </el-tag>
                <el-tag
                  v-if="getPartialSeverity(row)"
                  :type="severityType(getPartialSeverity(row)!.severity)"
                  size="small"
                  effect="dark"
                  style="font-size: 11px"
                >
                  {{ severityLabel(getPartialSeverity(row)!.severity) }} ·
                  {{ getPartialSeverity(row)!.total_failed }}/{{ getPartialSeverity(row)!.total }}
                </el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="步骤" width="100">
            <template #default="{ row }">
              <span>{{ row.success_steps }}/{{ row.total_steps }}</span>
              <span v-if="row.failed_steps" style="color: var(--color-danger); margin-left: 4px">
                ({{ row.failed_steps }} 失败)
              </span>
            </template>
          </el-table-column>
          <el-table-column label="开始时间" min-width="180">
            <template #default="{ row }">
              {{ formatDateTime(row.started_at) }}
            </template>
          </el-table-column>
          <el-table-column label="耗时" width="100">
            <template #default="{ row }">
              {{ formatDuration(row.duration_ms) }}
            </template>
          </el-table-column>
          <el-table-column label="触发方式" width="120">
            <template #default="{ row }">
              <el-tag v-if="row.trigger_type === 'cron'" size="small" effect="plain">定时调度</el-tag>
              <el-tag v-else-if="row.trigger_type === 'manual'" size="small" type="info" effect="plain">手动触发</el-tag>
              <el-tag v-else size="small" type="warning" effect="plain">{{ triggerLabel(row.trigger_type) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <PermissionButton :menu="MENU_CODE" op="V" size="small" @click="viewDetail(row)">
                查看详情
              </PermissionButton>
              <PermissionButton
                v-if="row.status === 'PARTIAL_SUCCESS' || row.status === 'FAILED'"
                :menu="MENU_CODE" op="U" size="small" type="warning"
                @click="viewDetail(row)"
              >
                失败项
              </PermissionButton>
            </template>
          </el-table-column>
          <template #empty>
            <div style="padding: 32px 0; color: var(--color-text-placeholder); font-size: 13px">
              暂无执行记录，请先「初始化配置」再「手动触发同步」
            </div>
          </template>
        </el-table>
      </div>
    </el-card>

    <!-- Phase 2-4: 手动触发对话框 -->
    <ManualTriggerDialog
      v-model="triggerDialogVisible"
      :pipeline-code="triggerDialogCode"
      @submit="onTriggerDialogSubmit"
    />
  </div>
</template>
