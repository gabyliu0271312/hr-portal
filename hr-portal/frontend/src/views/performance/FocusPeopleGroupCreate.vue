<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { performanceFocusGroupApi, hasCompleteScopeRule, toFeishuScopes } from '@/api/performance'
import type { PerformanceAudienceGroup, PerformanceEvaluatorOptions, PerformanceHrbpOrganizationNode } from '@/api/performance'
import type { PerformanceSearchSelectOption } from '@/components/performance/PerformanceSearchSelect.vue'
import UiFullScreenModal from '@/components/ui/UiFullScreenModal.vue'
import UiButton from '@/components/ui/UiButton.vue'
import PerformanceSurfaceCard from '@/components/performance/PerformanceSurfaceCard.vue'
import PerformanceFormItem from '@/components/performance/PerformanceFormItem.vue'
import PerformanceLocalizedInput from '@/components/performance/PerformanceLocalizedInput.vue'
import PerformanceRadioGroup from '@/components/performance/PerformanceRadioGroup.vue'
import PerformancePersonSelect from '@/components/performance/PerformancePersonSelect.vue'
import PerformanceAudienceRuleEditor from '@/components/performance/PerformanceAudienceRuleEditor.vue'
import PerformanceScopeCount from '@/components/performance/PerformanceScopeCount.vue'
import PerformanceSwitchSettingRow from '@/components/performance/PerformanceSwitchSettingRow.vue'
import PerformanceDateTimeField from '@/components/performance/PerformanceDateTimeField.vue'
import PerformanceTimeField from '@/components/performance/PerformanceTimeField.vue'
import PerformanceCheckbox from '@/components/performance/PerformanceCheckbox.vue'
import UiTagColorField from '@/components/ui/UiTagColorField.vue'
import UiOptionDetail from '@/components/ui/UiOptionDetail.vue'
import { PERFORMANCE_GROUP_TAG_COLORS } from '@/components/performance/performanceColorOptions'
import FocusPeopleGroupProjectCreate from './FocusPeopleGroupProjectCreate.vue'

const route = useRoute()
const router = useRouter()
const isProjectTab = computed(() => route.query.tab === 'project')
const cycleId = computed(() => {
  const value = Number(route.params.cycleId)
  return Number.isInteger(value) && value > 0 ? value : null
})
const groupId = computed(() => Number(route.params.groupId) || null)
const isEditing = computed(() => groupId.value !== null)
const detailLoaded = ref(false)
const detailError = ref('')
const employeeNos = ref<string[]>([])
const tagColor = ref(PERFORMANCE_GROUP_TAG_COLORS[0].value)
const textColor = ref(PERFORMANCE_GROUP_TAG_COLORS[0].foreground!)
const bgColor = ref(PERFORMANCE_GROUP_TAG_COLORS[0].background!)
watch(tagColor, value => {
  const color = PERFORMANCE_GROUP_TAG_COLORS.find(option => option.value === value)
  if (color) { textColor.value = color.foreground!; bgColor.value = color.background! }
})
const nameZh = ref('')
const nameEn = ref('')
const descriptionZh = ref('')
const descriptionEn = ref('')
const nameHasEnglish = ref(false)
const descriptionHasEnglish = ref(false)
const followeeIds = ref<string[]>([])
const followeeOptions = ref<PerformanceSearchSelectOption[]>([])
const rulePersonOptions = ref<PerformanceSearchSelectOption[]>([])
const viewPermission = ref('1')
const scopeSettingMode = ref('0')
const showGroupTag = ref(false)
const communicateTime = ref(false)
const startDate = ref('')
const startClock = ref('')
const endDate = ref('')
const endClock = ref('')
const roles = ref({ leader: false, hrbp: false, activity_manager: false })
const options = ref<PerformanceEvaluatorOptions | null>(null)
const loadingOptions = ref(false)
const apiDocumentUrl = ref('')
const communicationEnabled = ref(false)
const saving = ref(false)
const scopeGroups = ref<PerformanceAudienceGroup[]>([{ conditions: [{ field: '', operator: 'include', values: [] }] }])
const scopeError = ref('')
const scopeCountEnabled = computed(() => scopeMode.value === 0 && hasCompleteScopeRule(scopeGroups.value))
let peopleSearchTimer: ReturnType<typeof setTimeout> | undefined
let peopleSearchVersion = 0

