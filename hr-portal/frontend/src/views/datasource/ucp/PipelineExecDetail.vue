<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, RefreshRight, Document, Tickets, View } from '@element-plus/icons-vue'
import { ucpApi, type PipelineExecutionDetail, type PipelineStepExecutionItem, type LoopFailedItem, type PartialSeverity, type StepPartialSeverity, type StepLoopItem, type ExecutionLogItem } from '@/api/ucp'
import { formatDateTime } from '@/utils/datetime'
import PermissionButton from '@/components/PermissionButton.vue'

const MENU_CODE = 'datasource.ucp_executions'

const route = useRoute()
const router = useRouter()
const runId = String(route.params.id)

const detail = ref<PipelineExecutionDetail | null>(null)
const failedItems = ref<LoopFailedItem[]>([])
const loadingDetail = ref(false)
const loadingFailed = ref(false)
const showFailedPanel = ref(false)

// Phase 2-6: 步骤详情抽屉
const stepDrawer = ref(false)
const activeStep = ref<PipelineStepExecutionItem | null>(null)
const stepItems = ref<StepLoopItem[]>([])
const loadingStepItems = ref(false)

// Phase 2-6: 执行日志
const logs = ref<ExecutionLogItem[]>([])
const loadingLogs = ref(false)
const showLogsPanel = ref(false)

// Phase 2-6: 视图模式切换：表格 / 时间线
const viewMode = ref<'table' | 'timeline'>('table')

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

function stepTypeLabel(t: string): string {
  if (t === 'CONNECTOR') return '连接器拉取'
  if (t === 'CONNECTOR_LOOP') return '逐条拉取'
  if (t === 'TRANSFORM') return '数据转换'
  if (t === 'NOTIFY') return '通知推送'
  return t
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

function stepStepType(s: string): 'success' | 'danger' | 'warning' | 'info' {
  if (s === 'SUCCESS') return 'success'
  if (s === 'FAILED') return 'danger'
  if (s === 'PARTIAL_SUCCESS') return 'warning'
  return 'info'
}

// Phase 2-3：PARTIAL 严重度辅助函数
function getPipelineSeverity(): PartialSeverity | null {
  if (!detail.value || detail.value.status !== 'PARTIAL_SUCCESS') return null
  const ctx = detail.value.context_summary
  if (!ctx || !ctx.partial_severity) return null
  return ctx.partial_severity as PartialSeverity
}

function getStepSeverity(step: PipelineStepExecutionItem): StepPartialSeverity | null {
  if (step.status !== 'PARTIAL_SUCCESS' || !step.output_snapshot) return null
  return (step.output_snapshot.partial_detail as StepPartialSeverity) || null
}

function severityTagType(sev: string): 'success' | 'warning' | 'danger' {
  if (sev === 'CRITICAL') return 'danger'
  if (sev === 'WARNING') return 'warning'
  return 'success'
}

function severityLabel(sev: string): string {
  if (sev === 'CRITICAL') return '严重失败'
  if (sev === 'WARNING') return '部分失败'
  return '正常'
}

// Phase 2-6: JSON 格式化展示
function prettyJson(obj: any): string {
  if (obj === null || obj === undefined) return '—'
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(obj)
  }
}

async function loadDetail() {
  loadingDetail.value = true
  try {
    const res = await ucpApi.executionDetail(runId)
    // Merge steps into the execution object for template convenience
    detail.value = { ...res.execution, steps: res.steps }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载执行详情失败')
  } finally {
    loadingDetail.value = false
  }
}

async function loadFailed() {
  if (!showFailedPanel.value) return
  loadingFailed.value = true
  try {
    const res = await ucpApi.failedItems(runId)
    failedItems.value = res.items
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载失败项失败')
  } finally {
    loadingFailed.value = false
  }
}

async function loadLogs() {
  if (!showLogsPanel.value) return
  loadingLogs.value = true
  try {
    const res = await ucpApi.executionLogs(runId, 200)
    logs.value = res.items
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载执行日志失败')
  } finally {
    loadingLogs.value = false
  }
}

