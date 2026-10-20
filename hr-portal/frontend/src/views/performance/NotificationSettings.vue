<template>
  <div class="notification-settings-page">
    <h1>通知设置</h1>
    <div v-if="loadError" class="notification-settings-error" role="alert">
      <span>{{ loadError }}</span>
      <button type="button" @click="loadSettings">重新加载</button>
    </div>
    <PerformanceNotificationMethodsCard
      v-else
      :email-enabled="emailEnabled"
      :loading="loading || saving"
      @update:email-enabled="toggleEmail"
    />
    <PerformanceNotificationSettingsCard
      v-if="loaded && !loadError && settings"
      :settings="settings"
      :saving="saving"
      @request-save="saveSettings"
      @request-disable="askDisable"
      @edit-todo="openRuleEditor('todo_task_rule')"
      @edit-progress-daily="openRuleEditor('progress_daily_rule')"
    />
    <PerformanceTodoNotificationDialog
      :model-value="editingRule !== null"
      :title="editingRule === 'progress_daily_rule' ? '编辑绩效进度日报通知' : '编辑待办任务通知'"
      :rule="editingRule === 'progress_daily_rule' ? settings?.progress_daily_rule || defaultProgressDailyNotificationRule() : settings?.todo_task_rule"
      :saving="saving"
      :save-error="ruleSaveError"
      @update:model-value="!$event && (editingRule = null)"
      @confirm="saveRule"
    />
    <PerformanceNotificationDisableConfirm
      :model-value="pendingDisable !== null"
      :saving="saving"
      @keep="keepDisable"
      @confirm="confirmDisable"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  performanceNotificationSettingsApi,
  type PerformanceNotificationSettings,
  type PerformanceNotificationSettingsPayload,
  type PerformanceNotificationRuleKey,
  type PerformanceTodoNotificationRule,
} from '@/api/performance'
import PerformanceNotificationMethodsCard from '@/components/performance/PerformanceNotificationMethodsCard.vue'
import PerformanceNotificationSettingsCard from '@/components/performance/PerformanceNotificationSettingsCard.vue'
import PerformanceTodoNotificationDialog from '@/components/performance/PerformanceTodoNotificationDialog.vue'
import PerformanceNotificationDisableConfirm from '@/components/performance/PerformanceNotificationDisableConfirm.vue'
import { defaultProgressDailyNotificationRule } from '@/components/performance/performanceTodoNotificationRule'

const emailEnabled = ref(false)
const settings = ref<PerformanceNotificationSettings | null>(null)
const pendingDisable = ref<PerformanceNotificationRuleKey | null>(null)
const loaded = ref(false)
const loading = ref(false)
const saving = ref(false)
const loadError = ref('')
const editingRule = ref<'todo_task_rule' | 'progress_daily_rule' | null>(null)
const ruleSaveError = ref('')

function openRuleEditor(key: 'todo_task_rule' | 'progress_daily_rule') {
  if (saving.value || pendingDisable.value || editingRule.value || !settings.value) return
  ruleSaveError.value = ''
  editingRule.value = key
}

async function saveRule(rule: PerformanceTodoNotificationRule) {
  const key = editingRule.value
  if (saving.value || !settings.value || !key) return
  ruleSaveError.value = ''
  saving.value = true
  try {
    applySettings(await performanceNotificationSettingsApi.update({ [key]: rule }))
    editingRule.value = null
    ElMessage.success('保存成功')
  } catch (error: any) {
    ruleSaveError.value = typeof error?.response?.data?.detail === 'string' ? error.response.data.detail : '通知规则保存失败，请重试'
  } finally {
    saving.value = false
  }
}

function applySettings(next: PerformanceNotificationSettings) {
  emailEnabled.value = next.email_enabled
  settings.value = next
}

async function loadSettings() {
  loading.value = true
  loaded.value = false
  settings.value = null
  pendingDisable.value = null
  editingRule.value = null
  ruleSaveError.value = ''
  loadError.value = ''
  try {
    applySettings(await performanceNotificationSettingsApi.get())
    loaded.value = true
  } catch (error: any) {
    loadError.value = error?.response?.data?.detail || '通知设置加载失败'
  } finally {
    loading.value = false
  }
}

async function saveSettings(payload: PerformanceNotificationSettingsPayload) {
  if (!settings.value || saving.value) return false
  const previous = settings.value
  const disablingRule = payload.todo_task_notification_enabled === false
    || payload.progress_daily_notification_enabled === false
    || payload.stage_start_notification_enabled === false
  if (!disablingRule) applySettings({ ...previous, ...payload })
  saving.value = true
  try {
    applySettings(await performanceNotificationSettingsApi.update(payload))
    ElMessage.success('保存成功')
    return true
  } catch (error: any) {
    applySettings(previous)
    ElMessage.error(error?.response?.data?.detail || '通知设置保存失败')
    return false
  } finally {
    saving.value = false
  }
}

function askDisable(key: PerformanceNotificationRuleKey) {
  if (!saving.value && settings.value?.[key] && pendingDisable.value === null) {
    pendingDisable.value = key
  }
}

function keepDisable() {
  if (!saving.value) pendingDisable.value = null
}

async function confirmDisable() {
  const key = pendingDisable.value
  if (!key || saving.value) return
  const payload: PerformanceNotificationSettingsPayload = {}
  payload[key] = false
  if (await saveSettings(payload)) pendingDisable.value = null
}

async function toggleEmail(value: boolean) {
  await saveSettings({ email_enabled: value })
}

onMounted(loadSettings)
</script>

<style scoped>
.notification-settings-page{min-height:0;color:#1f2329;font-family:var(--font-sans)}
.notification-settings-page>h1{margin:0 0 16px;font-size:20px;font-weight:600;line-height:28px}
.notification-settings-error{display:flex;min-height:168px;align-items:center;justify-content:center;gap:12px;border-radius:8px;background:#fff;color:#646a73}
.notification-settings-error button{padding:0;border:0;background:transparent;color:#3370ff;cursor:pointer;font:inherit}
</style>