const viewPermissionOptions = [
  { value: '1', label: '有组内人员绩效查看权限的用户' },
  { value: '2', label: '仅关注人可见' },
]
const scopeModeOptions = [
  { value: '0', label: '按规则维护人员范围', description: '配置圈人规则，系统根据规则动态更新人员范围' },
  { value: '1', label: '手动维护人员范围', description: '人员组创建后，在后续页面手动维护人员范围，人员范围不支持动态更新' },
  { value: '2', label: '仅API 写入', description: '其他系统通过 API 自动写入人员名单，人员组创建成功后，可获取人员组的 id 和 API 文档，请将其提供给开发人员。' },
]
const allowedScopeFields = ['department', 'employee', 'employee_type', 'directLeader', 'superior', 'hire_date', 'employment_status', 'departure_date', 'job_family', 'position_level'] as const
const organizationTree = computed<PerformanceHrbpOrganizationNode[]>(() => options.value?.organization_tree || [])
const employeeTypeOptions = computed(() => options.value?.employee_types || [])
const scopeMode = computed(() => Number(scopeSettingMode.value))
const startTime = computed(() => combineDateTime(startDate.value, startClock.value))
const endTime = computed(() => combineDateTime(endDate.value, endClock.value))

function combineDateTime(date: string, time: string) {
  return date && time ? `${date}T${time}` : null
}

function setRole(key: keyof typeof roles.value, value: boolean) {
  roles.value[key] = value
}

function searchPeople(keyword: string) {
  const query = keyword.trim()
  if (!query || !cycleId.value) return
  if (peopleSearchTimer) clearTimeout(peopleSearchTimer)
  const version = ++peopleSearchVersion
  peopleSearchTimer = setTimeout(async () => {
    try {
      const result = await performanceFocusGroupApi.searchPeople(cycleId.value!, query)
      if (version !== peopleSearchVersion) return
      const mapped = result.map(person => ({ value: person.value, label: person.label, subLabel: person.sub_label || undefined }))
      followeeOptions.value = mapped
      rulePersonOptions.value = mapped
    } catch {
      if (version === peopleSearchVersion) {
        followeeOptions.value = []
        rulePersonOptions.value = []
      }
    }
  }, 250)
}

async function loadOptions() {
  if (!cycleId.value) return
  loadingOptions.value = true
  try {
    const loaded = await performanceFocusGroupApi.options(cycleId.value)
    options.value = loaded
    followeeOptions.value = []
    rulePersonOptions.value = []
    apiDocumentUrl.value = loaded.api_document_url || ''
    communicationEnabled.value = loaded.communication_enabled
  } catch (error: any) {
    scopeError.value = error?.response?.data?.detail || '人员范围选项加载失败'
  } finally {
    loadingOptions.value = false
  }
}

async function loadDetail() {
  if (!cycleId.value || !groupId.value || isProjectTab.value) return
  try {
    const group = await performanceFocusGroupApi.get(cycleId.value, groupId.value)
    nameZh.value = group.name
    nameEn.value = group.en_name
    nameHasEnglish.value = Boolean(group.en_name)
    descriptionZh.value = group.description['zh-CN'] || ''
    descriptionEn.value = group.description['en-US'] || ''
    descriptionHasEnglish.value = Boolean(descriptionEn.value)
    followeeIds.value = group.followee_user_ids
    followeeOptions.value = group.followee_user_ids.map(value => ({ value, label: value }))
    viewPermission.value = String(group.view_permission)
    scopeSettingMode.value = String(group.scope_setting_mode)
    showGroupTag.value = group.show_group_tag
    tagColor.value = group.tag_color || PERFORMANCE_GROUP_TAG_COLORS[0].value
    await Promise.resolve()
    textColor.value = group.text_color || PERFORMANCE_GROUP_TAG_COLORS[0].foreground!
    bgColor.value = group.bg_color || PERFORMANCE_GROUP_TAG_COLORS[0].background!
    communicateTime.value = group.is_communicate_time
    ;[startDate.value, startClock.value] = (group.start_time || '').split('T')
    ;[endDate.value, endClock.value] = (group.end_time || '').split('T')
    employeeNos.value = group.employee_nos
    for (const role of Object.keys(roles.value) as Array<keyof typeof roles.value>) roles.value[role] = group.roles_of_managing_scope.includes(role)
    const fields: Record<string, string> = { employeeType: 'employee_type', category: 'job_family', level: 'position_level', sequenceLevel: 'job_category', joinDate: 'hire_date', dimissionTime: 'departure_date', dimissionStatus: 'employment_status' }
    const operators: Record<string, string> = { eq: 'include', neq: 'exclude', lt: 'before', ge: 'not_before', gt: 'after', le: 'not_after' }
    if (group.scope?.length) scopeGroups.value = group.scope.map(conditions => ({ conditions: conditions.map(condition => ({ field: fields[String(condition.key)] || String(condition.key), operator: operators[String(condition.condition)] || String(condition.condition), values: (condition.value || []) as string[] })) })) as PerformanceAudienceGroup[]
    detailLoaded.value = true
  } catch (error: any) {
    detailError.value = error?.response?.data?.detail || '人员组加载失败，请返回重试'
  }
}

