<template>
  <div class="event-hub">
    <div class="page-header">
      <h2>事件处理</h2>
      <p class="desc">事件接入、触发器匹配、异步派发与死信处理</p>
    </div>

    <el-row :gutter="12" class="stat-row">
      <el-col :span="6"><el-card shadow="hover" class="stat-card"><div class="stat-label">今日事件</div><div class="stat-value">{{ stats.todayCount }}</div></el-card></el-col>
      <el-col :span="6"><el-card shadow="hover" class="stat-card"><div class="stat-label">成功派发</div><div class="stat-value success">{{ stats.dispatchedCount }}</div></el-card></el-col>
      <el-col :span="6"><el-card shadow="hover" class="stat-card"><div class="stat-label">未匹配</div><div class="stat-value warning">{{ stats.noMatchCount }}</div></el-card></el-col>
      <el-col :span="6"><el-card shadow="hover" class="stat-card"><div class="stat-label">死信事件</div><div class="stat-value danger">{{ stats.failedCount }}</div></el-card></el-col>
    </el-row>

    <el-tabs v-model="activeTab" class="hub-tabs">
      <el-tab-pane label="事件列表" name="list" />
      <el-tab-pane label="触发规则" name="triggers" />
      <el-tab-pane label="死信队列" name="dead" />
    </el-tabs>

    <EventListInner v-if="activeTab === 'list'" ref="eventListRef" />
    <EventTriggerConfigView v-else-if="activeTab === 'triggers'" ref="triggerRef" />
    <DeadLetterListView v-else-if="activeTab === 'dead'" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ucpApi } from '@/api/ucp'
import EventListInner from './EventListInner.vue'
import EventTriggerConfigView from './EventTriggerConfigView.vue'
import DeadLetterListView from './DeadLetterListView.vue'

const activeTab = ref('list')
const eventListRef = ref<any>(null)
const triggerRef = ref<any>(null)

const stats = reactive({ todayCount: 0, dispatchedCount: 0, noMatchCount: 0, failedCount: 0 })

async function loadStats() {
  try {
    const events = await ucpApi.listEvents({ limit: 200 }).catch(() => ({ items: [] }))
    const items = (events as any).items || []
    stats.todayCount = items.filter((e: any) => e.received_at?.startsWith(new Date().toISOString().slice(0, 10))).length
    stats.dispatchedCount = items.filter((e: any) => e.status === 'DISPATCHED').length
    stats.noMatchCount = items.filter((e: any) => e.status === 'RECEIVED').length
    stats.failedCount = items.filter((e: any) => e.status === 'FAILED' || e.status === 'DEAD').length
  } catch {}
}

onMounted(() => loadStats())
</script>

<style scoped>
.event-hub { padding: 20px 24px; min-height: 100%; background: var(--color-bg-page) }
.page-header { margin-bottom: 16px } .page-header h2 { font-size: 22px; font-weight: 600; color: var(--color-text-primary); margin: 0 0 4px } .page-header .desc { font-size: 13px; color: var(--color-text-secondary); margin: 0 }
.stat-row { margin-bottom: 16px }
.stat-card { text-align: center } .stat-card :deep(.el-card__body) { padding: 14px 8px }
.stat-label { font-size: 12px; color: #909399; margin-bottom: 4px }
.stat-value { font-size: 28px; font-weight: 700; color: var(--color-primary) }
.stat-value.success { color: #67c23a } .stat-value.warning { color: #e6a23c } .stat-value.danger { color: #f56c6c }
.hub-tabs { margin-bottom: 0 } .hub-tabs :deep(.el-tabs__item) { font-size: 15px; font-weight: 500 }
</style>
