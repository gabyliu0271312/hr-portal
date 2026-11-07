<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { performanceFocusGroupApi } from '@/api/performance'
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
import PerformanceSwitchSettingRow from '@/components/performance/PerformanceSwitchSettingRow.vue'
import PerformanceDateTimeField from '@/components/performance/PerformanceDateTimeField.vue'
import PerformanceTimeField from '@/components/performance/PerformanceTimeField.vue'
import PerformanceCheckbox from '@/components/performance/PerformanceCheckbox.vue'
import FocusPeopleGroupProjectCreate from './FocusPeopleGroupProjectCreate.vue'

const route = useRoute()
const router = useRouter()
const isProjectTab = computed(() => route.query.tab === 'project')
const cycleId = computed(() => {
  const value = Number(route.params.cycleId)
  return Number.isInteger(value) && value > 0 ? value : null
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
const scopeCount = ref<number | null>(null)
const scopeLoading = ref(false)
const scopeError = ref('')
let debounceTimer: ReturnType<typeof setTimeout> | undefined
let peopleSearchTimer: ReturnType<typeof setTimeout> | undefined
let pollTimer: ReturnType<typeof setTimeout> | undefined
let requestVersion = 0
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

function toFeishuScopes() {
  const fields: Record<string, string> = {
    department: 'department', employee: 'employee', employee_type: 'employeeType', directLeader: 'directLeader', superior: 'superior',
    job_family: 'category', position_level: 'level', job_category: 'sequenceLevel', hire_date: 'joinDate', departure_date: 'dimissionTime', employment_status: 'dimissionStatus',
  }
  const operators: Record<string, string> = { include: 'eq', exclude: 'neq', before: 'lt', not_before: 'ge', after: 'gt', not_after: 'le' }
  return scopeGroups.value.map(group => group.conditions.map((condition, index) => ({
    key: fields[condition.field] || condition.field,
    condition: operators[condition.operator] || condition.operator,
    value: condition.values,
    id: String(index + 1),
    fe_extra: '',
    __id__: `condition_${index + 1}`,
  })))
}

function hasCompleteScopeRule() {
  return scopeGroups.value.some(group => group.conditions.some(condition => condition.field && condition.values.length > 0))
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

async function refreshScopeCount() {
  const version = ++requestVersion
  if (!cycleId.value || scopeMode.value !== 0 || !hasCompleteScopeRule()) {
    scopeLoading.value = false
    scopeCount.value = null
    return
  }
  if (pollTimer) clearTimeout(pollTimer)
  scopeLoading.value = true
  scopeError.value = ''
  scopeCount.value = null
  const payload = { scopes: toFeishuScopes(), user_group_id: '' }
  try {
    const created = await performanceFocusGroupApi.resolveScope(cycleId.value, payload, '-1')
    if (version !== requestVersion || !created.task_id) return
    const poll = async () => {
      if (version !== requestVersion) return
      try {
        const result = await performanceFocusGroupApi.resolveScope(cycleId.value!, payload, created.task_id!)
        if (version !== requestVersion) return
        if (result.selected_count !== undefined || result.selected !== undefined || result.scopes !== undefined) {
          const selected = result.selected ?? result.scopes?.[0]?.selected ?? null
          scopeCount.value = result.selected_count ?? selected?.length ?? 0
          scopeLoading.value = false
          return
        }
        pollTimer = setTimeout(() => void poll(), 500)
      } catch (error: any) {
        if (version === requestVersion) {
          scopeLoading.value = false
          scopeError.value = error?.response?.data?.detail || '人员范围统计失败'
        }
      }
    }
    pollTimer = setTimeout(() => void poll(), 250)
  } catch (error: any) {
    if (version === requestVersion) {
      scopeLoading.value = false
      scopeError.value = error?.response?.data?.detail || '人员范围统计失败'
    }
  }
}

watch(scopeGroups, () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (pollTimer) clearTimeout(pollTimer)
  debounceTimer = setTimeout(() => void refreshScopeCount(), 200)
}, { deep: true })
watch(scopeSettingMode, () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (pollTimer) clearTimeout(pollTimer)
  debounceTimer = setTimeout(() => void refreshScopeCount(), 200)
})

async function submit() {
  if (!cycleId.value || saving.value) return
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
    await performanceFocusGroupApi.create(cycleId.value, {
      name: nameZh.value.trim(),
      en_name: nameEn.value.trim(),
      tab: 'semester',
      description: { 'zh-CN': descriptionZh.value.trim(), 'en-US': descriptionEn.value.trim() },
      followee_user_ids: followeeIds.value,
      view_permission: Number(viewPermission.value),
      scope_setting_mode: scopeMode.value,
      scope: scopeMode.value === 0 ? toFeishuScopes() : null,
      show_group_tag: showGroupTag.value,
      is_communicate_time: communicateTime.value,
      start_time: communicateTime.value ? startTime.value : null,
      end_time: communicateTime.value ? endTime.value : null,
      employee_nos: [],
      scope_mode: scopeMode.value === 0 ? 'rule' : scopeMode.value === 1 ? 'manual' : 'api',
      roles_of_managing_scope: scopeMode.value === 1 ? Object.entries(roles.value).filter(([, checked]) => checked).map(([role]) => role) : [],
    })
    ElMessage.success('人员组已创建')
    void router.push({ name: 'PerformanceCycleFocusPeople', params: { cycleId: cycleId.value } })
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.detail || '创建失败，请稍后重试')
  } finally {
    saving.value = false
  }
}

function goBack() {
  void router.push({ name: 'PerformanceCycleFocusPeople', params: { cycleId: cycleId.value } })
}