async function submit() {
  if (!cycleId.value || saving.value || (isEditing.value && !detailLoaded.value)) return
  if (!nameZh.value.trim()) {
    ElMessage.warning('请填写人员组名称')
    return
  }
  if (scopeMode.value === 0 && scopeGroups.value.some(group => group.conditions.some(condition => !condition.field || condition.values.length === 0))) {
    ElMessage.warning('请完善人员范围规则')
    return
  }
  saving.value = true
  try {
    const save = isEditing.value
      ? (payload: Parameters<typeof performanceFocusGroupApi.create>[1]) => performanceFocusGroupApi.update(cycleId.value!, groupId.value!, payload)
      : (payload: Parameters<typeof performanceFocusGroupApi.create>[1]) => performanceFocusGroupApi.create(cycleId.value!, payload)
    const saved = await save({
      name: nameZh.value.trim(),
      en_name: nameEn.value.trim(),
      tab: 'semester',
      description: { 'zh-CN': descriptionZh.value.trim(), 'en-US': descriptionEn.value.trim() },
      followee_user_ids: followeeIds.value,
      view_permission: Number(viewPermission.value),
      scope_setting_mode: scopeMode.value,
      scope: scopeMode.value === 0 ? toFeishuScopes(scopeGroups.value) : null,
      show_group_tag: showGroupTag.value,
      tag_color: tagColor.value,
      text_color: textColor.value,
      bg_color: bgColor.value,
      is_communicate_time: communicateTime.value,
      start_time: communicateTime.value ? startTime.value : null,
      end_time: communicateTime.value ? endTime.value : null,
      employee_nos: employeeNos.value,
      scope_mode: scopeMode.value === 0 ? 'rule' : scopeMode.value === 1 ? 'manual' : 'api',
      roles_of_managing_scope: scopeMode.value === 1 ? Object.entries(roles.value).filter(([, checked]) => checked).map(([role]) => role) : [],
    })
    ElMessage.success(isEditing.value ? '人员组已保存' : '人员组已创建')
    if (!isEditing.value && saved.id) {
      // 新建后直接进入详情管理页（基本信息 + 人员列表/变更记录），与飞书一致
      void router.push({ name: 'PerformanceCycleFocusPeopleManagementDetail', params: { cycleId: cycleId.value, groupId: saved.id } })
      return
    }
    if (isEditing.value) {
      // 编辑保存后返回详情管理页（飞书两层链路：列表 → 详情 → 表单）
      void router.push({ name: 'PerformanceCycleFocusPeopleManagementDetail', params: { cycleId: cycleId.value, groupId: groupId.value! } })
      return
    }
    void router.push({ name: 'PerformanceCycleFocusPeople', params: { cycleId: cycleId.value } })
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.detail || '创建失败，请稍后重试')
  } finally {
    saving.value = false
  }
}

function goBack() {
  if (isEditing.value) {
    void router.push({ name: 'PerformanceCycleFocusPeopleManagementDetail', params: { cycleId: cycleId.value, groupId: groupId.value! } })
    return
  }
  void router.push({ name: 'PerformanceCycleFocusPeople', params: { cycleId: cycleId.value }, query: { tab: route.query.tab } })
}

onMounted(() => { if (!isProjectTab.value) { void loadOptions(); void loadDetail() } })
onBeforeUnmount(() => {
  peopleSearchVersion += 1
  if (peopleSearchTimer) clearTimeout(peopleSearchTimer)
})
</script>