async function retryFailed() {
  try {
    await ElMessageBox.confirm(
      `确认重试 ${failedItems.value.length} 条失败项？\n将按 step 分组重新调用连接器。`,
      '重试失败项',
      { type: 'warning', confirmButtonText: '确认重试', cancelButtonText: '取消' }
    )
  } catch { return }

  loadingFailed.value = true
  try {
    const result = await ucpApi.retryFailed(runId)
    const msg = result.message || `成功 ${result.success_count}/${result.total}`
    if (result.failed_count > 0) {
      ElMessage.warning(`${msg}，仍有 ${result.failed_count} 条失败`)
    } else {
      ElMessage.success(msg)
    }
    await loadDetail()
    if (showFailedPanel.value) await loadFailed()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail?.message || e?.response?.data?.detail || '重试失败')
  } finally {
    loadingFailed.value = false
  }
}

async function retryItem(item: LoopFailedItem) {
  ElMessage.info('单条重试：暂未支持，请使用"重试失败项"批量重试')
}

async function retryStep(step: PipelineStepExecutionItem) {
  try {
    await ElMessageBox.confirm(
      `确认重试步骤 "${step.step_id}"？\n这将重新执行该步骤（不影响其他步骤）。`,
      '重试步骤',
      { type: 'warning', confirmButtonText: '确认重试', cancelButtonText: '取消' }
    )
  } catch { return }

  try {
    const result = await ucpApi.retryStep(runId, step.step_run_id)
    if (result.step.status === 'SUCCESS') {
      ElMessage.success(`步骤重试成功（重试 ${result.step.retry_count} 次）`)
    } else if (result.step.status === 'PARTIAL_SUCCESS') {
      ElMessage.warning(`步骤部分成功（重试 ${result.step.retry_count} 次）`)
    } else {
      ElMessage.error(`步骤重试仍失败: ${result.step.error_message || '未知错误'}`)
    }
    await loadDetail()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail?.message || e?.response?.data?.detail || '步骤重试失败')
  }
}

function toggleFailedPanel() {
  showFailedPanel.value = !showFailedPanel.value
  if (showFailedPanel.value) loadFailed()
}

function toggleLogsPanel() {
  showLogsPanel.value = !showLogsPanel.value
  if (showLogsPanel.value) loadLogs()
}

// Phase 2-6: 打开步骤详情抽屉
async function openStepDetail(step: PipelineStepExecutionItem) {
  activeStep.value = step
  stepDrawer.value = true
  stepItems.value = []
  // CONNECTOR_LOOP 步骤才有循环项明细
  if (step.step_type === 'CONNECTOR_LOOP') {
    loadingStepItems.value = true
    try {
      const res = await ucpApi.stepItems(runId, step.step_run_id, { limit: 200 })
      stepItems.value = res.items
    } catch (e: any) {
      ElMessage.error(e?.response?.data?.detail || '加载步骤项明细失败')
    } finally {
      loadingStepItems.value = false
    }
  }
}

// 时间线节点颜色
function timelineColor(status: string): string {
  if (status === 'SUCCESS') return '#67c23a'
  if (status === 'FAILED') return '#f56c6c'
  if (status === 'PARTIAL_SUCCESS') return '#e6a23c'
  return '#909399'
}

const totalDuration = computed(() => detail.value?.duration_ms ?? 0)

onMounted(loadDetail)
</script>

