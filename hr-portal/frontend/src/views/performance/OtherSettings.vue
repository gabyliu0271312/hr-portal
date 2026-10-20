<template>
  <section class="other-settings-page" :aria-busy="loading || saving">
    <h1>其他设置</h1>
    <div v-if="loadError" class="other-settings-page__error" role="alert">
      <span>{{ loadError }}</span>
      <PerformancePermissionButton :allowed="true" op="V" @click="loadSettings">重新加载</PerformancePermissionButton>
    </div>
    <PerformanceAuthorizationTransferCard :authorization-prompt="settings.authorization_prompt_zh" :transfer-prompt="settings.transfer_prompt_zh" :disabled="disabled" @show-example="showPending('查看示例')" @edit="editPrompt" />
    <PerformanceAuthorizationPromptDialog :key="promptKind" v-model="promptOpen" :kind="promptKind" :chinese="promptChinese" :english="promptEnglish" :saving="saving" :save-error="promptError" @confirm="savePrompt" />
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
      :tags="tagSettings.tags" :tags-loading="tagsLoading" :tags-error="tagsLoadError"
      @update:checked="saveSetting('reviewer_360_tags_enabled', $event)" @settings="editTags" @retry="loadTags"
    />
    <PerformanceReviewer360TagsDialog v-model="tagsOpen" :tags="tagSettings.tags" :version="tagSettings.version" :saving="saving" :save-error="tagsSaveError" @confirm="saveTags" />
    <PerformanceOtherSettingsToggleCard
      title="手动开通绩效结果" label="允许项目中选择「手动开通」方式"
      :checked="settings.manual_result_opening_enabled" :disabled="disabled"
      description="设置后，有权限的角色可在所有允许手动开通绩效结果的项目中，人工为有管理权限的被评估人开通绩效结果，不论被评估人的评估流程是否结束"
      @update:checked="saveSetting('manual_result_opening_enabled', $event)"
    />
    <PerformanceOtherSettingsOverdueCard :checked="overdueValues" :disabled="disabled" @update:checked="saveOverdue" @open-cycle-settings="openCycleSettings" />
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { performanceOtherSettingsApi, performanceReviewer360TagsApi, type PerformanceOtherSettings, type PerformanceReviewer360Tags } from '@/api/performance'
import { useUserStore } from '@/stores/user'
import PerformanceAuthorizationPromptDialog from '@/components/performance/PerformanceAuthorizationPromptDialog.vue'
import PerformanceAuthorizationTransferCard from '@/components/performance/PerformanceAuthorizationTransferCard.vue'
import PerformanceOtherSettings360Card from '@/components/performance/PerformanceOtherSettings360Card.vue'
import PerformanceOtherSettingsOverdueCard from '@/components/performance/PerformanceOtherSettingsOverdueCard.vue'
import PerformanceOtherSettingsToggleCard from '@/components/performance/PerformanceOtherSettingsToggleCard.vue'
import PerformanceReviewer360TagsDialog from '@/components/performance/PerformanceReviewer360TagsDialog.vue'
import PerformancePermissionButton from '@/components/performance/PerformancePermissionButton.vue'
const router = useRouter()
const defaultChinese = '请确保授权对象有所选环节的操作资格，避免错误授权泄露敏感数据。'
const defaultEnglish = 'To prevent sensitive data exposure, please ensure that the authorized individuals has permission for the selected steps.'
const defaultTransferChinese = '请确保转交对象有所选环节的操作资格，避免错误授权泄露敏感数据。'
const defaultTransferEnglish = 'To prevent sensitive data exposure, please ensure that the transferee has permission for the selected steps.'
const promptKind = ref<'authorization' | 'transfer'>('authorization')
const promptOpen = ref(false)
const promptError = ref('')
type ToggleKey = { [K in keyof PerformanceOtherSettings]-?: PerformanceOtherSettings[K] extends boolean ? K : never }[keyof PerformanceOtherSettings]
const settings = ref<PerformanceOtherSettings>({
  authorization_prompt_zh: defaultChinese,
  authorization_prompt_en: defaultEnglish,
  transfer_prompt_zh: defaultTransferChinese,
  transfer_prompt_en: defaultTransferEnglish,
  calibration_authorization_outside_direct_reports_enabled: true,
  calibration_import_enabled: true,
  performance_coefficient_enabled: false,
  reviewer_360_tags_enabled: true,
  manual_result_opening_enabled: true,
  overdue_single_submission_enabled: true,
  overdue_voluntary_360_submission_enabled: false,
  cycle_overdue_submission_override_enabled: false,
})
const promptChinese = computed(() => promptKind.value === 'transfer' ? settings.value.transfer_prompt_zh || defaultTransferChinese : settings.value.authorization_prompt_zh || defaultChinese)
const promptEnglish = computed(() => promptKind.value === 'transfer' ? settings.value.transfer_prompt_en || defaultTransferEnglish : settings.value.authorization_prompt_en || defaultEnglish)
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
async function saveSetting(key: ToggleKey, value: boolean) {
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
function editPrompt(key: 'authorization' | 'transfer') {
  if (disabled.value) return
  promptKind.value = key
  promptError.value = ''
  promptOpen.value = true
}
async function savePrompt(payload: { authorization_prompt_zh: string; authorization_prompt_en: string } | { transfer_prompt_zh: string; transfer_prompt_en: string }) {
  if (disabled.value) return
  saving.value = true
  promptError.value = ''
  try {
    settings.value = await performanceOtherSettingsApi.update(payload)
    promptOpen.value = false
    ElMessage.success('保存成功')
  } catch (error: any) {
    const detail = error?.response?.data?.detail
    promptError.value = typeof detail === 'string' ? detail : `${promptKind.value === 'transfer' ? '转交' : '授权'}提示保存失败，请重试`
  } finally {
    saving.value = false
  }
}
function showPending(action: string) {
  ElMessage.info(`${action}将在下一步开放`)
}
function openCycleSettings() {
  if (disabled.value || !settings.value.cycle_overdue_submission_override_enabled) return
  void router?.push({ name: 'PerformanceCycles' })
}
const tagSettings = ref<PerformanceReviewer360Tags>({ tags: [], version: 0 })
const tagsOpen = ref(false)
const tagsLoaded = ref(false)
const tagsLoading = ref(true)
const tagsLoadError = ref('')
const tagsSaveError = ref('')
async function loadTags() {
  if (saving.value) return
  tagsLoading.value = true
  tagsLoaded.value = false
  tagsLoadError.value = ''
  try { tagSettings.value = await performanceReviewer360TagsApi.get(); tagsLoaded.value = true }
  catch { tagsLoadError.value = '标签加载失败，请重新加载' }
  finally { tagsLoading.value = false }
}
function editTags() {
  if (disabled.value || tagsLoading.value || !tagsLoaded.value) return
  tagsSaveError.value = ''
  tagsOpen.value = true
}
async function saveTags(payload: PerformanceReviewer360Tags) {
  if (disabled.value || !tagsLoaded.value) return
  saving.value = true
  tagsSaveError.value = ''
  try {
    tagSettings.value = await performanceReviewer360TagsApi.update(payload)
    tagsOpen.value = false
    ElMessage.success('保存成功')
  } catch (error: any) {
    const detail = error?.response?.data?.detail
    tagsSaveError.value = error?.response?.status === 409 ? '标签已被其他管理员修改，请关闭并重新打开后再试' : typeof detail === 'string' ? detail : '标签保存失败，请重试'
    if (error?.response?.status === 409) tagsLoaded.value = false
  } finally { saving.value = false }
}
watch(tagsOpen, open => { if (!open && !tagsLoaded.value) void loadTags() })
onMounted(() => { void loadSettings(); void loadTags() })
</script>
<style scoped>
.other-settings-page { min-height: 0; color: var(--color-text-primary); font-family: var(--font-sans); }
.other-settings-page > h1 { margin: 0 0 var(--spacing-4); color: var(--color-text-primary); font-size: 18px; font-weight: 600; line-height: 26px; }
.other-settings-page__error { display: flex; align-items: center; gap: var(--spacing-3); margin-bottom: var(--spacing-4); color: var(--color-danger); }
</style>
