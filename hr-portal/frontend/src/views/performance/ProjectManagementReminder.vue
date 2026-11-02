<template>
  <main class="project-reminder-page">
    <PerformanceTaskHeader :title="title" @back="goBack" />
    <div class="project-reminder-page__body">
      <p v-if="error" role="alert">{{ error }}</p>
      <PerformanceReminderPanel v-else
        :context="context"
        mode="cycle-remind"
        select-all-available
        selection-bar-target="body"
        :description="description"
      />
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { projectManagementApi, type ProjectManagementCompletionNode } from '@/api/performance'
import { useRoute, useRouter } from 'vue-router'
import PerformanceTaskHeader from '@/components/performance/PerformanceTaskHeader.vue'
import PerformanceReminderPanel from '@/components/performance/PerformanceReminderPanel.vue'
import type { ReminderContext } from '@/components/performance/performanceReminder'

const route = useRoute()
const router = useRouter()
const nodeKey = computed(() => String(route.query.node_key || 'manager-review'))
const cycleId = computed(() => Number(route.query.cycle_id || 0))
const department = computed(() => String(route.query.department || ''))
const node = ref<ProjectManagementCompletionNode | null>(null)
const error = ref('')
let sequence = 0
const title = computed(() => node.value?.title || '绩效任务')
const description = computed(() => {
  if (!node.value) return ''
  const rate = route.query.completion_rate ? `${Number(route.query.completion_rate).toFixed(2)}%` : (node.value.completion_rate?.toFixed(2) ?? '--') + '%'
  const completed = route.query.completed ?? node.value.completed_count ?? '--'
  const total = route.query.total ?? node.value.total_count ?? '--'
  const deadline = node.value.deadline_at ? new Date(node.value.deadline_at).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 16) + '（GMT+8）' : '--'
  return `完成率：${rate}　|　完成情况：${completed}/${total}　|　截止时间：${deadline}`
})
watch([nodeKey, cycleId], async () => {
  const current = ++sequence
  node.value = null
  error.value = ''
  try {
    const result = await projectManagementApi.overview(cycleId.value)
    if (current === sequence) node.value = result.completion_nodes?.find(item => item.key === nodeKey.value) || null
  } catch { if (current === sequence) error.value = '绩效环节加载失败，请返回后重试' }
}, { immediate: true })
const context = computed<ReminderContext>(() => ({
  projectId: 0,
  cycleId: cycleId.value,
  nodeId: nodeKey.value,
  nodeType: nodeKey.value,
  reviewType: 'project_management_reminder',
  title: title.value,
  sectionTitle: '未完成的被评估人',
  departmentPath: department.value || undefined,
}))

function goBack() {
  void router.push({ name: 'PerformanceProjectManagement', query: { cycle_id: String(cycleId.value), view: String(route.query.view || '') } })
}
</script>

<style scoped>
:where(.project-management-page, .project-reminder-page, .authorization-records, .calibration-authorization) { font-family: 'Helvetica Neue', Tahoma, 'PingFang SC', 'Microsoft Yahei', Arial, 'Hiragino Sans GB', sans-serif; }

.project-reminder-page { position:relative; display: flex; width: 100vw; height: 100vh; min-width: 0; min-height: 0; flex-direction: column; overflow: hidden; background: #f5f6f7; color: #1f2329; }
.project-reminder-page__body { position: relative; z-index: 0; min-width: 0; min-height: 0; flex: 1; overflow: auto; padding: calc(var(--layout-topbar-height) + 20px) 24px 60px; }
.project-reminder-page__body :deep(.performance-reminder-panel__heading) { margin-bottom: 16px; }
</style>