<template>
  <div style="padding: 24px">
    <el-card v-loading="loadingDetail">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <div style="display: flex; align-items: center; gap: 12px">
            <el-button :icon="ArrowLeft" size="small" @click="router.push({ name: 'UcpExecList' })">返回列表</el-button>
            <span style="font-size: 16px; font-weight: 600">
              Pipeline 执行详情 #{{ runId }}
            </span>
          </div>
          <el-button @click="loadDetail" size="small">
            <el-icon style="margin-right: 4px"><RefreshRight /></el-icon>刷新
          </el-button>
        </div>
      </template>

      <template v-if="detail">
        <!-- 概览信息 -->
        <el-descriptions :column="4" border style="margin-bottom: 24px">
          <el-descriptions-item label="Pipeline">{{ detail.pipeline_code }}</el-descriptions-item>
          <el-descriptions-item label="Trace ID">{{ detail.trace_id }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <div style="display: flex; align-items: center; gap: 6px">
              <el-tag :type="statusType(detail.status)" size="small">{{ statusLabel(detail.status) }}</el-tag>
              <el-tag
                v-if="getPipelineSeverity()"
                :type="severityTagType(getPipelineSeverity()!.severity)"
                size="small"
                effect="dark"
              >
                {{ severityLabel(getPipelineSeverity()!.severity) }} · {{ getPipelineSeverity()!.label }}
              </el-tag>
            </div>
          </el-descriptions-item>
          <el-descriptions-item label="触发方式">{{ detail.trigger_type }}</el-descriptions-item>
          <el-descriptions-item label="开始时间">{{ formatDateTime(detail.started_at) }}</el-descriptions-item>
          <el-descriptions-item label="结束时间">{{ formatDateTime(detail.ended_at) }}</el-descriptions-item>
          <el-descriptions-item label="耗时">{{ formatDuration(detail.duration_ms) }}</el-descriptions-item>
          <el-descriptions-item label="步骤结果">
            {{ detail.success_steps }}/{{ detail.total_steps }} 成功
            <span v-if="detail.failed_steps" style="color: var(--color-danger)">（{{ detail.failed_steps }} 失败）</span>
          </el-descriptions-item>
        </el-descriptions>

        <!-- Phase 2-3：PARTIAL 严重度明细卡片 -->
        <el-alert
          v-if="getPipelineSeverity() && getPipelineSeverity()!.severity === 'CRITICAL'"
          title="严重部分失败：失败率超过 50%，建议立即检查"
          type="error"
          :closable="false"
          show-icon
          style="margin-bottom: 16px"
        >
          <template #default>
            <div style="line-height: 1.7">
              <div><strong>严重度</strong>: {{ getPipelineSeverity()!.label }}</div>
              <div><strong>失败数</strong>: {{ getPipelineSeverity()!.total_failed }} / {{ getPipelineSeverity()!.total }}</div>
              <div v-if="getPipelineSeverity()!.step_severities?.length">
                <strong>步骤分布</strong>:
                <span v-for="(s, i) in getPipelineSeverity()!.step_severities" :key="i" style="margin-right: 12px">
                  Step {{ i + 1 }}: {{ s.label }}
                </span>
              </div>
            </div>
          </template>
        </el-alert>
        <el-alert
          v-else-if="getPipelineSeverity()"
          :title="`部分成功（${getPipelineSeverity()!.label}）`"
          type="warning"
          :closable="false"
          show-icon
          style="margin-bottom: 16px"
        />

        <!-- 步骤执行明细 + 视图切换 -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px">
          <h3 style="margin: 0; font-size: 14px; font-weight: 600">步骤执行明细</h3>
          <el-radio-group v-model="viewMode" size="small">
            <el-radio-button label="table">表格</el-radio-button>
            <el-radio-button label="timeline">时间线</el-radio-button>
          </el-radio-group>
        </div>

        <!-- 表格视图 -->
        <div v-if="viewMode === 'table'" style="overflow-x: auto">
          <el-table :data="detail.steps" stripe style="width: 100%" max-height="400">
            <el-table-column label="步骤 ID" min-width="160" prop="step_id" />
            <el-table-column label="类型" width="120">
              <template #default="{ row }">
                <el-tag size="small" effect="plain">{{ stepTypeLabel(row.step_type) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="连接器" min-width="140" prop="connector_code" show-overflow-tooltip>
              <template #default="{ row }">{{ row.connector_code || '—' }}</template>
            </el-table-column>
            <el-table-column label="状态" width="170">
              <template #default="{ row }">
                <div style="display: flex; flex-direction: column; gap: 2px">
                  <el-tag :type="stepStepType(row.status)" size="small">{{ row.status }}</el-tag>
                  <el-tag
                    v-if="getStepSeverity(row)"
                    :type="severityTagType(getStepSeverity(row)!.severity)"
                    size="small" effect="dark" style="font-size: 11px"
                  >{{ getStepSeverity(row)!.label }}</el-tag>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="条目" width="110">
              <template #default="{ row }">
                <span v-if="row.total_items">{{ row.success_items }}/{{ row.total_items }}</span>
                <span v-else>—</span>
              </template>
            </el-table-column>
            <el-table-column label="耗时" width="90">
              <template #default="{ row }">{{ formatDuration(row.duration_ms) }}</template>
            </el-table-column>
            <el-table-column label="重试" width="70" prop="retry_count" />
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" size="small" link @click="openStepDetail(row)">
                  <el-icon style="margin-right: 2px"><View /></el-icon>详情
                </el-button>
                <PermissionButton
                  v-if="row.status === 'FAILED' || row.status === 'PARTIAL_SUCCESS'"
                  :menu="MENU_CODE" op="U" type="warning" size="small" link
                  @click="retryStep(row)"
                >
                  <el-icon style="margin-right: 2px"><RefreshRight /></el-icon>重跑
                </PermissionButton>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- 时间线视图 -->
        <div v-else style="padding: 8px 0">
          <el-timeline>
            <el-timeline-item
              v-for="step in detail.steps" :key="step.step_run_id"
              :timestamp="formatDateTime(step.started_at)"
              placement="top"
              :color="timelineColor(step.status)"
            >
              <el-card shadow="hover" style="cursor: pointer" @click="openStepDetail(step)">
                <div style="display: flex; justify-content: space-between; align-items: center">
                  <div>
                    <el-tag :type="stepStepType(step.status)" size="small">{{ step.status }}</el-tag>
                    <span style="margin-left: 8px; font-weight: 600">{{ step.step_id }}</span>
                    <el-tag size="small" effect="plain" style="margin-left: 8px">{{ stepTypeLabel(step.step_type) }}</el-tag>
                    <span v-if="step.connector_code" style="margin-left: 8px; color: var(--color-text-secondary)">{{ step.connector_code }}</span>
                  </div>
                  <div style="color: var(--color-text-secondary); font-size: 12px">
                    <span v-if="step.total_items">{{ step.success_items }}/{{ step.total_items }} 项 · </span>
                    <span>{{ formatDuration(step.duration_ms) }}</span>
                    <span v-if="step.retry_count > 0"> · 重试 {{ step.retry_count }} 次</span>
                  </div>
                </div>
                <div v-if="step.error_message" style="margin-top: 6px; color: var(--color-danger); font-size: 12px">
                  {{ step.error_message }}
                </div>
              </el-card>
            </el-timeline-item>
          </el-timeline>
        </div>

        <!-- 执行日志面板（Phase 2-6） -->
        <div style="margin-top: 24px">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px">
            <h3 style="margin: 0; font-size: 14px; font-weight: 600">
              <el-icon style="vertical-align: -2px"><Tickets /></el-icon> 连接器执行日志
            </h3>
            <el-button size="small" @click="toggleLogsPanel">
              {{ showLogsPanel ? '收起' : '展开' }}日志
            </el-button>
          </div>
          <div v-if="showLogsPanel" style="overflow-x: auto">
            <el-table v-loading="loadingLogs" :data="logs" stripe style="width: 100%" max-height="320">
              <el-table-column label="时间" width="170">
                <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
              </el-table-column>
              <el-table-column label="连接器" min-width="140" prop="connector_code" show-overflow-tooltip>
                <template #default="{ row }">{{ row.connector_code || row.executor }}</template>
              </el-table-column>
              <el-table-column label="触发" width="120" prop="trigger_type" />
              <el-table-column label="状态" width="100">
                <template #default="{ row }">
                  <el-tag :type="stepStepType(row.status)" size="small">{{ row.status }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="记录数" width="90">
                <template #default="{ row }">{{ row.record_count ?? '—' }}</template>
              </el-table-column>
              <el-table-column label="耗时" width="90">
                <template #default="{ row }">{{ formatDuration(row.duration_ms) }}</template>
              </el-table-column>
              <el-table-column label="错误信息" min-width="240" show-overflow-tooltip>
                <template #default="{ row }">
                  <span v-if="row.error_message" style="color: var(--color-danger)">{{ row.error_message }}</span>
                  <span v-else>—</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>

        <!-- 失败项面板（仅 PARTIAL_SUCCESS / FAILED 时显示） -->
        <div v-if="detail.status === 'PARTIAL_SUCCESS' || detail.status === 'FAILED'" style="margin-top: 24px">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px">
            <h3 style="margin: 0; font-size: 14px; font-weight: 600; color: var(--color-danger)">失败项明细</h3>
            <div style="display: flex; gap: 8px">
              <PermissionButton :menu="MENU_CODE" op="U" type="warning" size="small" @click="retryFailed">
                <el-icon style="margin-right: 4px"><RefreshRight /></el-icon>重试失败项
              </PermissionButton>
              <el-button size="small" @click="toggleFailedPanel">
                {{ showFailedPanel ? '收起' : '展开' }}失败项
              </el-button>
            </div>
          </div>

          <div v-if="showFailedPanel" style="overflow-x: auto">
            <el-table v-loading="loadingFailed" :data="failedItems" stripe style="width: 100%" max-height="300">
              <el-table-column label="Item Key" min-width="180" prop="item_key" show-overflow-tooltip />
              <el-table-column label="连接器" min-width="160" prop="connector_code" />
              <el-table-column label="状态" width="120" prop="status" />
              <el-table-column label="错误码" min-width="140" prop="error_code" show-overflow-tooltip />
              <el-table-column label="可重试" width="80">
                <template #default="{ row }">
                  <el-tag :type="row.is_retryable ? 'success' : 'danger'" size="small">
                    {{ row.is_retryable ? '是' : '否' }}
                  </el-tag>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </template>

      <div v-else style="padding: 48px 0; text-align: center; color: var(--color-text-placeholder)">
        加载中...
      </div>
    </el-card>

    <!-- Phase 2-6: 步骤详情抽屉 -->
    <el-drawer v-model="stepDrawer" :title="`步骤详情: ${activeStep?.step_id ?? ''}`" size="60%">
      <template v-if="activeStep">
        <el-descriptions :column="2" border style="margin-bottom: 16px">
          <el-descriptions-item label="步骤类型">{{ stepTypeLabel(activeStep.step_type) }}</el-descriptions-item>
          <el-descriptions-item label="连接器">{{ activeStep.connector_code || '—' }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="stepStepType(activeStep.status)" size="small">{{ activeStep.status }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="重试次数">{{ activeStep.retry_count }}</el-descriptions-item>
          <el-descriptions-item label="开始">{{ formatDateTime(activeStep.started_at) }}</el-descriptions-item>
          <el-descriptions-item label="结束">{{ formatDateTime(activeStep.ended_at) }}</el-descriptions-item>
          <el-descriptions-item label="耗时">{{ formatDuration(activeStep.duration_ms) }}</el-descriptions-item>
          <el-descriptions-item label="条目">
            <span v-if="activeStep.total_items">{{ activeStep.success_items }}/{{ activeStep.total_items }}</span>
            <span v-else>—</span>
          </el-descriptions-item>
        </el-descriptions>

        <!-- 错误堆栈 -->
        <el-alert
          v-if="activeStep.error_message"
          title="步骤错误信息"
          type="error"
          :closable="false"
          show-icon
          style="margin-bottom: 16px"
        >
          <pre style="white-space: pre-wrap; word-break: break-all; margin: 0; font-size: 12px">{{ activeStep.error_message }}</pre>
        </el-alert>

        <!-- 输入快照（数据血缘） -->
        <el-collapse style="margin-bottom: 16px">
          <el-collapse-item title="输入定义（数据血缘）" name="input">
            <pre style="background: var(--color-fill-light); padding: 12px; border-radius: 4px; font-size: 12px; max-height: 300px; overflow: auto; margin: 0">{{ prettyJson(activeStep.input_snapshot) }}</pre>
          </el-collapse-item>
          <el-collapse-item title="输出快照（脱敏样本）" name="output">
            <pre style="background: var(--color-fill-light); padding: 12px; border-radius: 4px; font-size: 12px; max-height: 400px; overflow: auto; margin: 0">{{ prettyJson(activeStep.output_snapshot) }}</pre>
          </el-collapse-item>
        </el-collapse>

        <!-- 循环项明细（仅 CONNECTOR_LOOP） -->
        <div v-if="activeStep.step_type === 'CONNECTOR_LOOP'">
          <h4 style="margin: 16px 0 8px; font-size: 13px; font-weight: 600">
            <el-icon style="vertical-align: -2px"><Document /></el-icon> 循环项明细
          </h4>
          <el-table v-loading="loadingStepItems" :data="stepItems" stripe style="width: 100%" max-height="400">
            <el-table-column label="Item Key" min-width="160" prop="item_key" show-overflow-tooltip />
            <el-table-column label="状态" width="120">
              <template #default="{ row }">
                <el-tag :type="stepStepType(row.status)" size="small">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="错误码" min-width="140" prop="error_code" show-overflow-tooltip />
            <el-table-column label="重试" width="70" prop="retry_count" />
            <el-table-column label="可重试" width="80">
              <template #default="{ row }">
                <el-tag :type="row.is_retryable ? 'success' : 'danger'" size="small">
                  {{ row.is_retryable ? '是' : '否' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </template>
    </el-drawer>
  </div>
</template>
