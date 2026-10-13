<template>
  <section class="notification-settings-card" aria-label="通知设置策略" :aria-busy="saving" @click.capture="blockBusyClick" @keydown.capture="blockBusyKeydown">
    <p class="notification-settings-card__notice">修改后自动保存；保存失败会恢复原设置。</p>
    <span class="notification-settings-card__sr-only" role="status">{{ saving ? '保存中…' : '' }}</span>
    <h2>通知设置</h2>
    <PerformanceNotificationRadioSection
      title="绩效校准期间发送结果变更通知"
      description="在绩效校准期间，当某人的终评绩效结果（包括评语）被修改时，通知对应人员的直属上级、虚线上级和 HRBP。"
      :selected="settings.calibration_delivery_mode"
      :disabled="saving"
      name="calibration-notification"
      :options="calibrationOptions"
      @update:selected="updateCalibration"
    />
    <div class="notification-settings-card__divider" aria-hidden="true" />
    <PerformanceNotificationRadioSection
      title="绩效结果变更通知"
      description="在开通绩效结果后，当被评估人可查看的绩效结果内容发生变更时，会实时通知被评估人。"
      :selected="settings.result_change_notification_scope"
      :disabled="saving"
      name="result-notification"
      :options="resultOptions"
      @update:selected="updateResult"
    />
    <div class="notification-settings-card__divider" aria-hidden="true" />
    <section class="notification-settings-card__other">
      <h3>其他通知设置</h3>
      <PerformanceNotificationRuleSummary
        v-for="rule in rules"
        :key="rule.key"
        :label="rule.label"
        :enabled="settings[rule.key]"
        :frequency="rule.frequency"
        :time="rule.time"
        holiday-policy="不屏蔽"
        @update:enabled="updateRule(rule.key, $event)"
      />
    </section>
  </section>
</template>

<script setup lang="ts">
import type { PerformanceNotificationSettings, PerformanceNotificationSettingsPayload, PerformanceNotificationRuleKey } from '@/api/performance'
import PerformanceNotificationRadioSection from './PerformanceNotificationRadioSection.vue'
import PerformanceNotificationRuleSummary from './PerformanceNotificationRuleSummary.vue'

const props = withDefaults(defineProps<{ settings: PerformanceNotificationSettings; saving?: boolean }>(), { saving: false })
const emit = defineEmits<{
  (event: 'request-save', payload: PerformanceNotificationSettingsPayload): void
  (event: 'request-disable', key: PerformanceNotificationRuleKey): void
}>()

const calibrationOptions = [
  { value: 'realtime', label: '实时发送', showInfo: true },
  { value: 'after_calibration', label: '校准结束后合并发送', showInfo: true },
]
const resultOptions = [
  { value: 'final_score_grade', label: '仅在终评绩效结果（评分评级）发生变更时通知', showInfo: true },
  { value: 'any_content', label: '任意内容发生变更时通知', showInfo: true },
]
const rules = [
  { key: 'todo_task_notification_enabled', label: '待办任务通知', frequency: '以天为单位重复', time: '环节截止前每 1 天的 10:00:00(人员所在时区)' },
  { key: 'progress_daily_notification_enabled', label: '绩效进度日报通知', frequency: '以天为单位重复', time: '环节截止前每 1 天的 18:00:00(人员所在时区)' },
  { key: 'stage_start_notification_enabled', label: '环节启动通知', frequency: '环节开始时发送一次', time: '到达环节开始时间时' },
] as const

function updateCalibration(value: string) {
  if (!props.saving && value !== props.settings.calibration_delivery_mode && (value === 'realtime' || value === 'after_calibration')) {
    emit('request-save', { calibration_delivery_mode: value })
  }
}

function updateResult(value: string) {
  if (!props.saving && value !== props.settings.result_change_notification_scope && (value === 'final_score_grade' || value === 'any_content')) {
    emit('request-save', { result_change_notification_scope: value })
  }
}

function blockBusyClick(event: MouseEvent) {
  if (!props.saving) return
  if ((event.target as Element).closest('.notification-rule-summary__name, .notification-radio-section')) {
    event.preventDefault()
    event.stopPropagation()
  }
}

function blockBusyKeydown(event: KeyboardEvent) {
  if (!props.saving || ![' ', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
  if ((event.target as Element).closest('input[type="checkbox"], input[type="radio"]')) {
    event.preventDefault()
    event.stopPropagation()
  }
}

function updateRule(key: typeof rules[number]['key'], value: boolean) {
  if (props.saving || value === props.settings[key]) return
  if (!value) {
    emit('request-disable', key)
    return
  }
  const payload: PerformanceNotificationSettingsPayload = {}
  payload[key] = true
  emit('request-save', payload)
}
</script>

<style scoped>
.notification-settings-card{box-sizing:border-box;width:100%;min-width:0;margin-bottom:16px;padding:20px;border-radius:8px;background:#fff;box-shadow:rgba(31,35,41,.03) 0 4px 16px 4px,rgba(31,35,41,.02) 0 4px 8px,rgba(31,35,41,.02) 0 2px 4px -4px;color:#1f2329;font-family:var(--font-sans)}
.notification-settings-card h2{margin:0 0 12px;font-size:16px;font-weight:600;line-height:24px}
.notification-settings-card h3{margin:0;font-size:14px;font-weight:600;line-height:22px}
.notification-settings-card__notice{min-height:20px;margin:0 0 12px;color:#646a73;font-size:12px;line-height:20px}
.notification-settings-card__sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
.notification-settings-card__divider{margin:16px 0;border-top:1px dashed #dee0e3}
.notification-settings-card__other{min-width:0}
@media (max-width:720px){.notification-settings-card{padding:16px}}
</style>
