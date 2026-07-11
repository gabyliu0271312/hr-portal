<template>
  <div class="event-detail" v-loading="loading">
    <el-page-header :icon="ArrowLeft" content="返回事件列表" @back="goBack" class="back-header" />

    <template v-if="event">
      <!-- 概览 -->
      <el-card class="overview" shadow="hover">
        <template #header>
          <div class="card-header">
            <span class="title">事件 #{{ event.id }} · {{ event.event_id }}</span>
            <el-tag :type="statusTagType(event.status)" size="large">{{ statusLabel(event.status) }}</el-tag>
          </div>
        </template>
        <el-descriptions :column="3" border>
          <el-descriptions-item label="事件类型">
            <el-tag size="small" effect="plain">{{ event.event_type }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="来源">
            <el-tag :type="sourceTagType(event.source)" size="small">{{ event.source }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="触发模式">{{ event.trigger }}</el-descriptions-item>
          <el-descriptions-item label="Trace ID">
            <code v-if="event.trace_id">{{ event.trace_id }}</code>
            <span v-else class="empty">-</span>
          </el-descriptions-item>
          <el-descriptions-item label="命中触发器">
            <code v-if="event.matched_trigger_code">{{ event.matched_trigger_code }}</code>
            <span v-else class="empty">-</span>
          </el-descriptions-item>
          <el-descriptions-item label="Pipeline Run ID">
            <el-link v-if="event.pipeline_run_id" type="primary" @click="router.push(`/ucp/executions/${event.pipeline_run_id}`)">
              <code>{{ event.pipeline_run_id }}</code>
            </el-link>
            <span v-else class="empty">-</span>
          </el-descriptions-item>
          <el-descriptions-item label="重试次数" :span="1">{{ event.retry_count }}</el-descriptions-item>
          <el-descriptions-item label="事件时间">{{ formatTime(event.event_timestamp) }}</el-descriptions-item>
          <el-descriptions-item label="接收时间">{{ formatTime(event.received_at) }}</el-descriptions-item>
          <el-descriptions-item label="派发时间">{{ formatTime(event.dispatched_at) }}</el-descriptions-item>
          <el-descriptions-item label="完成时间">{{ formatTime(event.completed_at) }}</el-descriptions-item>
          <el-descriptions-item label="耗时（ms）">
            <span v-if="event.received_at && event.completed_at">{{ calcDurationMs(event.received_at, event.completed_at) }}</span>
            <span v-else class="empty">-</span>
          </el-descriptions-item>
        </el-descriptions>

        <el-alert
          v-if="event.error_message"
          :title="`[${event.error_code || 'ERROR'}] ${event.error_message}`"
          type="error"
          :closable="false"
          class="error-alert"
        />
      </el-card>

      <!-- Payload -->
      <el-card class="payload" shadow="hover">
        <template #header>
          <div class="card-header">
            <span class="title">Payload（脱敏后）</span>
            <el-button size="small" @click="copyJson(event.payload)">复制 JSON</el-button>
          </div>
        </template>
        <pre class="json-block">{{ prettyJson(event.payload) }}</pre>
      </el-card>

      <!-- Metadata -->
      <el-card v-if="event.metadata" class="metadata" shadow="hover">
        <template #header>
          <span class="title">Metadata（header / 签名 / IP）</span>
        </template>
        <pre class="json-block">{{ prettyJson(event.metadata) }}</pre>
      </el-card>

      <!-- 时间线 -->
      <el-card class="timeline-card" shadow="hover">
        <template #header>
          <span class="title">状态时间线</span>
        </template>
        <el-timeline>
          <el-timeline-item
            v-for="node in timeline"
            :key="node.label"
            :timestamp="node.time"
            :color="node.color"
            :hollow="!node.color"
            placement="top"
          >
            <div class="timeline-label">{{ node.label }}</div>
            <div v-if="node.detail" class="timeline-detail">{{ node.detail }}</div>
          </el-timeline-item>
        </el-timeline>
      </el-card>

      <!-- 派发尝试历史 -->
      <el-card v-if="deliveries.length > 0" class="deliveries-card" shadow="hover">
        <template #header>
          <span class="title">派发尝试历史（最近 {{ deliveries.length }} 次）</span>
        </template>
        <el-timeline>
          <el-timeline-item
            v-for="d in deliveries"
            :key="d.id"
            :timestamp="formatTime(d.created_at)"
            :color="deliveryColor(d.status)"
            placement="top"
          >
            <div class="delivery-line">
              <el-tag size="small" :type="deliveryTagType(d.status)">{{ d.status }}</el-tag>
              <span class="delivery-info">attempt #{{ d.attempt }} · {{ d.trigger_code || '-' }}</span>
              <el-link v-if="d.pipeline_run_id" type="primary" class="run-id" @click="router.push(`/ucp/executions/${d.pipeline_run_id}`)"><code>{{ d.pipeline_run_id }}</code></el-link>
            </div>
            <div v-if="d.error_message" class="timeline-detail">
              [{{ d.error_code }}] {{ d.error_message }}
            </div>
            <div v-if="d.next_retry_at" class="timeline-detail">
              下次重试: {{ formatTime(d.next_retry_at) }}
            </div>
            <div v-if="d.trigger_source" class="timeline-detail">
              来源: {{ d.trigger_source }}{{ d.triggered_by ? ` (${d.triggered_by})` : '' }}
            </div>
          </el-timeline-item>
        </el-timeline>
      </el-card>

      <!-- 操作 -->
      <el-card class="actions" shadow="hover">
        <el-button
          v-if="['RECEIVED', 'NO_MATCH', 'FAILED'].includes(event.status)"
          type="warning"
          @click="manualDispatch"
        >重新匹配并派发</el-button>
        <el-button @click="loadDetail">刷新</el-button>
      </el-card>
    </template>

    <el-empty v-else-if="!loading" description="事件不存在" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import { ucpApi } from '@/api/ucp'

const route = useRoute()
const router = useRouter()

const event = ref<any>(null)
const loading = ref(false)
const deliveries = ref<any[]>([])

async function loadDetail() {
  const id = String(route.params.eventId || '')
  if (!id) return
  loading.value = true
  try {
    event.value = await ucpApi.getEvent(id)
    // 加载派发尝试历史
    try {
      const dr = await ucpApi.listEventDeliveries(event.value.event_id, 50)
      deliveries.value = dr.items || []
    } catch {
      deliveries.value = []
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '事件加载失败')
  } finally {
    loading.value = false
  }
}

function goBack() {
  router.push({ name: 'UcpEventList' })
}

async function manualDispatch() {
  if (!event.value) return
  await ElMessageBox.confirm(
    `确认对事件 ${event.value.event_id} 重新匹配并派发？`,
    '手动派发',
    { type: 'warning' },
  )
  try {
    const res = await ucpApi.manualDispatchEvent(String(event.value.id))
    ElMessage.success(`已派发：${res.status} / ${res.matched_trigger_code || '无匹配'}`)
    loadDetail()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '派发失败')
  }
}

const timeline = computed(() => {
  if (!event.value) return []
  const e = event.value
  const nodes: any[] = []
  if (e.event_timestamp) nodes.push({ label: '事件产生', time: formatTime(e.event_timestamp), color: '#909399' })
  if (e.received_at) nodes.push({ label: '事件接收', time: formatTime(e.received_at), color: '#67c23a' })
  if (e.matched_trigger_code) nodes.push({ label: `匹配触发器 ${e.matched_trigger_code}`, time: '-', color: '#409eff' })
  if (e.dispatched_at) nodes.push({ label: `派发到 Pipeline (${e.pipeline_run_id || '-'})`, time: formatTime(e.dispatched_at), color: '#409eff' })
  if (e.completed_at) nodes.push({ label: 'Pipeline 完成', time: formatTime(e.completed_at), color: '#67c23a' })
  if (e.error_message) nodes.push({ label: `失败: [${e.error_code}] ${e.error_message}`, time: '-', color: '#f56c6c' })
  return nodes
})

function prettyJson(obj: any) {
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(obj)
  }
}

