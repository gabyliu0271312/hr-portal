<template>
  <div class="reminder-preview-card">
    <div class="reminder-preview-card__heading">飞书推送</div>
    <div class="reminder-preview-card__bot">
      <div class="reminder-preview-card__bot-header">
        <h1 class="reminder-preview-card__bot-title">{{ preview.title }}</h1>
      </div>
      <div class="reminder-preview-card__bot-body">
        <p class="reminder-preview-card__line reminder-preview-card__description" v-html="highlightMentions(preview.description)"></p>
        <div class="reminder-preview-card__line">
          <h2 class="reminder-preview-card__subheading">{{ preview.stage_type }}</h2>
          <p v-if="preview.deadline_at">截止时间：{{ formatDateTime(preview.deadline_at) }}（GMT+8）</p>
        </div>
        <div class="reminder-preview-card__line">
          <p v-if="preview.cycle_name">评估周期：{{ preview.cycle_name }}</p>
          <p v-if="preview.cycle_start_at || preview.cycle_end_at">周期范围：{{ formatPeriod(preview.cycle_start_at) }} - {{ formatPeriod(preview.cycle_end_at) }}</p>
        </div>
        <p class="reminder-preview-card__line reminder-preview-card__reminder" v-html="highlightMentions(`提醒人：@${preview.reminder_name}`)"></p>
        <button type="button" class="reminder-preview-card__action" disabled>前往飞书绩效</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PerformanceReminderPreview } from '@/api/performance'

const props = withDefaults(defineProps<{
  preview: PerformanceReminderPreview | null
}>(), { preview: null })

const preview = computed(() => props.preview || { title: '', description: '', stage_label: '', deadline_at: null, cycle_name: '', cycle_start_at: null, cycle_end_at: null, reminder_name: '', stage_type: '' })

const format = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const part = (type: string) => parts.find(item => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`
}
const formatDateTime = (value?: string | null) => format(value)
const formatPeriod = (value?: string | null) => (value ? format(value) : '')
function highlightMentions(text: string) {
  return text.replace(/@([^\s，。,；;]+)/g, '<span class="reminder-preview-card__name">@$1</span>')
}
</script>

<style scoped>
.reminder-preview-card{min-width:320px;padding:16px 12px;box-sizing:border-box;color:#1f2329;font-family:'Helvetica Neue',Tahoma,'PingFang SC','Microsoft Yahei',Arial,sans-serif}.reminder-preview-card__heading{margin:0 0 16px;color:#1f2329;font-size:14px;font-weight:500;line-height:22px}.reminder-preview-card__bot{margin-top:8px;box-sizing:border-box;border:1px solid #dee0e3;border-radius:8px;background:#fff;overflow:hidden}.reminder-preview-card__bot-header{padding:12px 16px 0;background:#f5f8ff}.reminder-preview-card__bot-title{margin:0;color:#1f2329;font-size:16px;font-weight:600;line-height:24px}.reminder-preview-card__bot-body{padding:8px 16px 16px;color:#1f2329;font-size:14px;line-height:22px}.reminder-preview-card__line{margin:0 0 8px}.reminder-preview-card__line:last-child{margin-bottom:0}.reminder-preview-card__description{margin-bottom:8px}:deep(.reminder-preview-card__name){color:#3370ff;font-weight:600}.reminder-preview-card__subheading{margin:0;color:#1f2329;font-size:14px;font-weight:600;line-height:22px}.reminder-preview-card__reminder{margin-bottom:0}.reminder-preview-card__action{display:inline-flex;align-items:center;justify-content:center;min-width:80px;height:32px;margin-top:8px;padding:4px 11px;box-sizing:border-box;border:1px solid #3370ff;border-radius:6px;background:#fff;color:#3370ff;cursor:default;font:400 14px/22px var(--font-sans)}.reminder-preview-card__action:disabled{color:#3370ff;opacity:1}
</style>
