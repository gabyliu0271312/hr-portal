<template>
  <section class="other-settings-page" :aria-busy="loading || saving">
    <h1>其他设置</h1>
    <div v-if="loadError" class="other-settings-page__error" role="alert">
      <span>{{ loadError }}</span>
      <PerformancePermissionButton :allowed="true" op="V" @click="loadSettings">重新加载</PerformancePermissionButton>
    </div>
    <PerformanceAuthorizationTransferCard @show-example="showPending('查看示例')" @edit="showPending('编辑提示')" />
    <PerformanceOtherSettingsToggleCard
      title="授权校准设置" label="可授予校准人实线下级以外的人员"
      :checked="settings.calibration_authorization_outside_direct_reports_enabled" :disabled="disabled"
      helper="勾选后，校准人授权校准任务以及项目管理角色协助授权校准任务时，可授予校准人实线下级以外的人员"
      @update:checked="saveSetting('calibration_authorization_outside_direct_reports_enabled', $event)"
    />
    <PerformanceOtherSettingsToggleCard
      title="校准导入设置" label="启用校准导入功能"
      :checked="settings.calibration_import_enabled" :disabled="disabled"
      helper="勾选后，校准人可在校准任务截止前，批量导入校准结果。"
      @update:checked="saveSetting('calibration_import_enabled', $event)"
    />
    <PerformanceOtherSettingsToggleCard
      title="绩效系数设置" label="启用绩效系数"
      :checked="settings.performance_coefficient_enabled" :disabled="disabled"
      helper="可在考核中给不同绩效评级结果设置不同的绩效系数，在绩效评估时可进行调整。勾选后需在「评估题管理」中进行配置。"
      @update:checked="saveSetting('performance_coefficient_enabled', $event)"
    />
    <PerformanceOtherSettings360Card
      :checked="settings.reviewer_360_tags_enabled" :disabled="disabled"
      @update:checked="saveSetting('reviewer_360_tags_enabled', $event)" @settings="showPending('标签设置')"
    />
    <PerformanceOtherSettingsToggleCard
      title="手动开通绩效结果" label="允许项目中选择「手动开通」方式"
      :checked="settings.manual_result_opening_enabled" :disabled="disabled"
      description="设置后，有权限的角色可在所有允许手动开通绩效结果的项目中，人工为有管理权限的被评估人开通绩效结果，不论被评估人的评估流程是否结束"
      @update:checked="saveSetting('manual_result_opening_enabled', $event)"
    />
    <PerformanceOtherSettingsOverdueCard :checked="overdueValues" :disabled="disabled" @update:checked="saveOverdue" />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { performanceOtherSettingsApi, type PerformanceOtherSettings } from '@/api/performance'
import { useUserStore } from '@/stores/user'
import PerformanceAuthorizationTransferCard from '@/components/performance/PerformanceAuthorizationTransferCard.vue'
import PerformanceOtherSettings360Card from '@/components/performance/PerformanceOtherSettings360Card.vue'
import PerformanceOtherSettingsOverdueCard from '@/components/performance/PerformanceOtherSettingsOverdueCard.vue'
import PerformanceOtherSettingsToggleCard from '@/components/performance/PerformanceOtherSettingsToggleCard.vue'
import PerformancePermissionButton from '@/components/performance/PerformancePermissionButton.vue'

const settings = ref<PerformanceOtherSettings>({
  calibration_authorization_outside_direct_reports_enabled: true,
  calibration_import_enabled: true,
  performance_coefficient_enabled: false,
  reviewer_360_tags_enabled: true,
  manual_result_opening_enabled: true,
  overdue_single_submission_enabled: true,
  overdue_voluntary_360_submission_enabled: false,
  cycle_overdue_submission_override_enabled: false,
})
const userStore = useUserStore()
const loading = ref(true)
const loaded = ref(false)
const saving = ref(false)
const loadError = ref('')
const disabled = computed(() => !loaded.value || loading.value || saving.value || !userStore.hasOp('performance.admin', 'U'))
const overdueKeys = ['overdue_single_submission_enabled', 'overdue_voluntary_360_submission_enabled', 'cycle_overdue_submission_override_enabled'] as const
const overdueValues = computed(() => overdueKeys.map(key => settings.value[key]))

async function loadSettings() {
  loading.value = true
  loaded.value = false
  loadError.value = ''
  try {
    settings.value = await performanceOtherSettingsApi.get()
    loaded.value = true
  } catch (error: any) {
    loadError.value = error?.response?.data?.detail || '其他设置加载失败，请重新加载'
  } finally {
    loading.value = false
  }
}

async function saveSetting(key: keyof PerformanceOtherSettings, value: boolean) {
  if (disabled.value || settings.value[key] === value) return
  const previous = { ...settings.value }
  settings.value = { ...previous, [key]: value }
  saving.value = true
  try {
    settings.value = await performanceOtherSettingsApi.update({ [key]: value })
    ElMessage.success('保存成功')
  } catch (error: any) {
    settings.value = previous
    ElMessage.error(error?.response?.data?.detail || '其他设置保存失败，请重试')
  } finally {
    saving.value = false
  }
}

function saveOverdue(values: boolean[]) {
  const key = overdueKeys.find((key, index) => values[index] !== settings.value[key])
  if (key) void saveSetting(key, values[overdueKeys.indexOf(key)])
}

function showPending(action: string) {
  ElMessage.info(`${action}将在下一步开放`)
}

onMounted(loadSettings)
</script>

<style scoped>
.other-settings-page { min-height: 0; color: var(--color-text-primary); font-family: var(--font-sans); }
.other-settings-page > h1 { margin: 0 0 var(--spacing-4); color: var(--color-text-primary); font-size: 18px; font-weight: 600; line-height: 26px; }
.other-settings-page__error { display: flex; align-items: center; gap: var(--spacing-3); margin-bottom: var(--spacing-4); color: var(--color-danger); }
</style>
