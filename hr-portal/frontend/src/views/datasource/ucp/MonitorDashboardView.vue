<template>
  <div class="monitor-dashboard-page">
    <!-- 头部：窗口选择 + 刷新 -->
    <div class="page-header">
      <div>
        <h2>运行监控 Dashboard</h2>
        <p class="sub">实时观察 UCP 平台 pipeline 执行情况, 失败率, 告警与最近运行</p>
      </div>
      <div class="actions">
        <el-radio-group v-model="hours" @change="loadAll">
          <el-radio-button :value="4">4h</el-radio-button>
          <el-radio-button :value="24">24h</el-radio-button>
          <el-radio-button :value="168">7d</el-radio-button>
          <el-radio-button :value="720">30d</el-radio-button>
        </el-radio-group>
        <el-button @click="loadAll" :icon="Refresh">刷新</el-button>
      </div>
    </div>

    <!-- 1. 汇总卡片 -->
    <el-row :gutter="12" class="stat-row" v-loading="loadingSummary">
      <el-col :span="4">
        <el-card class="stat-card">
          <div class="stat-label">总执行</div>
          <div class="stat-value">{{ summary?.pipeline_total ?? '-' }}</div>
        </el-card>
      </el-col>
      <el-col :span="4">
        <el-card class="stat-card stat-success">
          <div class="stat-label">成功</div>
          <div class="stat-value">{{ summary?.pipeline_success ?? '-' }}</div>
        </el-card>
      </el-col>
      <el-col :span="4">
        <el-card class="stat-card stat-warn">
          <div class="stat-label">部分成功</div>
          <div class="stat-value">{{ summary?.pipeline_partial ?? '-' }}</div>
        </el-card>
      </el-col>
      <el-col :span="4">
        <el-card class="stat-card stat-error">
          <div class="stat-label">失败</div>
          <div class="stat-value">{{ summary?.pipeline_failed ?? '-' }}</div>
        </el-card>
      </el-col>
      <el-col :span="4">
        <el-card class="stat-card">
          <div class="stat-label">失败率</div>
          <div class="stat-value" :class="failRateClass">
            {{ summary?.fail_rate ?? '0' }}%
          </div>
        </el-card>
      </el-col>
      <el-col :span="4">
        <el-card class="stat-card">
          <div class="stat-label">平均耗时</div>
          <div class="stat-value">{{ formatMs(summary?.avg_duration_ms) }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="12" class="stat-row" v-loading="loadingSummary">
      <el-col :span="6">
        <el-card class="stat-card-mini">
          <span class="mini-label">运行中</span>
          <span class="mini-value">{{ summary?.pipeline_running ?? '-' }}</span>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card-mini">
          <span class="mini-label">事件总数</span>
          <span class="mini-value">{{ summary?.events_total ?? '-' }}</span>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card-mini">
          <span class="mini-label">事件失败</span>
          <span class="mini-value text-warn">{{ summary?.events_failed ?? '-' }}</span>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card-mini">
          <span class="mini-label">死信 / 待审批</span>
          <span class="mini-value text-error">
            {{ summary?.dead_letters ?? '-' }} / {{ summary?.pending_approvals ?? '-' }}
          </span>
        </el-card>
      </el-col>
    </el-row>

    <!-- 2. 趋势图 + 状态分布 -->
    <el-row :gutter="12" class="chart-row">
      <el-col :span="16">
        <el-card>
          <template #header>
            <span>执行趋势 ({{ hours }}h)</span>
          </template>
          <div class="chart-container" v-loading="loadingTrend">
            <svg
              v-if="trend.length > 0"
              :viewBox="`0 0 ${chartW} ${chartH}`"
              :width="chartW"
              :height="chartH"
            >
              <!-- 网格 -->
              <line
                v-for="i in 5"
                :key="`grid-${i}`"
                :x1="marginX"
                :y1="(chartH - marginY) * i / 5 + marginY / 5"
                :x2="chartW - marginX"
                :y2="(chartH - marginY) * i / 5 + marginY / 5"
                stroke="#ebeef5"
                stroke-dasharray="2,2"
              />
              <!-- X 轴标签 -->
              <text
                v-for="(t, i) in trend"
                :key="`x-${i}`"
                :x="xPos(i)"
                :y="chartH - 5"
                font-size="9"
                fill="#909399"
                text-anchor="middle"
              >
                {{ shortBucket(t.bucket) }}
              </text>
              <!-- 成功线 (绿) -->
              <polyline
                :points="successLinePoints"
                stroke="#67C23A"
                stroke-width="2"
                fill="none"
              />
              <!-- 失败线 (红) -->
              <polyline
                :points="failedLinePoints"
                stroke="#F56C6C"
                stroke-width="2"
                fill="none"
              />
              <!-- 总数线 (蓝) -->
              <polyline
                :points="totalLinePoints"
                stroke="#409EFF"
                stroke-width="2"
                fill="none"
                stroke-dasharray="3,2"
              />
              <!-- 成功点 -->
              <circle
                v-for="(t, i) in trend"
                :key="`s-${i}`"
                :cx="xPos(i)"
                :cy="yPos(t.success)"
                r="3"
                fill="#67C23A"
              />
              <!-- 失败点 -->
              <circle
                v-for="(t, i) in trend"
                :key="`f-${i}`"
                :cx="xPos(i)"
                :cy="yPos(t.failed)"
                r="3"
                fill="#F56C6C"
              />
            </svg>
            <el-empty v-else description="暂无数据" />
          </div>
          <div class="chart-legend">
            <span><i style="background: #67C23A"></i> 成功</span>
            <span><i style="background: #F56C6C"></i> 失败</span>
            <span><i style="background: #409EFF"></i> 总数</span>
          </div>
        </el-card>
      </el-col>

      <el-col :span="8">
        <el-card>
          <template #header>
            <span>状态分布</span>
          </template>
          <div class="pie-container" v-loading="loadingStatus">
            <svg
              v-if="statusList.length > 0"
              :viewBox="`0 0 200 200`"
              width="200"
              height="200"
            >
              <g transform="translate(100,100)">
                <path
                  v-for="(slice, i) in pieSlices"
                  :key="`slice-${i}`"
                  :d="slice.path"
                  :fill="slice.color"
                />
                <circle r="40" fill="#fff" />
                <text text-anchor="middle" y="-5" font-size="14" font-weight="bold">
                  {{ totalCount }}
                </text>
                <text text-anchor="middle" y="15" font-size="10" fill="#909399">
                  总执行
                </text>
              </g>
            </svg>
            <el-empty v-else description="暂无数据" :image-size="80" />
            <ul class="pie-legend">
              <li v-for="(s, i) in statusList" :key="s.status">
                <i :style="{ background: statusColor(s.status) }"></i>
                <span>{{ s.status }}</span>
                <strong>{{ s.count }}</strong>
              </li>
            </ul>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 3. Pipeline Top + 告警 -->
    <el-row :gutter="12" class="chart-row">
      <el-col :span="12">
        <el-card>
          <template #header>
            <span>Top Pipeline (按执行次数)</span>
          </template>
          <div v-loading="loadingPipes" class="pipe-stats">
            <div v-for="p in pipeStats" :key="p.pipeline_code" class="pipe-bar-row">
              <div class="pipe-name">{{ p.pipeline_code }}</div>
              <div class="pipe-bar">
                <div
                  class="pipe-bar-success"
                  :style="{ width: (p.success / p.total * 100) + '%' }"
                ></div>
                <div
                  class="pipe-bar-failed"
                  :style="{ width: (p.failed / p.total * 100) + '%' }"
                ></div>
              </div>
              <div class="pipe-count">
                <span>{{ p.total }}</span>
                <small :class="p.fail_rate > 10 ? 'text-error' : ''">
                  {{ p.fail_rate }}%
                </small>
              </div>
            </div>
            <el-empty v-if="pipeStats.length === 0" description="暂无数据" :image-size="80" />
          </div>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card>
          <template #header>
            <span>告警 ({{ alerts.length }})</span>
          </template>
          <el-table :data="alerts" v-loading="loadingAlerts" stripe max-height="400">
            <el-table-column label="级别" width="80">
              <template #default="{ row }">
                <el-tag
                  :type="row.level === 'CRITICAL' ? 'danger' : 'warning'"
                  size="small"
                >
                  {{ row.level }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="type" label="类型" width="120" />
            <el-table-column prop="message" label="内容" show-overflow-tooltip />
            <el-table-column label="时间" width="160">
              <template #default="{ row }">
                <span class="muted">
                  {{ row.created_at?.slice(0, 19).replace('T', ' ') || '-' }}
                </span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <!-- 4. 最近执行 -->
    <el-card>
      <template #header>
        <span>最近执行 (Top {{ recentRuns.length }})</span>
      </template>
      <el-table :data="recentRuns" v-loading="loadingRecent" stripe max-height="500">
        <el-table-column prop="pipeline_code" label="Pipeline" width="200" />
        <el-table-column prop="pipeline_run_id" label="Run ID" width="220">
          <template #default="{ row }">
            <code class="run-id">{{ row.pipeline_run_id }}</code>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="trigger_type" label="触发" width="100" />
        <el-table-column prop="triggered_by" label="操作人" width="120" />
        <el-table-column label="耗时" width="100">
          <template #default="{ row }">
            {{ formatMs(row.duration_ms) }}
          </template>
        </el-table-column>
        <el-table-column label="开始时间" width="180">
          <template #default="{ row }">
            <span class="muted">
              {{ row.started_at?.slice(0, 19).replace('T', ' ') || row.created_at?.slice(0, 19).replace('T', ' ') || '-' }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import {
  monitorApi,
  type MonitorSummary,
  type TrendBucket,
  type RecentRun,
  type MonitorAlert,
  type PipelineStat,
} from '@/api/ucp'

const hours = ref(24)
const summary = ref<MonitorSummary | null>(null)
const trend = ref<TrendBucket[]>([])
const statusDist = ref<Record<string, number>>({})
const recentRuns = ref<RecentRun[]>([])
const alerts = ref<MonitorAlert[]>([])
const pipeStats = ref<PipelineStat[]>([])

const loadingSummary = ref(false)
const loadingTrend = ref(false)
const loadingStatus = ref(false)
const loadingRecent = ref(false)
const loadingAlerts = ref(false)
const loadingPipes = ref(false)

const chartW = 700
const chartH = 220
const marginX = 30
const marginY = 20

async function loadAll() {
  await Promise.all([
    loadSummary(),
    loadTrend(),
    loadStatus(),
    loadRecent(),
    loadAlerts(),
    loadPipeStats(),
  ])
}

async function loadSummary() {
  loadingSummary.value = true
  try {
    summary.value = await monitorApi.summary(hours.value)
  } finally {
    loadingSummary.value = false
  }
}
async function loadTrend() {
  loadingTrend.value = true
  try {
    trend.value = await monitorApi.trend(hours.value, 'hour')
  } finally {
    loadingTrend.value = false
  }
}
async function loadStatus() {
  loadingStatus.value = true
  try {
    statusDist.value = await monitorApi.statusDistribution(hours.value)
  } finally {
    loadingStatus.value = false
  }
}
async function loadRecent() {
  loadingRecent.value = true
  try {
    recentRuns.value = await monitorApi.recentRuns(50)
  } finally {
    loadingRecent.value = false
  }
}
async function loadAlerts() {
  loadingAlerts.value = true
  try {
    alerts.value = await monitorApi.alerts(50)
  } finally {
    loadingAlerts.value = false
  }
}
async function loadPipeStats() {
  loadingPipes.value = true
  try {
    pipeStats.value = await monitorApi.pipelineStats(hours.value, 10)
  } finally {
    loadingPipes.value = false
  }
}

// ===== 图表计算 =====
const maxY = computed(() => {
  const m = Math.max(1, ...trend.value.map((t) => Math.max(t.total, t.success, t.failed)))
  return Math.ceil(m * 1.1)
})
function xPos(i: number): number {
  if (trend.value.length <= 1) return chartW / 2
  return marginX + (i / (trend.value.length - 1)) * (chartW - 2 * marginX)
}
function yPos(v: number): number {
  return chartH - marginY - (v / maxY.value) * (chartH - 2 * marginY)
}
const totalLinePoints = computed(
  () => trend.value.map((t, i) => `${xPos(i)},${yPos(t.total)}`).join(' '),
)
const successLinePoints = computed(
  () => trend.value.map((t, i) => `${xPos(i)},${yPos(t.success)}`).join(' '),
)
const failedLinePoints = computed(
  () => trend.value.map((t, i) => `${xPos(i)},${yPos(t.failed)}`).join(' '),
)
function shortBucket(b: string): string {
  if (!b) return ''
  return b.length > 12 ? b.slice(5) : b
}

// 饼图
const STATUS_COLORS: Record<string, string> = {
  SUCCESS: '#67C23A',
  PARTIAL_SUCCESS: '#E6A23C',
  FAILED: '#F56C6C',
  RUNNING: '#409EFF',
  PENDING: '#909399',
  CANCELLED: '#C0C4CC',
  TIMEOUT: '#F56C6C',
}
function statusColor(s: string): string {
  return STATUS_COLORS[s] || '#909399'
}
const statusList = computed(() =>
  Object.entries(statusDist.value)
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count),
)
const totalCount = computed(() =>
  statusList.value.reduce((sum, s) => sum + s.count, 0),
)
const pieSlices = computed(() => {
  const list = statusList.value
  if (list.length === 0 || totalCount.value === 0) return []
  let startAngle = -Math.PI / 2
  const slices: { path: string; color: string }[] = []
  for (const s of list) {
    const angle = (s.count / totalCount.value) * Math.PI * 2
    const endAngle = startAngle + angle
    const x1 = Math.cos(startAngle) * 80
    const y1 = Math.sin(startAngle) * 80
    const x2 = Math.cos(endAngle) * 80
    const y2 = Math.sin(endAngle) * 80
    const largeArc = angle > Math.PI ? 1 : 0
    const path = `M 0 0 L ${x1} ${y1} A 80 80 0 ${largeArc} 1 ${x2} ${y2} Z`
    slices.push({ path, color: statusColor(s.status) })
    startAngle = endAngle
  }
  return slices
})

// 工具
function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60_000).toFixed(1)}m`
}
function statusTagType(s: string): 'success' | 'warning' | 'danger' | 'info' | 'primary' {
  if (s === 'SUCCESS') return 'success'
  if (s === 'PARTIAL_SUCCESS') return 'warning'
  if (s === 'FAILED' || s === 'TIMEOUT') return 'danger'
  if (s === 'RUNNING') return 'primary'
  return 'info'
}
const failRateClass = computed(() => {
  if (!summary.value) return ''
  if (summary.value.fail_rate > 20) return 'text-error'
  if (summary.value.fail_rate > 5) return 'text-warn'
  return 'text-success'
})

onMounted(loadAll)
</script>

<style scoped>
.monitor-dashboard-page {
  padding: 16px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.page-header h2 {
  margin: 0 0 4px;
}
.sub {
  margin: 0;
  color: #909399;
  font-size: 13px;
}
.actions {
  display: flex;
  gap: 12px;
  align-items: center;
}
.stat-row {
  margin-bottom: 12px;
}
.stat-card {
  text-align: center;
  padding: 4px 0;
}
.stat-card .stat-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}
.stat-card .stat-value {
  font-size: 24px;
  font-weight: bold;
}
.stat-success {
  border-left: 3px solid #67c23a;
}
.stat-warn {
  border-left: 3px solid #e6a23c;
}
.stat-error {
  border-left: 3px solid #f56c6c;
}
.stat-card-mini {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
}
.mini-label {
  color: #909399;
  font-size: 13px;
}
.mini-value {
  font-size: 18px;
  font-weight: bold;
}
.text-success {
  color: #67c23a;
}
.text-warn {
  color: #e6a23c;
}
.text-error {
  color: #f56c6c;
}
.muted {
  color: #909399;
  font-size: 12px;
}
code.run-id {
  font-family: 'Courier New', monospace;
  font-size: 11px;
  background: #f5f7fa;
  padding: 1px 4px;
  border-radius: 2px;
}
.chart-row {
  margin-bottom: 12px;
}
.chart-container {
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-x: auto;
}
.chart-legend {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 8px;
  font-size: 12px;
  color: #606266;
}
.chart-legend i {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-right: 4px;
  vertical-align: middle;
  border-radius: 2px;
}
.pie-container {
  display: flex;
  align-items: center;
  gap: 16px;
}
.pie-legend {
  list-style: none;
  padding: 0;
  margin: 0;
  flex: 1;
}
.pie-legend li {
  display: flex;
  align-items: center;
  padding: 4px 0;
  font-size: 13px;
}
.pie-legend i {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-right: 6px;
  border-radius: 2px;
}
.pie-legend strong {
  margin-left: auto;
  color: #303133;
}
.pipe-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0;
}
.pipe-bar-row {
  display: grid;
  grid-template-columns: 160px 1fr 80px;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.pipe-name {
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pipe-bar {
  display: flex;
  height: 12px;
  background: #f5f7fa;
  border-radius: 6px;
  overflow: hidden;
}
.pipe-bar-success {
  background: #67c23a;
}
.pipe-bar-failed {
  background: #f56c6c;
}
.pipe-count {
  text-align: right;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.pipe-count small {
  font-size: 10px;
  color: #909399;
}
</style>
