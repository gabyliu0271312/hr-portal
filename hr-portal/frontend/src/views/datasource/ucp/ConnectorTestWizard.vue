<template>
  <el-dialog
    v-model="visible"
    title="连接器测试向导"
    width="920"
    :close-on-click-modal="false"
    @close="handleClose"
  >
    <div v-if="connector" class="connector-info">
      <el-descriptions :column="3" border size="small">
        <el-descriptions-item label="连接器">{{ connector.system_name }}</el-descriptions-item>
        <el-descriptions-item label="编码">{{ connector.system_code }}</el-descriptions-item>
        <el-descriptions-item label="方向">
          <el-tag :type="connector.direction === 'INBOUND' ? 'success' : 'warning'" size="small">
            {{ connector.direction }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="适配器">
          <code>{{ connector.adapter_code || '未配置' }}</code>
        </el-descriptions-item>
        <el-descriptions-item label="凭证">
          <el-tag :type="connector.credential_id ? 'success' : 'info'" size="small">
            {{ connector.credential_id ? `ID=${connector.credential_id}` : '未配置' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="测试状态">
          <el-tag :type="connector.test_status === 'PASSED' ? 'success' : connector.test_status === 'FAILED' ? 'danger' : 'warning'" size="small">
            {{ connector.test_status }}
          </el-tag>
        </el-descriptions-item>
      </el-descriptions>
    </div>

    <el-divider />

    <div class="test-wizard">
      <el-row :gutter="16">
        <el-col v-for="(testType, idx) in testTypeList" :key="testType" :span="6">
          <el-card
            class="test-step-card"
            :class="stepClasses(testType)"
            shadow="hover"
            @click="runSingleTest(testType)"
          >
            <div class="step-header">
              <el-icon class="step-icon" :class="stepIconClass(testType)">
                <component :is="stepIcon(testType)" />
              </el-icon>
              <span class="step-num">{{ idx + 1 }}</span>
            </div>
            <div class="step-title">{{ TEST_TYPE_LABELS[testType] }}</div>
            <div class="step-status">
              <el-tag
                v-if="latestLogs[testType]"
                :type="statusTagType(latestLogs[testType].status)"
                size="small"
              >
                {{ statusLabel(latestLogs[testType].status) }} · {{ latestLogs[testType].duration_ms }}ms
              </el-tag>
              <el-tag v-else type="info" size="small">未运行</el-tag>
            </div>
            <div v-if="loading[testType]" class="step-loading">
              <el-icon class="is-loading"><Loading /></el-icon>
              <span>执行中...</span>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <el-divider>操作</el-divider>

    <div class="action-bar">
      <el-button
        type="primary"
        :loading="runningAll"
        :icon="VideoPlay"
        @click="runAll"
      >
        一键运行全部 4 项测试
      </el-button>
      <el-button
        type="success"
        :disabled="!hasAnyPassed"
        :icon="Check"
        @click="enableConnector"
      >
        测试通过后启用连接器
      </el-button>
      <el-button :icon="Refresh" @click="loadLatestTests">刷新最新结果</el-button>
    </div>

    <el-divider>测试历史（最近 {{ history.length }} 条）</el-divider>

    <el-table :data="history" v-loading="loadingHistory" stripe size="small" max-height="280">
      <el-table-column prop="test_type_label" label="测试类型" width="140" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="duration_ms" label="耗时" width="100">
        <template #default="{ row }">{{ row.duration_ms }}ms</template>
      </el-table-column>
      <el-table-column prop="error_code" label="错误码" width="140">
        <template #default="{ row }">
          <code v-if="row.error_code">{{ row.error_code }}</code>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="error_message" label="错误信息" min-width="180" show-overflow-tooltip />
      <el-table-column prop="tested_by" label="测试人" width="100" />
      <el-table-column label="时间" width="180">
        <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column v-if="hasPushSimulation" label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="row.test_type === TEST_TYPES.PUSH_SIMULATION && row.response_sample"
            link
            type="primary"
            size="small"
            @click="openPushSimulationDetail(row)"
          >
            查看模拟详情
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Phase 2-8：推送模拟详情对话框 -->
    <el-dialog
      v-model="pushSimDialogVisible"
      title="推送模拟详情"
      width="820"
      :close-on-click-modal="false"
      append-to-body
    >
      <div v-if="pushSimDetail" class="push-sim-detail">
        <el-alert
          :type="pushSimDetail.status === 'PASSED' ? 'success' : pushSimDetail.status === 'WARNING' ? 'warning' : 'error'"
          :title="`${statusLabel(pushSimDetail.status)} · 模拟耗时 ${pushSimDetail.duration_ms}ms`"
          :closable="false"
          show-icon
        />
        <div v-if="pushSimDetail.error_code" class="err-block">
          <el-text type="danger">错误码: {{ pushSimDetail.error_code }}</el-text>
          <el-text v-if="pushSimDetail.error_message" type="danger"> · {{ pushSimDetail.error_message }}</el-text>
        </div>

        <el-divider content-position="left">请求参数（已脱敏）</el-divider>
        <pre class="json-block">{{ prettyJson(pushSimDetail.request_params_masked) }}</pre>

        <el-divider content-position="left">Payload 摘要</el-divider>
        <div v-if="payloadSummary" class="payload-summary">
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="模拟模式">
              <el-tag :type="payloadSummary.simulation ? 'info' : 'warning'" size="small">
                {{ payloadSummary.simulation ? 'simulation=True（不真落地）' : '真实推送' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="预计推送">
              <el-tag :type="payloadSummary.would_push ? 'success' : 'info'" size="small">
                {{ payloadSummary.would_push ? '是' : '否' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="模拟状态">
              <code>{{ payloadSummary.simulated_status || '-' }}</code>
            </el-descriptions-item>
            <el-descriptions-item label="模拟行数">
              <el-tag :type="(payloadSummary.simulated_rows || 0) > 0 ? 'success' : 'warning'" size="small">
                {{ payloadSummary.simulated_rows || 0 }} 行
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item v-if="payloadSummary.payload_fields?.length" label="Payload 字段" :span="2">
              <el-tag
                v-for="f in payloadSummary.payload_fields"
                :key="f"
                size="small"
                type="info"
                effect="plain"
                class="field-tag"
              >
                {{ f }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item v-if="payloadSummary.target_system" label="目标系统" :span="2">
              <el-descriptions :column="2" border size="small" direction="vertical">
                <el-descriptions-item v-if="payloadSummary.target_system.id" label="ID">{{ payloadSummary.target_system.id }}</el-descriptions-item>
                <el-descriptions-item v-if="payloadSummary.target_system.name" label="名称">{{ payloadSummary.target_system.name }}</el-descriptions-item>
                <el-descriptions-item v-if="payloadSummary.target_system.push_type" label="推送类型">
                  <el-tag size="small">{{ payloadSummary.target_system.push_type }}</el-tag>
                </el-descriptions-item>
                <el-descriptions-item v-if="payloadSummary.target_system.source_table" label="源表">
                  <code>{{ payloadSummary.target_system.source_table }}</code>
                </el-descriptions-item>
                <el-descriptions-item v-if="payloadSummary.target_system.url" label="URL" :span="2">
                  <code>{{ payloadSummary.target_system.url }}</code>
                </el-descriptions-item>
                <el-descriptions-item v-if="payloadSummary.target_system.method" label="HTTP 方法">
                  <el-tag size="small">{{ payloadSummary.target_system.method }}</el-tag>
                </el-descriptions-item>
              </el-descriptions>
            </el-descriptions-item>
            <el-descriptions-item v-if="payloadSummary.protocol_template" label="协议模板" :span="2">
              <pre class="json-block">{{ prettyJson(payloadSummary.protocol_template) }}</pre>
            </el-descriptions-item>
            <el-descriptions-item v-if="payloadSummary.field_mapping" label="字段映射" :span="2">
              <pre class="json-block">{{ prettyJson(payloadSummary.field_mapping) }}</pre>
            </el-descriptions-item>
            <el-descriptions-item v-if="payloadSummary.note" label="备注" :span="2">
              <el-text size="small">{{ payloadSummary.note }}</el-text>
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <template v-if="hasPayloadSample">
          <el-divider content-position="left">Payload 样本（脱敏后前 {{ payloadSample.length }} 行）</el-divider>
          <el-table :data="payloadSample" stripe size="small" max-height="240" border>
            <el-table-column
              v-for="key in payloadSampleKeys"
              :key="key"
              :prop="key"
              :label="key"
              min-width="120"
              show-overflow-tooltip
            />
          </el-table>
        </template>

        <el-divider content-position="left">完整 response_sample</el-divider>
        <pre class="json-block">{{ prettyJson(pushSimDetail.response_sample) }}</pre>
      </div>

      <template #footer>
        <el-button @click="pushSimDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <template #footer>
      <el-button @click="handleClose">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  VideoPlay,
  Check,
  Refresh,
  Loading,
  Key,
  Connection,
  View,
  Promotion,
} from '@element-plus/icons-vue'
import { ucpApi, TEST_TYPES, TEST_TYPE_LABELS, type TestLogItem, type ConnectorConfigDetail } from '@/api/ucp'

const props = defineProps<{
  modelValue: boolean
  connector: ConnectorConfigDetail | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'enabled'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const testTypeList = [TEST_TYPES.AUTH, TEST_TYPES.CONNECTIVITY, TEST_TYPES.PREVIEW, TEST_TYPES.PUSH_SIMULATION]

const latestLogs = ref<Record<string, TestLogItem | null>>({})
const history = ref<TestLogItem[]>([])
const loadingHistory = ref(false)
const runningAll = ref(false)
const loading = ref<Record<string, boolean>>({})

// Phase 2-8：推送模拟详情
const pushSimDialogVisible = ref(false)
const pushSimDetail = ref<TestLogItem | null>(null)

const hasPushSimulation = computed(() => true)

const payloadSummary = computed(() => {
  const sample = pushSimDetail.value?.response_sample
  if (!sample || typeof sample !== 'object') return null
  return sample as Record<string, any>
})

const payloadSample = computed(() => {
  const sample = pushSimDetail.value?.response_sample
  if (!sample || typeof sample !== 'object') return []
  const arr = (sample as any).sample
  return Array.isArray(arr) ? arr : []
})

const hasPayloadSample = computed(() => payloadSample.value.length > 0)

const payloadSampleKeys = computed(() => {
  if (!hasPayloadSample.value) return [] as string[]
  const first = payloadSample.value[0] as Record<string, any>
  return Object.keys(first)
})

function openPushSimulationDetail(row: TestLogItem) {
  pushSimDetail.value = row
  pushSimDialogVisible.value = true
}

function prettyJson(obj: unknown): string {
  if (obj === null || obj === undefined) return 'null'
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(obj)
  }
}

const hasAnyPassed = computed(() =>
  Object.values(latestLogs.value).some((l) => l?.status === 'PASSED'),
)

function stepIcon(testType: string) {
  return {
    [TEST_TYPES.AUTH]: Key,
    [TEST_TYPES.CONNECTIVITY]: Connection,
    [TEST_TYPES.PREVIEW]: View,
    [TEST_TYPES.PUSH_SIMULATION]: Promotion,
  }[testType] || Key
}

function stepClasses(testType: string) {
  const log = latestLogs.value[testType]
  if (!log) return 'step-pending'
  if (log.status === 'PASSED') return 'step-passed'
  if (log.status === 'FAILED') return 'step-failed'
  return 'step-warning'
}

function stepIconClass(testType: string) {
  const log = latestLogs.value[testType]
  if (!log) return ''
  if (log.status === 'PASSED') return 'icon-passed'
  if (log.status === 'FAILED') return 'icon-failed'
  return 'icon-warning'
}

function statusTagType(s: string): 'success' | 'danger' | 'warning' | 'info' {
  if (s === 'PASSED') return 'success'
  if (s === 'FAILED') return 'danger'
  if (s === 'WARNING') return 'warning'
  return 'info'
}

function statusLabel(s: string) {
  return { PASSED: '通过', FAILED: '失败', WARNING: '警告' }[s] || s
}

function formatTime(iso: string | null) {
  if (!iso) return '-'
  return iso.replace('T', ' ').slice(0, 19)
}

async function loadLatestTests() {
  if (!props.connector) return
  loadingHistory.value = true
  try {
    const res = await ucpApi.connectorLatestTests(props.connector.system_code)
    const map: Record<string, TestLogItem | null> = {}
    for (const t of testTypeList) {
      map[t] = res.tests[t]?.log || null
    }
    latestLogs.value = map

    const histRes = await ucpApi.connectorTestHistory(props.connector.system_code, { limit: 20 })
    history.value = histRes.items
  } catch (e: any) {
    ElMessage.error(`加载测试结果失败: ${e?.message || e}`)
  } finally {
    loadingHistory.value = false
  }
}

async function runSingleTest(testType: string) {
  if (!props.connector) return
  loading.value[testType] = true
  try {
    const result = await ucpApi.runConnectorTest(props.connector.system_code, testType)
    ElMessage[result.status === 'PASSED' ? 'success' : 'warning'](
      `[${TEST_TYPE_LABELS[testType as keyof typeof TEST_TYPE_LABELS]}] ${statusLabel(result.status)}${
        result.error_message ? `: ${result.error_message}` : ''
      }`,
    )
    await loadLatestTests()
  } catch (e: any) {
    ElMessage.error(`测试失败: ${e?.response?.data?.detail || e?.message || e}`)
  } finally {
    loading.value[testType] = false
  }
}

async function runAll() {
  if (!props.connector) return
  runningAll.value = true
  try {
    const res = await ucpApi.runAllConnectorTests(props.connector.system_code)
    const passed = res.items.filter((i) => i.status === 'PASSED').length
    const failed = res.items.filter((i) => i.status === 'FAILED').length
    const warning = res.items.filter((i) => i.status === 'WARNING').length
    ElMessage.success(`4 类测试完成：通过 ${passed} / 警告 ${warning} / 失败 ${failed}`)
    await loadLatestTests()
  } catch (e: any) {
    ElMessage.error(`批量测试失败: ${e?.response?.data?.detail || e?.message || e}`)
  } finally {
    runningAll.value = false
  }
}

async function enableConnector() {
  if (!props.connector) return
  try {
    await ElMessageBox.confirm(
      `确认启用连接器「${props.connector.system_name}」？启用后将可被流水线调用。`,
      '启用确认',
      { type: 'warning' },
    )
    const res = await ucpApi.enableConnectorAfterTest(props.connector.system_code)
    ElMessage.success(res.message)
    emit('enabled')
    handleClose()
  } catch (e: any) {
    if (e === 'cancel') return
    ElMessage.error(`启用失败: ${e?.response?.data?.detail || e?.message || e}`)
  }
}

function handleClose() {
  visible.value = false
}

watch(visible, (v) => {
  if (v && props.connector) {
    loadLatestTests()
  }
})
</script>

<style scoped>
.connector-info {
  margin-bottom: 8px;
}
.test-wizard {
  margin: 8px 0;
}
.test-step-card {
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}
.test-step-card:hover {
  transform: translateY(-2px);
}
.test-step-card.step-passed {
  border-color: #67c23a;
  background: #f0f9eb;
}
.test-step-card.step-failed {
  border-color: #f56c6c;
  background: #fef0f0;
}
.test-step-card.step-warning {
  border-color: #e6a23c;
  background: #fdf6ec;
}
.step-header {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 8px;
  position: relative;
}
.step-icon {
  font-size: 32px;
  color: #909399;
}
.step-icon.icon-passed { color: #67c23a; }
.step-icon.icon-failed { color: #f56c6c; }
.step-icon.icon-warning { color: #e6a23c; }
.step-num {
  position: absolute;
  top: 0;
  right: 8px;
  background: #909399;
  color: white;
  border-radius: 50%;
  width: 22px;
  height: 22px;
  line-height: 22px;
  font-size: 12px;
}
.step-title {
  font-weight: 600;
  margin-bottom: 8px;
  color: #303133;
}
.step-status {
  font-size: 12px;
}
.step-loading {
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: #409eff;
  font-size: 12px;
}
.action-bar {
  display: flex;
  gap: 12px;
  margin: 8px 0;
}

.push-sim-detail {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.payload-summary {
  margin-top: 4px;
}
.json-block {
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  padding: 8px 12px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.5;
  max-height: 280px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}
.field-tag {
  margin-right: 6px;
  margin-bottom: 4px;
}
.err-block {
  margin-top: 8px;
  font-size: 13px;
}
</style>
