<template>
  <div class="events-tab">
    <div v-if="!currentSystemCode" class="placeholder">
      <el-empty description="请先在「接入系统」中选择一个系统" />
    </div>
    <div v-else class="events-content">
      <!-- KPI 卡片横排 (蓝本 v2 场景 11) -->
      <div class="kpi-row">
        <div class="kpi-card kpi-total">
          <div class="kpi-label">事件总数</div>
          <div class="kpi-value">{{ kpi.total }}</div>
          <div class="kpi-sub">近 24h</div>
        </div>
        <div class="kpi-card kpi-completed">
          <div class="kpi-label">已完成</div>
          <div class="kpi-value">{{ kpi.completed }}</div>
          <div class="kpi-sub">{{ completionRate }}%</div>
        </div>
        <div class="kpi-card kpi-failed" :class="{ 'kpi-warn': kpi.failed > 0 }">
          <div class="kpi-label">失败</div>
          <div class="kpi-value">{{ kpi.failed }}</div>
          <div class="kpi-sub">将进死信队列</div>
        </div>
        <div class="kpi-card kpi-dead" :class="{ 'kpi-warn': kpi.dead > 0 }">
          <div class="kpi-label">死信</div>
          <div class="kpi-value">{{ kpi.dead }}</div>
          <div class="kpi-sub">需人工处理</div>
        </div>
      </div>

      <el-tabs v-model="subTab" class="sub-tabs">
        <el-tab-pane label="事件列表" name="list" />
        <el-tab-pane label="触发器" name="triggers" />
        <el-tab-pane label="死信队列" name="dead" />
      </el-tabs>

      <div class="sub-content">
        <EventListView v-if="subTab === 'list'" :system-code="currentSystemCode" />
        <EventTriggerConfigView v-else-if="subTab === 'triggers'" :system-code="currentSystemCode" />
        <DeadLetterListView v-else-if="subTab === 'dead'" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import EventListView from '../EventListView.vue'
import EventTriggerConfigView from '../EventTriggerConfigView.vue'
import DeadLetterListView from '../DeadLetterListView.vue'
import { ucpApi } from '@/api/ucp'

defineProps<{
  currentSystemCode: string
}>()

const subTab = ref('list')

/* ── KPI 统计 ── */
const kpi = ref({ total: 0, completed: 0, failed: 0, dead: 0 })
const completionRate = computed(() => {
  if (kpi.value.total === 0) return '0'
  return ((kpi.value.completed / kpi.value.total) * 100).toFixed(1)
})

async function loadKpi() {
  try {
    const [evRes, dlRes] = await Promise.all([
      ucpApi.listEvents({ limit: 200 }).catch(() => ({ total: 0, items: [] } as any)),
      ucpApi.listDeadLetters({ limit: 200 }).catch(() => ({ total: 0, items: [] } as any)),
    ])
    const items = (evRes as any).items || []
    kpi.value.total = items.length
    kpi.value.completed = items.filter((e: any) => e.status === 'COMPLETED').length
    kpi.value.failed = items.filter((e: any) => e.status === 'FAILED').length
    kpi.value.dead = ((dlRes as any).items || []).length
  } catch (e) {
    console.warn('events kpi load error', e)
  }
}
onMounted(loadKpi)
</script>

<style scoped>
.events-tab .placeholder { padding: 80px 0; }
.events-tab .kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}
.kpi-card {
  background: #fff;
  border-radius: 8px;
  padding: 16px 20px;
  border: 1px solid #e5e6eb;
  border-left: 3px solid #c9cdd4;
}
.kpi-total { border-left-color: #3b82f6; }
.kpi-completed { border-left-color: #10b981; }
.kpi-failed { border-left-color: #ef4444; }
.kpi-dead { border-left-color: #6b7280; }
.kpi-warn { background: #fffbeb; }
.kpi-label { font-size: 12px; color: #8f959e; margin-bottom: 4px; }
.kpi-value { font-size: 24px; font-weight: 600; color: #1f2329; }
.kpi-sub { font-size: 11px; color: #8f959e; margin-top: 4px; }
.events-tab .sub-tabs { margin-bottom: 16px; }
.events-tab .sub-tabs :deep(.el-tabs__item) { font-size: 14px; }
.events-tab .sub-content { background: #fff; padding: 16px; border-radius: 6px; }
</style>
