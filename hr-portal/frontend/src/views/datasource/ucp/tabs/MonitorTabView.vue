<template>
  <div class="monitor-tab">
    <!-- 顶部 KPI 卡片 (蓝本 v2 场景 14) -->
    <div class="kpi-row">
      <div class="kpi-card kpi-success">
        <div class="kpi-label">近 24h 成功率</div>
        <div class="kpi-value">{{ kpi.successRate }}<span class="pct">%</span></div>
        <div class="kpi-sub">{{ kpi.pipelineTotal }} 次执行</div>
      </div>
      <div class="kpi-card kpi-fail" :class="{ 'kpi-warn': kpi.failRate > 5 }">
        <div class="kpi-label">失败率</div>
        <div class="kpi-value">{{ kpi.failRate }}<span class="pct">%</span></div>
        <div class="kpi-sub">失败 {{ kpi.pipelineFailed }} / 部分成功 {{ kpi.pipelinePartial }}</div>
      </div>
      <div class="kpi-card kpi-running">
        <div class="kpi-label">运行中</div>
        <div class="kpi-value">{{ kpi.pipelineRunning }}</div>
        <div class="kpi-sub">实时</div>
      </div>
      <div class="kpi-card kpi-alert" :class="{ 'kpi-warn': kpi.alertCount > 0 }">
        <div class="kpi-label">活跃告警</div>
        <div class="kpi-value">{{ kpi.alertCount }}</div>
        <div class="kpi-sub">死信 / 超时 / 高失败率</div>
      </div>
    </div>

    <!-- Phase 5-3: 资源维度过滤栏 -->
    <div class="filter-row">
      <el-select
        v-model="filterSystemId"
        placeholder="按业务系统过滤"
        clearable
        filterable
        style="width: 240px"
        @change="onSystemFilterChange"
      >
        <el-option
          v-for="s in systems"
          :key="s.id"
          :label="`${s.system_name} (${s.system_code})`"
          :value="s.id"
        />
      </el-select>
      <el-select
        v-model="filterResourceId"
        placeholder="按数据资源过滤"
        clearable
        filterable
        :disabled="!filterSystemId"
        style="width: 280px"
      >
        <el-option
          v-for="r in resourcesOf(filterSystemId)"
          :key="r.id"
          :label="`${r.resource_name} (${r.resource_code})`"
          :value="r.id"
        />
      </el-select>
      <el-button @click="clearFilter" v-if="filterSystemId || filterResourceId">
        清除过滤
      </el-button>
      <span class="filter-hint" v-if="filterSystemId || filterResourceId">
        已过滤:
        <template v-if="filterResourceId">资源 #{{ filterResourceId }}</template>
        <template v-else-if="filterSystemId">系统 #{{ filterSystemId }}</template>
      </span>
    </div>

    <div class="sub-tabs">
      <el-tabs v-model="subTab">
        <el-tab-pane label="运行监控" name="monitor" />
        <el-tab-pane label="执行历史" name="executions" />
        <el-tab-pane label="外部账号" name="external" />
        <el-tab-pane label="审批工作台" name="approvals" />
        <el-tab-pane label="OA 同步" name="oa" />
        <el-tab-pane label="熔断限流" name="circuits" />
      </el-tabs>
    </div>

    <div class="sub-content">
      <MonitorDashboardView
        v-if="subTab === 'monitor'"
        :system-code="currentSystemCode"
        :system-id="filterSystemId"
        :resource-id="filterResourceId"
      />
      <PipelineExecList v-else-if="subTab === 'executions'" />
      <ExternalAccountListView v-else-if="subTab === 'external'" />
      <ApprovalInboxView v-else-if="subTab === 'approvals'" />
      <OaSyncView v-else-if="subTab === 'oa'" />
      <CircuitBreakerStatus v-else-if="subTab === 'circuits'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import MonitorDashboardView from '../MonitorDashboardView.vue'
import PipelineExecList from '../PipelineExecList.vue'
import ExternalAccountListView from '../ExternalAccountListView.vue'
import ApprovalInboxView from '../ApprovalInboxView.vue'
import OaSyncView from '../OaSyncView.vue'
import CircuitBreakerStatus from '../CircuitBreakerStatus.vue'
import { monitorApi, ucpApi } from '@/api/ucp'