<template>
  <FocusPeopleGroupProjectCreate v-if="isProjectTab" />
  <UiFullScreenModal v-else :title="isEditing ? '编辑人员组' : '新建人员组'" :submitting="saving" @submit="submit" @cancel="goBack" @back="goBack">
    <div class="focus-group-create-page">
      <p v-if="detailError" role="alert">{{ detailError }}</p>
      <PerformanceSurfaceCard title="基本信息" class="focus-group-create-card">
        <PerformanceLocalizedInput v-model="nameZh" label="人员组名称" input-id="focus-group-name-zh" placeholder="请输入中文名称" required @add-language="nameHasEnglish = true" />
        <PerformanceLocalizedInput v-if="nameHasEnglish" v-model="nameEn" label="英文名称" input-id="focus-group-name-en" placeholder="请输入英文名称" />
        <PerformanceLocalizedInput v-model="descriptionZh" label="人员组说明" input-id="focus-group-description-zh" placeholder="请输入人员组说明" @add-language="descriptionHasEnglish = true" />
        <PerformanceLocalizedInput v-if="descriptionHasEnglish" v-model="descriptionEn" label="英文说明" input-id="focus-group-description-en" placeholder="请输入英文说明" />
        <PerformanceFormItem label="关注人">
          <PerformancePersonSelect v-model="followeeIds" :options="followeeOptions" multiple aria-label="关注人" placeholder="搜索关注人" option-style="checkmark" @search="searchPeople" />
        </PerformanceFormItem>
        <PerformanceFormItem label="该人员组对谁可见" class="focus-group-create-visibility">
          <PerformanceRadioGroup v-model="viewPermission" :options="viewPermissionOptions" name="focus-group-view-permission" direction="horizontal" :gap="24" :style="{ gap: 'var(--spacing-6)' }" aria-label="该人员组对谁可见" />
        </PerformanceFormItem>
        <div class="focus-group-create-tag-setting">
          <PerformanceSwitchSettingRow v-model="showGroupTag" label="展示该人员组标签" />
          <p class="focus-group-create-desc">开启后，可见人员组的用户可在人员组成员的「绩效详情页」和「成员列表」查看人员组标签。</p>
          <UiTagColorField v-if="showGroupTag" v-model="tagColor" :text-color="textColor" :bg-color="bgColor" />
        </div>
      </PerformanceSurfaceCard>

      <PerformanceSurfaceCard title="人员范围" class="focus-group-create-card">
        <PerformanceFormItem label="设置方式" required>
          <PerformanceRadioGroup v-model="scopeSettingMode" class="focus-group-create-mode-options" :options="scopeModeOptions" name="focus-group-scope-mode" :disabled="isEditing" direction="vertical" :gap="8" :style="{ gap: 'var(--spacing-2)' }" aria-label="人员范围设置方式">
            <template #label="{ option }">
              <span class="focus-group-create-mode-label">{{ option.label }}</span>
              <span class="focus-group-create-mode-description">{{ option.description }}</span>
            </template>
            <template #after-option="{ option }">
              <UiOptionDetail v-if="option.value === '1' && scopeMode === 1">
                <PerformanceFormItem label="前台可管理人员范围的角色">
                  <PerformanceCheckbox v-model="roles.leader" label="实线上级" @update:model-value="setRole('leader', $event)" />
                  <PerformanceCheckbox v-model="roles.hrbp" label="HRBP" @update:model-value="setRole('hrbp', $event)" />
                  <PerformanceCheckbox v-model="roles.activity_manager" label="项目管理员" @update:model-value="setRole('activity_manager', $event)" />
                </PerformanceFormItem>
              </UiOptionDetail>
            </template>
          </PerformanceRadioGroup>
        </PerformanceFormItem>
        <template v-if="scopeMode === 0">
          <PerformanceFormItem label="人员范围设置" required>
            <template #description>编辑人员范围规则，系统将根据规则动态更新人员范围</template>
            <p v-if="scopeError" class="focus-group-create-error" role="alert">{{ scopeError }}</p>
            <PerformanceScopeCount :cycle-id="cycleId" :groups="scopeGroups" :enabled="scopeCountEnabled" title="人员列表">
              <template #default="{ counts, loading, open }">
                <PerformanceAudienceRuleEditor
                  v-model="scopeGroups"
                  scope-mode
                  :show-scope-heading="false"
                  :allowed-fields="[...allowedScopeFields]"
                  :organization-tree="organizationTree"
                  :person-options="rulePersonOptions"
                  :employee-type-options="employeeTypeOptions"
                  :snapshot-options="options || undefined"
                  group-title-pattern="条件组 {index}"
                  @search-people="searchPeople"
                >
                  <template #group-heading-extra="{ index }">
                    <button
                      type="button"
                      class="focus-group-create-group-count"
                      :disabled="!counts[index]"
                      @click="open(index)"
                    >
                      同时满足以下条件：{{ loading ? '…' : counts[index] ?? '--' }} 人
                    </button>
                  </template>
                </PerformanceAudienceRuleEditor>
              </template>
            </PerformanceScopeCount>
          </PerformanceFormItem>
        </template>
        <template v-else>
          <a v-if="apiDocumentUrl" class="focus-group-create-api-link" :href="apiDocumentUrl" target="_blank" rel="noreferrer">API 文档</a>
        </template>
      </PerformanceSurfaceCard>

      <PerformanceSurfaceCard v-if="communicationEnabled" title="其他设置" class="focus-group-create-card">
        <PerformanceSwitchSettingRow v-model="communicateTime" label="设置独立的结果沟通时间" />
        <p class="focus-group-create-desc">将结合绩效项目中配置的结果沟通时间，取最晚的开始时间和结束时间。</p>
        <p class="focus-group-create-desc">对本周期所有结果沟通型环节生效</p>
        <div v-if="communicateTime" class="focus-group-create-time-fields">
          <PerformanceFormItem label="开始时间">
            <div class="focus-group-create-time-pair">
              <PerformanceDateTimeField v-model="startDate" date-only aria-label="开始日期" placeholder="YYYY-MM-DD" />
              <PerformanceTimeField v-model="startClock" aria-label="开始时间" />
            </div>
          </PerformanceFormItem>
          <PerformanceFormItem label="截止时间">
            <div class="focus-group-create-time-pair">
              <PerformanceDateTimeField v-model="endDate" date-only aria-label="截止日期" placeholder="YYYY-MM-DD" />
              <PerformanceTimeField v-model="endClock" aria-label="截止时间" />
            </div>
          </PerformanceFormItem>
        </div>
      </PerformanceSurfaceCard>
    </div>
    <template #footer>
      <UiButton variant="primary" class="focus-group-create-ok" :loading="saving" @click="submit">确定</UiButton>
      <UiButton variant="secondary" class="focus-group-create-cancel" @click="goBack">取消</UiButton>
    </template>
  </UiFullScreenModal>
