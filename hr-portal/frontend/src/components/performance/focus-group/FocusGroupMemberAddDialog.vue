<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { hasCompleteScopeRule, performanceFocusGroupApi, toFeishuScopes } from '@/api/performance'
import type { PerformanceAudienceGroup, PerformanceEvaluatorOptions, PerformanceHrbpOrganizationNode } from '@/api/performance'
import PerformanceDialogShell from '../PerformanceDialogShell.vue'
import PerformanceAudienceRuleEditor from '../PerformanceAudienceRuleEditor.vue'
import PerformanceScopeCount from '../PerformanceScopeCount.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { PerformanceSearchSelectOption } from '../PerformanceSearchSelect.vue'

const props = defineProps<{
  modelValue: boolean
  cycleId: number | null
  groupId: number | null
  currentEmployeeNos: string[]
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  added: []
}>()

const open = computed(() => props.modelValue)

const allowedScopeFields = ['department', 'employee', 'employee_type', 'directLeader', 'superior', 'hire_date', 'employment_status', 'departure_date', 'job_family', 'position_level'] as const

const options = ref<PerformanceEvaluatorOptions | null>(null)
const loadingOptions = ref(false)
const scopeError = ref('')
const scopeGroups = ref<PerformanceAudienceGroup[]>([{ conditions: [{ field: 'department', operator: 'include', values: [] }] }])
const rulePersonOptions = ref<PerformanceSearchSelectOption[]>([])
const saving = ref(false)
let peopleSearchVersion = 0

const organizationTree = computed<PerformanceHrbpOrganizationNode[]>(() => options.value?.organization_tree || [])
const employeeTypeOptions = computed(() => options.value?.employee_types || [])
const valid = computed(() => hasCompleteScopeRule(scopeGroups.value))

watch(() => props.modelValue, visible => {
  if (!visible) return
  scopeGroups.value = [{ conditions: [{ field: 'department', operator: 'include', values: [] }] }]
  scopeError.value = ''
  peopleSearchVersion += 1
  if (!props.cycleId) return
  void loadOptions()
})

async function loadOptions() {
  if (!props.cycleId || options.value) return
  loadingOptions.value = true
  try {
    options.value = await performanceFocusGroupApi.options(props.cycleId)
  } catch (error: any) {
    scopeError.value = error?.response?.data?.detail || '人员范围选项加载失败'
  } finally {
    loadingOptions.value = false
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined
function searchPeople(keyword: string) {
  const query = keyword.trim()
  if (!query || !props.cycleId) { rulePersonOptions.value = []; return }
  const version = ++peopleSearchVersion
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(async () => {
    try {
      const result = await performanceFocusGroupApi.searchPeople(props.cycleId!, query)
      if (version !== peopleSearchVersion) return
      rulePersonOptions.value = result.map(person => ({ value: person.value, label: person.label, subLabel: person.sub_label || undefined }))
    } catch {
      if (version === peopleSearchVersion) rulePersonOptions.value = []
    }
  }, 300)
}

async function submit() {
  if (!props.cycleId || !props.groupId || saving.value) return
  if (!valid.value) {
    ElMessage.warning('请完善人员范围规则')
    return
  }
  saving.value = true
  try {
    const result = await performanceFocusGroupApi.resolveScope(props.cycleId, { scopes: toFeishuScopes(scopeGroups.value), user_group_id: '' }, '-1')
    if (result.status === 3 || result.status === 4 || !result.task_id) throw new Error('人员范围统计失败，请重试')
    const resolved = await performanceFocusGroupApi.resolveScope(props.cycleId, { scopes: toFeishuScopes(scopeGroups.value), user_group_id: '' }, result.task_id)
    const selected = resolved.selected ?? resolved.scopes?.[0]?.selected
    const next = [...props.currentEmployeeNos]
    for (const employeeNo of selected || []) {
      if (!next.includes(employeeNo)) next.push(employeeNo)
    }
    await performanceFocusGroupApi.updateMembers(props.cycleId, props.groupId, next)
    emit('added')
    emit('update:modelValue', false)
    ElMessage.success('添加成功')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.detail || '添加失败，请稍后重试')
  } finally {
    saving.value = false
  }
}

onBeforeUnmount(() => {
  peopleSearchVersion += 1
  if (searchTimer) clearTimeout(searchTimer)
})
</script>

<template>
  <PerformanceDialogShell v-model="open" title="添加人员范围" width="var(--performance-dialog-md-width)" :loading="saving" @close="emit('update:modelValue', false)">
    <template #description>按规则选择用户添加到人员组中，人员范围不支持动态更新。</template>

    <div class="focus-group-member-add-scope">
      <p class="focus-group-member-add-label">
        适用范围<span class="focus-group-member-add-required">*</span>
      </p>
      <p v-if="scopeError" class="focus-group-member-add-error" role="alert">{{ scopeError }}</p>
      <PerformanceScopeCount :cycle-id="props.cycleId" :groups="scopeGroups" :enabled="valid" title="人员列表">
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
            :loading="loadingOptions"
            @open-options="loadOptions"
            @search-people="searchPeople"
          >
            <template #group-heading-extra="{ index }">
              <button
                type="button"
                class="focus-group-member-add-group-count"
                :disabled="!counts[index]"
                @click="open(index)"
              >
                同时满足以下条件：{{ loading ? '…' : counts[index] ?? '--' }} 人
              </button>
            </template>
          </PerformanceAudienceRuleEditor>
        </template>
      </PerformanceScopeCount>
    </div>

    <template #footer>
      <div class="focus-group-member-add-footer">
        <UiButton variant="secondary" :disabled="saving" @click="emit('update:modelValue', false)">取消</UiButton>
        <UiButton variant="primary" :loading="saving" :disabled="!valid" @click="submit">确定</UiButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<style scoped>
.focus-group-member-add-scope { display: flex; flex-direction: column; gap: 8px; }
.focus-group-member-add-label { margin: 0; color: var(--color-text-primary); font: 400 var(--font-size-md)/22px var(--font-sans); }
.focus-group-member-add-required { margin-left: 2px; color: var(--performance-field-error-color); }
.focus-group-member-add-error { margin: 0; color: var(--performance-field-error-color); font-size: var(--performance-field-error-font-size); line-height: var(--performance-field-error-line-height); }
.focus-group-member-add-group-count {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--performance-button-link-disabled-color);
  font: 400 var(--font-size-sm)/22px var(--font-sans);
  cursor: default;
}
.focus-group-member-add-group-count:not(:disabled) {
  color: var(--color-primary-hover);
  cursor: pointer;
}
.focus-group-member-add-group-count:hover:not(:disabled) {
  text-decoration: underline;
}
.focus-group-member-add-footer { display: flex; justify-content: flex-end; gap: var(--performance-dialog-footer-gap); }
.focus-group-member-add-footer .performance-button { min-width: var(--performance-button-min-width); }
</style>