defineProps<{
  currentSystemCode: string
}>()

const subTab = ref('monitor')

/* ── 顶部 KPI 统计 ── */
const kpi = ref({
  pipelineTotal: 0,
  pipelineSuccess: 0,
  pipelineFailed: 0,
  pipelinePartial: 0,
  pipelineRunning: 0,
  failRate: 0,
  successRate: 0,
  avgDurationMs: 0,
  alertCount: 0,
})

/* ── Phase 5-3: system / resource 过滤 ── */
const systems = ref<Array<{ id: number; system_code: string; system_name: string }>>([])
const allResources = ref<Array<{ id: number; system_id: number; resource_code: string; resource_name: string; system_code?: string }>>([])
const filterSystemId = ref<number | null>(null)
const filterResourceId = ref<number | null>(null)

async function loadSystemsAndResources() {
  try {
    const [sysRes, resRes] = await Promise.all([
      ucpApi.systems(),
      ucpApi.resources({}),
    ])
    systems.value = sysRes.items || []
    allResources.value = resRes.items || []
  } catch {
    // 静默
  }
}

function resourcesOf(systemId: number | null) {
  if (!systemId) return []
  return allResources.value.filter((r) => r.system_id === systemId)
}

function onSystemFilterChange() {
  filterResourceId.value = null
}

function clearFilter() {
  filterSystemId.value = null
  filterResourceId.value = null
}

async function loadKpi() {
  try {
    const params: Record<string, number> = { hours: 24 }
    if (filterResourceId.value) params.resource_id = filterResourceId.value
    else if (filterSystemId.value) params.system_id = filterSystemId.value
    const [summary, alerts] = await Promise.all([
      monitorApi.summaryRaw(params).catch(() => null),
      monitorApi.alertsRaw(50, params).catch(() => []),
    ])
    if (summary) {
      kpi.value.pipelineTotal = summary.pipeline_total || 0
      kpi.value.pipelineSuccess = summary.pipeline_success || 0
      kpi.value.pipelineFailed = summary.pipeline_failed || 0
      kpi.value.pipelinePartial = summary.pipeline_partial || 0
      kpi.value.pipelineRunning = summary.pipeline_running || 0
      kpi.value.failRate = summary.fail_rate ? Number((summary.fail_rate * 100).toFixed(1)) : 0
      kpi.value.successRate = kpi.value.pipelineTotal > 0
        ? Number(((kpi.value.pipelineSuccess / kpi.value.pipelineTotal) * 100).toFixed(1))
        : 0
      kpi.value.avgDurationMs = summary.avg_duration_ms || 0
    }
    kpi.value.alertCount = alerts.length
  } catch (e) {
    console.warn('monitor kpi load error', e)
  }
}

watch([filterSystemId, filterResourceId], () => {
  loadKpi()
})

onMounted(() => {
  loadKpi()
  loadSystemsAndResources()
})
</script>

<style scoped>
.monitor-tab .kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}
.kpi-card {
  background: #fff;
  border-radius: 8px;
  padding: 16px 20px;
  border: 1px solid #e5e6eb;
  border-left: 3px solid #c9cdd4;
}
.kpi-success { border-left-color: #10b981; }
.kpi-fail { border-left-color: #ef4444; }
.kpi-running { border-left-color: #3b82f6; }
.kpi-alert { border-left-color: #6b7280; }
.kpi-warn { background: #fffbeb; }
.kpi-label { font-size: 12px; color: #8f959e; margin-bottom: 4px; }
.kpi-value { font-size: 28px; font-weight: 600; color: #1f2329; line-height: 1.2; }
.kpi-value .pct { font-size: 14px; color: #8f959e; margin-left: 2px; }
.kpi-sub { font-size: 11px; color: #8f959e; margin-top: 4px; }

.monitor-tab .filter-row {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
  padding: 10px 14px;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
}
.filter-hint {
  font-size: 12px;
  color: #6366f1;
  margin-left: 4px;
}

.monitor-tab .sub-tabs {
  background: #fff;
  padding: 0 16px;
  border-radius: 6px 6px 0 0;
}
.monitor-tab .sub-content {
  background: #fff;
  padding: 16px;
  border-radius: 0 0 6px 6px;
  min-height: 400px;
}
</style>
