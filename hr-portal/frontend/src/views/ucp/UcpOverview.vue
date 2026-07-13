<template>
  <div class="ucp-overview">
    <div class="page-header">
      <h2 class="page-title">数据连接概览</h2>
      <el-button @click="refresh" :loading="loading"><el-icon><Refresh /></el-icon>刷新</el-button>
    </div>
    <el-alert v-if="todoCount > 0" type="warning" :closable="false" show-icon class="todo-alert">
      <template #title>
        待处理：<span v-if="kpi.credentialExpiring" class="alert-item">{{ kpi.credentialExpiring }} 个凭证即将过期</span>
        <span v-if="kpi.activeAlertCount" class="alert-item">{{ kpi.activeAlertCount }} 条告警</span>
        <span v-if="kpi.pendingDeadLetters" class="alert-item">{{ kpi.pendingDeadLetters }} 条死信待处理</span>
      </template>
    </el-alert>
    <div class="kpi-row">
      <div class="kpi-card" v-for="card in kpiCards" :key="card.key" @click="navigateTo(card.link)">
        <div class="kpi-value">{{ card.value }}</div><div class="kpi-label">{{ card.label }}</div>
      </div>
    </div>
    <el-row :gutter="20" class="mid-row">
      <el-col :span="14"><el-card shadow="never" class="section-card"><template #header><span>健康状态</span></template>
        <div class="health-grid">
          <div class="health-item"><div class="health-num green">{{ kpi.healthySystems ?? '-' }}</div><div class="health-label">健康系统</div></div>
          <div class="health-item"><div class="health-num red">{{ kpi.anomalySystems ?? '-' }}</div><div class="health-label">异常系统</div></div>
          <div class="health-item"><div class="health-num">{{ kpi.pipelineSuccessRate ?? '-' }}%</div><div class="health-label">流程成功率</div></div>
          <div class="health-item"><div class="health-num">{{ kpi.avgDuration ?? '-' }}s</div><div class="health-label">平均执行耗时</div></div>
        </div>
      </el-card></el-col>
      <el-col :span="10"><el-card shadow="never" class="section-card"><template #header><span>待办事项</span></template>
        <div class="todo-list">
          <div class="todo-item" @click="router.push('/ucp/events/dead-letters')"><el-icon><Warning /></el-icon><span>待处理死信</span><el-tag size="small" type="danger">{{ kpi.pendingDeadLetters ?? 0 }}</el-tag></div>
          <div class="todo-item" @click="router.push('/ucp/systems')"><el-icon><Clock /></el-icon><span>即将过期凭证</span><el-tag size="small" type="warning">{{ kpi.credentialExpiring ?? 0 }}</el-tag></div>
          <div class="todo-item" @click="router.push('/ucp/approvals')"><el-icon><Document /></el-icon><span>待审批事项</span><el-tag size="small" type="info">{{ kpi.pendingApprovals ?? 0 }}</el-tag></div>
        </div>
      </el-card></el-col>
    </el-row>
    <el-card shadow="never" class="section-card"><template #header><span>快捷入口</span></template>
      <div class="shortcuts">
        <el-button type="primary" @click="router.push('/ucp/systems')">新建接入系统</el-button>
        <el-button type="primary" @click="router.push('/ucp/pipelines/designer')">新建流程编排</el-button>
        <el-button @click="router.push('/ucp/runs')">查看运行中心</el-button>
        <el-button @click="router.push('/ucp/scenarios')">查看场景方案</el-button>
        <el-button @click="router.push('/ucp/assets')">进入资产治理</el-button>
      </div>
    </el-card>
    <el-row :gutter="20" class="mid-row">
      <el-col :span="12"><el-card shadow="never" class="section-card"><template #header><span>最近运行记录</span><el-button link size="small" @click="router.push('/ucp/runs')">查看全部</el-button></template>
        <el-table :data="recentRuns" size="small" empty-text="暂无运行记录">
          <el-table-column prop="pipeline_code" label="流程" /><el-table-column prop="status" label="状态" width="80"><template #default="{row}"><el-tag :type="runStatusTag(row.status)" size="small">{{ row.status }}</el-tag></template></el-table-column>
          <el-table-column prop="started_at" label="时间" width="140" />
        </el-table>
      </el-card></el-col>
      <el-col :span="12"><el-card shadow="never" class="section-card"><template #header><span>最近失败事件</span><el-button link size="small" @click="router.push('/ucp/events/dead-letters')">查看全部</el-button></template>
        <el-table :data="recentFailures" size="small" empty-text="暂无失败事件">
          <el-table-column prop="event_type" label="类型" /><el-table-column prop="error_summary" label="错误摘要" show-overflow-tooltip /><el-table-column prop="received_at" label="时间" width="140" />
        </el-table>
      </el-card></el-col>
    </el-row>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Refresh, Warning, Clock, Document } from '@element-plus/icons-vue'
