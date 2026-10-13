<template>
  <section class="assessment-method-settings-page">
    <h1>考核方式设置</h1>
    <PerformanceAssessmentMethodCard
      :model-value="metricAssessmentEnabled"
      :disabled="metricSettingsSaving"
      :instant="!metricSettingsHydrated"
      title="关键指标考核"
      description="在项目中让各成员制定并确认关键指标，并在绩效评估时考核指标完成情况；适用于 KPI（关键业绩指标）、PBC（个人绩效承诺） 等考核场景。"
      help-href="https://bytedance.feishu.cn/docx/Xbp8daLOJoUwFpxagGNcQFupnZd"
      @update:model-value="toggleMetricAssessment"
    />
    <div v-if="metricSettingsError" class="assessment-method-settings-page__error" role="alert">
      <span>{{ metricSettingsError }}</span>
      <button type="button" @click="loadMetricSettings">重新加载</button>
    </div>
    <PerformanceProjectAssessmentCard
      v-model="projectAssessmentEnabled"
      v-model:project-result-visible="projectResultVisible"
      @edit-roles="roleDialogOpen = true"
    />
    <PerformanceProjectRoleDialog v-model="roleDialogOpen" />
  </section>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import {
  performanceAssessmentMethodSettingsApi,
  type PerformanceAssessmentMethodSettings,
} from '@/api/performance'
import { performanceMetricAssessmentEnabled } from '@/utils/performanceAdminNavigation'
import PerformanceAssessmentMethodCard from '@/components/performance/PerformanceAssessmentMethodCard.vue'
import PerformanceProjectAssessmentCard from '@/components/performance/PerformanceProjectAssessmentCard.vue'
import PerformanceProjectRoleDialog from '@/components/performance/PerformanceProjectRoleDialog.vue'

const metricAssessmentEnabled = performanceMetricAssessmentEnabled
const metricSettingsLoading = ref(true)
const metricSettingsHydrated = ref(false)
const metricSettingsSaving = ref(false)
const metricSettingsError = ref('')
const projectAssessmentEnabled = ref(true)
const projectResultVisible = ref(false)
const roleDialogOpen = ref(false)

function applyMetricSettings(settings: PerformanceAssessmentMethodSettings) {
  metricAssessmentEnabled.value = settings.metric_assessment_enabled
  performanceMetricAssessmentEnabled.value = settings.metric_assessment_enabled
}

async function loadMetricSettings() {
  metricSettingsLoading.value = true
  metricSettingsError.value = ''
  try {
    applyMetricSettings(await performanceAssessmentMethodSettingsApi.get())
  } catch (error: any) {
    metricSettingsError.value = error?.response?.data?.detail || '关键指标考核设置加载失败'
    metricAssessmentEnabled.value = false
    performanceMetricAssessmentEnabled.value = false
  } finally {
    await nextTick()
    metricSettingsLoading.value = false
    metricSettingsHydrated.value = true
  }
}

async function toggleMetricAssessment(value: boolean) {
  if (metricSettingsSaving.value) return
  const previous = metricAssessmentEnabled.value
  metricAssessmentEnabled.value = value
  performanceMetricAssessmentEnabled.value = value
  metricSettingsSaving.value = true
  metricSettingsError.value = ''
  try {
    applyMetricSettings(await performanceAssessmentMethodSettingsApi.update({ metric_assessment_enabled: value }))
  } catch (error: any) {
    metricAssessmentEnabled.value = previous
    performanceMetricAssessmentEnabled.value = previous
    metricSettingsError.value = error?.response?.data?.detail || '关键指标考核设置保存失败'
  } finally {
    metricSettingsSaving.value = false
  }
}

onMounted(loadMetricSettings)
</script>

<style scoped>
.assessment-method-settings-page{min-height:0;color:#1f2329;font-family:var(--font-sans)}
.assessment-method-settings-page>h1{margin:0 0 16px;color:#1f2329;font-size:20px;font-weight:600;line-height:28px}
.assessment-method-settings-page__error{display:flex;align-items:center;gap:12px;margin-bottom:16px;padding:12px 16px;border-radius:8px;background:#fff1f0;color:#d54941;font-size:14px;line-height:21px}
.assessment-method-settings-page__error button{padding:0;border:0;background:transparent;color:#1456f0;cursor:pointer;font:inherit}
</style>