function copyJson(obj: any) {
  const text = prettyJson(obj)
  navigator.clipboard.writeText(text).then(
    () => ElMessage.success('已复制'),
    () => ElMessage.error('复制失败'),
  )
}

function statusTagType(s: string) {
  switch (s) {
    case 'COMPLETED': case 'DISPATCHED': return 'success'
    case 'MATCHED': case 'RECEIVED': return 'info'
    case 'FAILED': case 'DEAD_LETTER': return 'danger'
    case 'NO_MATCH': return 'warning'
    default: return ''
  }
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    RECEIVED: '已接收', MATCHED: '已匹配', DISPATCHED: '已派发',
    COMPLETED: '已完成', FAILED: '失败', DEAD_LETTER: '死信', NO_MATCH: '未匹配',
  }
  return map[s] || s
}

function sourceTagType(s: string) {
  if (s === 'FEISHU') return 'success'
  if (s === 'BEISEN') return 'warning'
  if (s === 'INTERNAL') return 'info'
  return ''
}

function formatTime(t: string | null) {
  if (!t) return '-'
  return t.replace('T', ' ').slice(0, 19)
}

function calcDurationMs(start: string, end: string) {
  return new Date(end).getTime() - new Date(start).getTime()
}

function deliveryColor(status: string) {
  if (status === 'SUCCESS') return '#67c23a'
  if (status === 'FAILED') return '#e6a23c'
  if (status === 'DEAD_LETTER') return '#f56c6c'
  if (status === 'PENDING') return '#409eff'
  return '#909399'
}

function deliveryTagType(status: string) {
  if (status === 'SUCCESS') return 'success'
  if (status === 'FAILED') return 'warning'
  if (status === 'DEAD_LETTER') return 'danger'
  if (status === 'PENDING') return 'info'
  return ''
}

onMounted(loadDetail)
</script>

<style scoped>
.event-detail { padding: 16px; max-width: 1200px; }
.back-header { margin-bottom: 12px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.title { font-weight: 600; }
.overview, .payload, .metadata, .timeline-card, .deliveries-card, .actions { margin-bottom: 16px; }
.error-alert { margin-top: 12px; }
.json-block {
  background: #f5f7fa;
  padding: 12px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.5;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  max-height: 400px;
  overflow-y: auto;
}
.timeline-label { font-weight: 600; }
.timeline-detail { color: #909399; font-size: 12px; margin-top: 2px; }
.delivery-line { display: flex; gap: 8px; align-items: center; }
.delivery-info { color: #606266; font-size: 13px; }
.run-id { color: #909399; font-size: 12px; }
.empty { color: #c0c4cc; }
code { font-family: 'JetBrains Mono', Consolas, monospace; font-size: 12px; }
</style>