onMounted(() => { void loadOptions() })
onBeforeUnmount(() => {
  requestVersion += 1
  peopleSearchVersion += 1
  if (debounceTimer) clearTimeout(debounceTimer)
  if (peopleSearchTimer) clearTimeout(peopleSearchTimer)
  if (pollTimer) clearTimeout(pollTimer)
})
</script>

<template>
  <FocusPeopleGroupProjectCreate v-if="isProjectTab" />
  <UiFullScreenModal v-else title="新建人员组" :submitting="saving" @submit="submit" @cancel="goBack" @back="goBack">
    <div class="focus-group-create-page">
      <PerformanceSurfaceCard title="基本信息" class="focus-group-create-card">
        <PerformanceLocalizedInput v-model="nameZh" label="人员组名称" input-id="focus-group-name-zh" placeholder="请输入中文名称" required @add-language="nameHasEnglish = true" />
        <PerformanceLocalizedInput v-if="nameHasEnglish" v-model="nameEn" label="英文名称" input-id="focus-group-name-en" placeholder="请输入英文名称" />
        <PerformanceLocalizedInput v-model="descriptionZh" label="人员组说明" input-id="focus-group-description-zh" placeholder="请输入人员组说明" @add-language="descriptionHasEnglish = true" />
        <PerformanceLocalizedInput v-if="descriptionHasEnglish" v-model="descriptionEn" label="英文说明" input-id="focus-group-description-en" placeholder="请输入英文说明" />
        <PerformanceFormItem label="关注人">
          <PerformancePersonSelect v-model="followeeIds" :options="followeeOptions" multiple aria-label="关注人" placeholder="搜索关注人" option-style="checkmark" @search="searchPeople" />
        </PerformanceFormItem>
        <PerformanceFormItem label="该人员组对谁可见">
          <PerformanceRadioGroup v-model="viewPermission" :options="viewPermissionOptions" name="focus-group-view-permission" direction="horizontal" :gap="32" aria-label="该人员组对谁可见" />
        </PerformanceFormItem>
      </PerformanceSurfaceCard>

      <PerformanceSurfaceCard title="人员范围设置" class="focus-group-create-card">
        <PerformanceFormItem label="设置方式" required>
          <PerformanceRadioGroup v-model="scopeSettingMode" :options="scopeModeOptions" name="focus-group-scope-mode" direction="vertical" :gap="0" aria-label="人员范围设置方式" />
        </PerformanceFormItem>
        <template v-if="scopeMode === 0">
          <PerformanceFormItem label="人员范围设置" required>
            <template #description>编辑人员范围规则，系统将根据规则动态更新人员范围</template>
            <p class="focus-group-create-count" role="status">符合条件的人员，共计 {{ scopeLoading ? '计算中…' : scopeCount ?? '--' }} 人</p>
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
            />
            <p v-if="scopeError" class="focus-group-create-error" role="alert">{{ scopeError }}</p>
          </PerformanceFormItem>
        </template>
        <template v-else-if="scopeMode === 1">
          <p class="focus-group-create-desc">人员组创建后，可在后续页面手动维护人员范围，人员范围不支持动态更新。</p>
          <PerformanceFormItem label="前台可管理人员范围的角色">
            <template #description>若勾选下述角色，则授权该角色可在前台管理该人员组人员范围。</template>
            <div class="focus-group-create-roles">
              <PerformanceCheckbox v-model="roles.leader" label="关联评估项目的被评估人的实线上级" @update:model-value="setRole('leader', $event)" />
              <PerformanceCheckbox v-model="roles.hrbp" label="关联评估项目的被评估人的 HRBP" @update:model-value="setRole('hrbp', $event)" />
              <PerformanceCheckbox v-model="roles.activity_manager" label="关联评估项目的项目管理员" @update:model-value="setRole('activity_manager', $event)" />
            </div>
          </PerformanceFormItem>
        </template>
        <template v-else>
          <a v-if="apiDocumentUrl" class="focus-group-create-api-link" :href="apiDocumentUrl" target="_blank" rel="noreferrer">API 文档</a>
        </template>
      </PerformanceSurfaceCard>

      <PerformanceSurfaceCard v-if="communicationEnabled" title="其他设置" class="focus-group-create-card">
        <PerformanceSwitchSettingRow v-model="showGroupTag" label="展示人员组标签" />
        <p class="focus-group-create-desc">开启后，可见人员组的用户可在人员组成员的「绩效详情页」和「成员列表」查看人员组标签。</p>
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
.focus-group-create-page { display: flex; flex-direction: column; width: 100%; max-width: var(--performance-content-width); margin: 0 auto; padding: var(--spacing-5); box-sizing: border-box; gap: var(--spacing-4); }
.focus-group-create-card { padding: var(--spacing-5); }
.focus-group-create-desc { margin: 0 0 var(--spacing-6); color: var(--performance-text-secondary); font-size: var(--font-size-md); line-height: var(--performance-input-line-height); }
.focus-group-create-count { margin: 0 0 var(--spacing-3); color: var(--color-text-secondary); font-size: var(--font-size-md); line-height: var(--performance-input-line-height); }
.focus-group-create-error { margin: var(--spacing-2) 0 0; color: var(--performance-field-error-color); font-size: var(--font-size-sm); }
.focus-group-create-api-link { color: var(--color-primary); text-decoration: none; }
.focus-group-create-roles { display: flex; flex-direction: column; gap: var(--spacing-2); }
.focus-group-create-time-fields { display: flex; flex-direction: column; gap: var(--spacing-3); }
.focus-group-create-time-pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--spacing-3); }
.focus-group-create-ok, .focus-group-create-cancel { min-width: var(--performance-button-min-width); }
@media (max-width: 640px) { .focus-group-create-time-pair { grid-template-columns: 1fr; } }
</style>
