<template>
  <PerformanceGridCard class="completion-node-card">
    <div class="card-title">
      <span class="title-text">{{ node.title }}</span>
      <slot name="header-extra" />
    </div>
    <div class="card-progress" :class="{ 'no-start': node.status === 'not_started' }">{{ node.progress }}</div>
    <div class="card-desc"><span class="desc-icon"><YesOutlinedIcon /></span><span class="status-text">完成情况：{{ node.completionStatus || '--' }}</span></div>
    <div class="card-desc card-bottom">
      <span class="desc-time"><span class="desc-icon"><TimeOutlinedIcon /></span><span class="time-text">截止时间：{{ node.deadline || '--' }}</span></span>
      <slot name="actions" />
    </div>
  </PerformanceGridCard>
</template>

<script setup lang="ts">
import PerformanceGridCard from './PerformanceGridCard.vue'
import YesOutlinedIcon from './YesOutlinedIcon.vue'
import TimeOutlinedIcon from './TimeOutlinedIcon.vue'

export interface CompletionNode {
  key: string
  title: string
  progress: string
  completionStatus?: string | null
  deadline: string | null
  status?: 'active' | 'completed' | 'not_started' | 'overdue' | 'unavailable'
}

defineProps<{
  node: CompletionNode
}>()
</script>

<style scoped>
.completion-node-card { --grid-card-padding: 16px; }
.card-title { display: flex; align-items: center; min-width: 0; min-height: 0; max-width: 100%; margin-bottom: 4px; line-height: 22px; }
.title-text { min-width: 0; overflow: hidden; margin-right: auto; font-size: 14px; font-weight: 600; line-height: 22px; white-space: nowrap; text-overflow: ellipsis; }
.card-progress { min-width: 0; min-height: 0; margin-bottom: 12px; font-family: 'DIN Alternate', 'LarkHackSafariFont', sans-serif; font-size: 28px; font-weight: 400; line-height: 32px; color: #3370ff; }
.card-progress.no-start { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif; font-size: 20px; font-weight: 600; color: #8f959e; }
.card-desc { display: flex; align-items: center; min-width: 0; min-height: 0; margin-top: 4px; font-size: 12px; font-weight: 400; line-height: 20px; color: #646a73; }
.card-bottom { justify-content: space-between; }
.desc-icon { display: block; flex: 0 0 12px; width: 12px; height: 12px; margin-right: 4px; align-self: center; color: #646a73; line-height: 0; }
.desc-icon svg { display: block; width: 100%; height: 100%; }
.desc-time { display: flex; min-width: 0; align-items: center; }
.time-text { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
</style>