</template>

<style scoped>
.focus-group-create-page { display: flex; flex-direction: column; align-self: flex-start; width: 100%; max-width: var(--performance-content-width); margin: 0 auto; padding: var(--performance-content-surface-padding) 0; box-sizing: border-box; gap: var(--spacing-4); --performance-input-field-gap: var(--spacing-4); }
.focus-group-create-card { flex: none; padding: var(--performance-content-surface-padding); }
.focus-group-create-card :deep(.section-card-header) { flex: none; margin-bottom: var(--spacing-4); }
.focus-group-create-card :deep(.header-bar) { display: none; }
.focus-group-create-card :deep(.performance-form-item:last-child) { margin-bottom: 0; }
.focus-group-create-card :deep(.performance-form-item__description) { color: var(--performance-text-secondary); font-size: var(--font-size-md); line-height: var(--performance-input-line-height); }
.focus-group-create-card :deep(.performance-form-item__label) { margin-bottom: var(--performance-field-label-gap); }
.focus-group-create-visibility { margin-bottom: var(--spacing-5); }
.focus-group-create-tag-setting { margin-bottom: var(--spacing-5); }
.focus-group-create-desc { margin: 0; color: var(--performance-text-secondary); font-size: var(--font-size-md); line-height: var(--performance-input-line-height); }
.focus-group-create-mode-options { width: 100%; }
.focus-group-create-mode-options :deep(.performance-radio-option) { width: 100%; height: auto; align-items: flex-start; }
.focus-group-create-mode-options :deep(.radio-wallpaper) { margin-top: calc((var(--performance-input-line-height) - var(--performance-workbench-editor-radio-size)) / 2); }
.focus-group-create-mode-options :deep(.radio-label) { flex: 1; min-width: 0; white-space: normal; }
.focus-group-create-mode-label, .focus-group-create-mode-description { display: block; line-height: var(--performance-input-line-height); }
.focus-group-create-mode-description { color: var(--performance-text-secondary); }
.focus-group-create-group-count {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--performance-button-link-disabled-color);
  font: 400 var(--font-size-sm)/22px var(--font-sans);
  cursor: default;
}
.focus-group-create-group-count:not(:disabled) {
  color: var(--color-primary-hover);
  cursor: pointer;
}
.focus-group-create-group-count:hover:not(:disabled) {
  text-decoration: underline;
}
.focus-group-create-error { margin: var(--spacing-2) 0 0; color: var(--performance-field-error-color); font-size: var(--font-size-sm); }
.focus-group-create-api-link { color: var(--color-primary); text-decoration: none; }
.focus-group-create-roles { display: flex; flex-direction: column; gap: var(--spacing-2); }
.focus-group-create-time-fields { display: flex; flex-direction: column; gap: var(--spacing-3); }
.focus-group-create-time-pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--spacing-3); }
.focus-group-create-ok, .focus-group-create-cancel { min-width: var(--performance-button-min-width); }
@media (max-width: 640px) { .focus-group-create-time-pair { grid-template-columns: 1fr; } }
</style>
