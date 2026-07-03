<template>
  <div class="circuit-breaker-page">
    <div class="page-header">
      <h2>熔断与限流状态</h2>
      <p class="desc">查看/管理 UCP 连接器级熔断与限流配置；连接器连续失败达到阈值时自动熔断，避免雪崩；可手动重置。</p>
    </div>

    <el-tabs v-model="activeTab" type="border-card">
      <!-- ===== 熔断器状态 ===== -->
      <el-tab-pane label="熔断器状态" name="circuits">
        <div class="tab-actions">
          <el-button :icon="Refresh" @click="loadCircuits">刷新</el-button>
          <el-text type="info" size="small">
            共 {{ circuits.length }} 个熔断器（{{ openCount }} 个 OPEN / {{ halfOpenCount }} 个 HALF_OPEN）
          </el-text>
        </div>

        <el-table :data="circuits" v-loading="loadingCircuits" stripe size="small" empty-text="暂无熔断器记录">
          <el-table-column prop="connector_code" label="连接器编码" min-width="180" />
          <el-table-column label="熔断状态" width="140">
            <template #default="{ row }">
              <el-tag :type="circuitStateTagType(row.state)" size="small">
                {{ circuitStateLabel(row.state) }}
              </el-tag>
              <el-tag v-if="row.state === 'OPEN' && row.open_remaining_seconds > 0" type="info" size="small" effect="plain" class="ml-8">
                剩余 {{ row.open_remaining_seconds }}s
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="consecutive_failures" label="连续失败" width="100" align="center" />
          <el-table-column prop="consecutive_successes" label="连续成功" width="100" align="center" />
          <el-table-column prop="half_open_calls" label="试探调用" width="100" align="center" />
          <el-table-column prop="last_error_code" label="最近错误码" width="160">
            <template #default="{ row }">
              <code v-if="row.last_error_code">{{ row.last_error_code }}</code>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="last_error_message" label="最近错误信息" min-width="200" show-overflow-tooltip />
          <el-table-column label="操作" width="220" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openConfigDialog(row)">配置</el-button>
              <el-button link type="warning" size="small" :disabled="row.state === 'CLOSED'" @click="handleReset(row)">
                重置
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-alert
          v-if="circuits.length === 0 && !loadingCircuits"
          type="info"
          :closable="false"
          title="暂无熔断记录"
          description="连接器在执行过程中产生失败/成功计数后会自动出现在此列表。当连续失败达到配置的阈值时会自动进入 OPEN 状态。"
        />
      </el-tab-pane>

      <!-- ===== 限流桶状态 ===== -->
      <el-tab-pane label="限流桶状态" name="rate-limits">
        <div class="tab-actions">
          <el-button :icon="Refresh" @click="loadRateLimits">刷新</el-button>
          <el-text type="info" size="small">滑动窗口 1s 内的调用次数</el-text>
        </div>

        <el-table :data="rateLimits" v-loading="loadingRateLimits" stripe size="small" empty-text="无限流活动">
          <el-table-column prop="key" label="限流 Key" min-width="200" />
          <el-table-column label="近 1s 调用" width="120" align="center">
            <template #default="{ row }">
              <el-tag :type="row.calls_in_last_second > 5 ? 'warning' : 'success'" size="small">
                {{ row.calls_in_last_second }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="最近获取时间" width="180">
            <template #default="{ row }">
              <span v-if="row.last_acquire > 0">{{ formatTime(row.last_acquire) }}</span>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button link type="warning" size="small" @click="handleResetBucket(row)">重置</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- ===== 熔断配置编辑对话框 ===== -->
    <el-dialog
      v-model="configDialogVisible"
      :title="`熔断配置 - ${currentCircuit?.connector_code || ''}`"
      width="640"
      :close-on-click-modal="false"
    >
      <el-form :model="configForm" label-width="140px" size="default" v-if="currentCircuit">
        <el-form-item label="启用熔断">
          <el-switch v-model="configForm.enabled" />
          <el-text size="small" type="info" class="ml-8">开启后连接器连续失败达到阈值将自动熔断</el-text>
        </el-form-item>
        <el-form-item label="失败阈值">
          <el-input-number v-model="configForm.failure_threshold" :min="1" :max="100" />
          <el-text size="small" type="info" class="ml-8">连续失败 N 次触发熔断</el-text>
        </el-form-item>
        <el-form-item label="熔断持续时间">
          <el-input-number v-model="configForm.open_duration_seconds" :min="10" :max="86400" :step="30" />
          <span class="unit">秒</span>
        </el-form-item>
        <el-form-item label="半开试探上限">
          <el-input-number v-model="configForm.half_open_max_calls" :min="1" :max="10" />
          <el-text size="small" type="info" class="ml-8">半开状态允许的试探调用数</el-text>
        </el-form-item>
        <el-form-item label="恢复成功阈值">
          <el-input-number v-model="configForm.success_threshold" :min="1" :max="20" />
          <el-text size="small" type="info" class="ml-8">半开状态连续成功 N 次后真正关闭</el-text>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="configDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingConfig" @click="handleSaveConfig">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { ucpApi } from '@/api/ucp'

const activeTab = ref('circuits')
const circuits = ref<Array<any>>([])
const rateLimits = ref<Array<any>>([])
const loadingCircuits = ref(false)
const loadingRateLimits = ref(false)
const savingConfig = ref(false)

const configDialogVisible = ref(false)
const currentCircuit = ref<any>(null)
const configForm = ref({
  enabled: false,
  failure_threshold: 5,
  open_duration_seconds: 300,
  half_open_max_calls: 1,
  success_threshold: 3,
})

const openCount = computed(() => circuits.value.filter((c) => c.state === 'OPEN').length)
const halfOpenCount = computed(() => circuits.value.filter((c) => c.state === 'HALF_OPEN').length)

function circuitStateLabel(s: string) {
  return { CLOSED: '关闭', OPEN: '打开', HALF_OPEN: '半开' }[s] || s
}
function circuitStateTagType(s: string): 'success' | 'danger' | 'warning' | 'info' {
  if (s === 'CLOSED') return 'success'
  if (s === 'OPEN') return 'danger'
  if (s === 'HALF_OPEN') return 'warning'
  return 'info'
}
function formatTime(epoch: number) {
  if (!epoch) return '-'
  // 简单本地时间
  return new Date(epoch * 1000).toLocaleTimeString('zh-CN')
}

async function loadCircuits() {
  loadingCircuits.value = true
  try {
    const res = await ucpApi.listCircuits()
    circuits.value = res.circuits || []
  } catch (e: any) {
    ElMessage.error(`加载熔断器列表失败: ${e?.response?.data?.detail || e?.message || e}`)
  } finally {
    loadingCircuits.value = false
  }
}

async function loadRateLimits() {
  loadingRateLimits.value = true
  try {
    const res = await ucpApi.listRateLimits()
    rateLimits.value = res.buckets || []
  } catch (e: any) {
    ElMessage.error(`加载限流桶列表失败: ${e?.response?.data?.detail || e?.message || e}`)
  } finally {
    loadingRateLimits.value = false
  }
}

async function openConfigDialog(row: any) {
  currentCircuit.value = row
  // 拉取最新配置
  try {
    const res = await ucpApi.getCircuit(row.connector_code)
    const cfg = res.config || {}
    configForm.value = {
      enabled: !!cfg.enabled,
      failure_threshold: cfg.failure_threshold || 5,
      open_duration_seconds: cfg.open_duration_seconds || 300,
      half_open_max_calls: cfg.half_open_max_calls || 1,
      success_threshold: cfg.success_threshold || 3,
    }
    configDialogVisible.value = true
  } catch (e: any) {
    ElMessage.error(`加载配置失败: ${e?.response?.data?.detail || e?.message || e}`)
  }
}

async function handleSaveConfig() {
  if (!currentCircuit.value) return
  savingConfig.value = true
  try {
    await ucpApi.updateCircuitConfig(currentCircuit.value.connector_code, configForm.value)
    ElMessage.success('保存成功')
    configDialogVisible.value = false
    await loadCircuits()
  } catch (e: any) {
    ElMessage.error(`保存失败: ${e?.response?.data?.detail || e?.message || e}`)
  } finally {
    savingConfig.value = false
  }
}

async function handleReset(row: any) {
  try {
    await ElMessageBox.confirm(
      `确认重置连接器「${row.connector_code}」的熔断器？`,
      '重置确认',
      { type: 'warning' },
    )
    await ucpApi.resetCircuit(row.connector_code)
    ElMessage.success('已重置')
    await loadCircuits()
  } catch (e: any) {
    if (e === 'cancel') return
    ElMessage.error(`重置失败: ${e?.response?.data?.detail || e?.message || e}`)
  }
}

async function handleResetBucket(row: any) {
  try {
    await ElMessageBox.confirm(
      `确认重置限流桶「${row.key}」？`,
      '重置确认',
      { type: 'warning' },
    )
    await ucpApi.resetRateLimit(row.key)
    ElMessage.success('已重置')
    await loadRateLimits()
  } catch (e: any) {
    if (e === 'cancel') return
    ElMessage.error(`重置失败: ${e?.response?.data?.detail || e?.message || e}`)
  }
}

onMounted(() => {
  loadCircuits()
})
</script>

<style scoped>
.circuit-breaker-page {
  padding: 16px;
}
.page-header {
  margin-bottom: 16px;
}
.page-header h2 {
  margin: 0 0 4px 0;
  font-size: 20px;
  font-weight: 600;
}
.desc {
  margin: 0;
  color: #909399;
  font-size: 13px;
}
.tab-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.ml-8 {
  margin-left: 8px;
}
.unit {
  margin-left: 8px;
  color: #909399;
  font-size: 13px;
}
</style>