import { monitorApi, ucpApi } from '@/api/ucp'
const router = useRouter(); const loading = ref(false)
const kpi = ref<Record<string, number>>({})
const kpiCards = computed(() => [
  { key: 'systems', label: '接入系统数', value: kpi.value.systemCount ?? '-', link: '/ucp/systems' },
  { key: 'pipelines', label: '活跃流程数', value: kpi.value.activePipelineCount ?? '-', link: '/ucp/pipelines' },
  { key: 'runs', label: '今日运行次数', value: kpi.value.todayRunCount ?? '-', link: '/ucp/runs' },
  { key: 'failures', label: '今日失败次数', value: kpi.value.todayFailureCount ?? '-', link: '/ucp/runs' },
  { key: 'deadLetters', label: '待处理死信数', value: kpi.value.pendingDeadLetters ?? '-', link: '/ucp/events/dead-letters' },
  { key: 'alerts', label: '当前告警数', value: kpi.value.activeAlertCount ?? '-', link: '/ucp/monitor' },
])
const todoCount = computed(() => (kpi.value.credentialExpiring || 0) + (kpi.value.activeAlertCount || 0) + (kpi.value.pendingDeadLetters || 0))
const recentRuns = ref<any[]>([]); const recentFailures = ref<any[]>([])
function runStatusTag(s: string) { const m: Record<string, string> = { SUCCESS: 'success', FAILED: 'danger', RUNNING: 'warning', PARTIAL_SUCCESS: 'warning' }; return m[s] || 'info' }
function navigateTo(p: string) { router.push(p) }
async function refresh() {
  loading.value = true
  try {
    const [summary, sysOverview, recent, alerts] = await Promise.all([
      monitorApi.summary(24).catch(() => null), ucpApi.systemsOverview().catch(() => null),
      monitorApi.recentRuns(5).catch(() => []), monitorApi.alerts(5).catch(() => []),
    ])
    if (summary) { const t = summary.pipeline_total || 0; const f = summary.pipeline_failed || 0; kpi.value.todayRunCount = t; kpi.value.todayFailureCount = f; kpi.value.pipelineSuccessRate = t > 0 ? Math.round(((t - f) / t) * 100) : 100; kpi.value.avgDuration = summary.avg_duration_ms ? Math.round(summary.avg_duration_ms / 1000) : 0; kpi.value.pendingDeadLetters = summary.dead_letters || 0; kpi.value.activeAlertCount = (alerts && Array.isArray(alerts) ? alerts.length : 0) }
    if (sysOverview) { const items = sysOverview.items || []; kpi.value.systemCount = sysOverview.total || items.length; kpi.value.activePipelineCount = items.reduce((s: number, i: any) => s + (i.pipeline_count || 0), 0); const w = items.filter((i: any) => i.credential_status === 'expired' || i.credential_status === 'warning'); kpi.value.credentialExpiring = w.length; const u = items.filter((i: any) => i.health_status === 'failing' || i.health_status === 'blocked'); kpi.value.healthySystems = items.length - u.length; kpi.value.anomalySystems = u.length }
    recentRuns.value = Array.isArray(recent) ? recent : (recent as any)?.items || []; recentFailures.value = Array.isArray(alerts) ? alerts : (alerts as any)?.items || []
  } catch {} finally { loading.value = false }
}
onMounted(() => refresh())
</script>
<style scoped>
.ucp-overview { padding: 20px 24px; min-height: 100%; background: var(--color-bg-page) }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px }
.page-title { font-size: 22px; font-weight: 600; color: var(--color-text-primary); margin: 0 }
.todo-alert { margin-bottom: 16px } .alert-item { margin-right: 16px }
.kpi-row { display: grid; grid-template-columns: repeat(6, 1fr); gap: 16px; margin-bottom: 20px }
.kpi-card { background: var(--color-bg-card); border-radius: 8px; padding: 16px; text-align: center; cursor: pointer; transition: box-shadow .2s; border: 1px solid var(--color-border) }
.kpi-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,.06) }
.kpi-value { font-size: 28px; font-weight: 700; color: var(--color-primary); margin-bottom: 4px }
.kpi-label { font-size: 13px; color: var(--color-text-secondary) }
.mid-row { margin-bottom: 20px } .section-card { margin-bottom: 16px }
.section-card :deep(.el-card__header) { display: flex; justify-content: space-between; align-items: center }
.health-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px }
.health-item { text-align: center } .health-num { font-size: 24px; font-weight: 600; color: var(--color-text-primary) }
.health-num.green { color: #67c23a } .health-num.red { color: #f56c6c }
.health-label { font-size: 12px; color: var(--color-text-secondary); margin-top: 4px }
.todo-list { display: flex; flex-direction: column; gap: 12px }
.todo-item { display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 8px; border-radius: 4px; transition: background .15s }
.todo-item:hover { background: var(--color-bg-hover) } .todo-item span:first-of-type { flex: 1 }
.shortcuts { display: flex; gap: 12px; flex-wrap: wrap }
</style>
