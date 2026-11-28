<template>
  <PerformanceDialogShell
    :model-value="modelValue"
    :title="title"
    :width="mode === 'rules' ? 'var(--performance-dialog-md-width)' : 'var(--performance-dialog-wide-width)'"
    :loading="saving"
    dialog-class="performance-authorization-dialog"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-if="mode === 'users'" class="authorization-dialog-content">
      <p class="authorization-dialog-intro">为指定用户配置绩效管理角色</p>
      <p v-if="error" class="authorization-dialog-error" role="alert">{{ error }} <UiButton v-if="loadFailed" variant="text" @click="loadUserOptions">重试</UiButton></p>
      <PerformanceFormItem :label="'选择用户'" required>
        <PerformanceSearchSelect v-model="userId" :options="users" aria-label="选择用户" placeholder="请选择用户" :disabled="loading || saving || Boolean(authorization)" />
      </PerformanceFormItem>
      <PerformanceFormItem label="授权角色" required>
        <PerformanceSearchSelect v-model="roleIds" :options="roles" aria-label="授权角色" placeholder="请选择授权角色" multiple :disabled="loading || saving" />
        <span class="authorization-dialog-hint">仅显示已启用的自定义管理角色；不会授予应用入口或系统管理员权限</span>
      </PerformanceFormItem>
    </div>

    <div v-else class="rule-dialog-content">
      <PerformanceFormItem label="用户范围" required>
        <div class="rule-dialog-scope-head">
          <span>符合条件的员工，共计 <strong>{{ matchedCount ?? '--' }}</strong> 人</span>
        </div>
        <PerformanceAudienceRuleEditor
          v-model="ruleGroups"
          scope-mode
          :show-scope-heading="false"
          :min-groups="1"
          default-field="directLeader"
          group-title-pattern="范围 {index}"
          :allowed-fields="allowedFields"
          :organization-tree="organizationTree"
          :person-options="personOptions"
          :snapshot-options="snapshotOptions"
          :employee-type-options="snapshotOptions.employee_types"
          :hire-date-range="snapshotOptions.hire_date_range"
          :loading="loading"
          :disabled="saving"
          :highlight-invalid="submitted"
        />
      </PerformanceFormItem>
      <PerformanceFormItem label="授权角色" required>
        <PerformanceSearchSelect v-model="ruleRoleId" :options="ruleRoles" aria-label="授权角色" placeholder="请选择授权角色" :disabled="loading || saving" />
      </PerformanceFormItem>
      <p v-if="error" class="rule-dialog-error" role="alert">{{ error }} <UiButton v-if="loadFailed" variant="text" @click="loadRuleOptions">重试</UiButton></p>
    </div>

    <template #footer>
      <div class="authorization-dialog-actions">
        <UiButton variant="secondary" :disabled="saving" @click="emit('update:modelValue', false)">取消</UiButton>
        <UiButton variant="primary" :disabled="saving || loading || loadFailed" @click="save">{{ saving ? '保存中' : '保存' }}</UiButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  performanceAuthRuleApi,
  performanceUserAuthorizationApi,
  type PerformanceAudienceGroup,
  type PerformanceAuthRule,
  type PerformanceEvaluatorOptions,
  type PerformanceHrbpOrganizationNode,
  type PerformanceUserAuthorization,
} from '@/api/performance'
import UiButton from '../ui/UiButton.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformanceSearchSelect, { type PerformanceSearchSelectOption } from './PerformanceSearchSelect.vue'
import PerformanceAudienceRuleEditor from './PerformanceAudienceRuleEditor.vue'
import type { PerformanceAudienceField } from '@/api/performance'

const props = defineProps<{ modelValue: boolean; mode: 'users' | 'rules'; authorization?: PerformanceUserAuthorization | null; rule?: PerformanceAuthRule | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; saved: [] }>()

const title = computed(() => {
  if (props.mode === 'rules') return props.rule ? '编辑规则' : '添加规则'
  return props.authorization ? '编辑授权' : '添加授权'
})

// ---- users 模式 ----
const userId = ref<string | null>(null)
const roleIds = ref<string[]>([])
const users = ref<PerformanceSearchSelectOption[]>([])
const roles = ref<PerformanceSearchSelectOption[]>([])

// ---- rules 模式 ----
const ruleGroups = ref<PerformanceAudienceGroup[]>([])
const ruleRoleId = ref<string | null>(null)
const allowedFields = ref<PerformanceAudienceField[]>(['directLeader', 'employee', 'superior', 'department'])
const organizationTree = ref<PerformanceHrbpOrganizationNode[]>([])
const personOptions = ref<PerformanceSearchSelectOption[]>([])
const snapshotOptions = ref<PerformanceEvaluatorOptions>({ organization_tree: [], people: [], employee_types: [] })
const ruleRoles = ref<PerformanceSearchSelectOption[]>([])
const matchedCount = ref<number | null>(null)
const submitted = ref(false)

const loading = ref(false)
const saving = ref(false)
const loadFailed = ref(false)
const error = ref('')
let sequence = 0

const ruleConditionFields: Record<string, { label: string; optionSource: string }> = {
  department: { label: '部门', optionSource: 'organization_tree' },
  employee: { label: '员工', optionSource: 'people' },
  superior: { label: '上级', optionSource: 'people' },
  directLeader: { label: '直属上级', optionSource: 'people' },
  job_family: { label: '序列', optionSource: 'job_families' },
  position_level: { label: '职级', optionSource: 'position_levels' },
  hire_date: { label: '入职时间', optionSource: 'hire_date_range' },
  employee_type: { label: '人员类型', optionSource: 'employee_types' },
}

async function loadUserOptions() {
  const current = ++sequence
  loading.value = true
  loadFailed.value = false
  error.value = ''
  try {
    const result = await performanceUserAuthorizationApi.options()
    if (current === sequence && props.modelValue) {
      users.value = result.users
      roles.value = result.roles.map(role => ({ value: String(role.id), label: role.name }))
    }
  } catch (e: any) {
    if (current === sequence) { error.value = e?.response?.data?.detail || e?.message || '授权选项加载失败'; loadFailed.value = true }
  } finally {
    if (current === sequence) loading.value = false
  }
}

async function loadRuleOptions() {
  const current = ++sequence
  loading.value = true
  loadFailed.value = false
  error.value = ''
  try {
    const result = await performanceAuthRuleApi.options()
    if (current === sequence && props.modelValue) {
      allowedFields.value = result.fields
        .map(field => field.key as PerformanceAudienceField)
        .filter(field => field in ruleConditionFields)
      organizationTree.value = result.organization_tree
      personOptions.value = result.people.map(p => ({ value: p.value, label: p.label, subLabel: p.department || '' }))
      snapshotOptions.value = {
        organization_tree: result.organization_tree,
        people: result.people.map(p => ({ value: p.value, label: p.label })),
        employee_types: result.employee_types,
        job_families: result.job_families,
        position_levels: result.position_levels,
        hire_date_range: result.hire_date_range,
      }
      ruleRoles.value = result.roles.map(role => ({ value: String(role.id), label: role.name }))
    }
  } catch (e: any) {
    if (current === sequence) { error.value = e?.response?.data?.detail || e?.message || '范围选项加载失败'; loadFailed.value = true }
  } finally {
    if (current === sequence) loading.value = false
  }
}

let resolveSequence = 0
watch([ruleGroups], async () => {
  const current = ++resolveSequence
  matchedCount.value = null
  if (props.mode !== 'rules' || !props.modelValue) return
  if (!ruleGroups.value.length || ruleGroups.value.some(group => !group.conditions.length || group.conditions.some(condition => !condition.field || !condition.values.length))) return
  try {
    const result = await performanceAuthRuleApi.resolveScope(ruleGroups.value)
    if (current === resolveSequence && props.modelValue) matchedCount.value = result.count
  } catch {
    if (current === resolveSequence) matchedCount.value = null
  }
}, { deep: true })

const validUsers = computed(() => typeof userId.value === 'string' && Array.isArray(roleIds.value) && roleIds.value.length > 0)
const validRules = computed(() => {
  if (!ruleRoleId.value) return false
  if (!ruleGroups.value.length) return false
  return ruleGroups.value.every(group =>
    group.conditions.length > 0
    && group.conditions.every(condition => condition.field && condition.values.length > 0),
  )
})

async function save() {
  if (saving.value || loading.value || loadFailed.value) return
  if (props.mode === 'users') {
    if (!validUsers.value) { error.value = '请选择用户和至少一个授权角色'; return }
    if (roleIds.value.some(id => !roles.value.some(role => role.value === id))) {
      error.value = '请移除已停用或不可用的角色'
      return
    }
    saving.value = true
    error.value = ''
    try {
      await performanceUserAuthorizationApi.save(Number(userId.value), roleIds.value.map(Number), Boolean(props.authorization))
      emit('saved')
      emit('update:modelValue', false)
    } catch (e: any) {
      error.value = e?.response?.data?.detail || e?.message || '授权保存失败'
    } finally {
      saving.value = false
    }
  } else {
    submitted.value = true
    if (!validRules.value) { error.value = '请选择范围条件和至少一个授权角色'; return }
    saving.value = true
    error.value = ''
    try {
      await performanceAuthRuleApi.save(Number(ruleRoleId.value), ruleGroups.value, Boolean(props.rule), props.rule?.id)
      emit('saved')
      emit('update:modelValue', false)
    } catch (e: any) {
      error.value = e?.response?.data?.detail || e?.message || '规则保存失败'
    } finally {
      saving.value = false
    }
  }
}

watch(() => [props.modelValue, props.mode, props.authorization, props.rule] as const, () => {
  ++sequence
  error.value = ''
  submitted.value = false
  matchedCount.value = null
  users.value = []
  roles.value = []
  userId.value = props.authorization ? String(props.authorization.user_id) : null
  roleIds.value = props.authorization ? props.authorization.role_ids.map(String) : []
  ruleGroups.value = props.rule && props.rule.or_scope.length
    ? JSON.parse(JSON.stringify(props.rule.or_scope))
    : [{ conditions: [{ field: 'directLeader', operator: 'include', values: [] }] }]
  ruleRoleId.value = props.rule ? String(props.rule.role_id) : null
  if (props.modelValue) {
    if (props.mode === 'users') void loadUserOptions()
    else void loadRuleOptions()
  }
}, { immediate: true })
</script>

<style scoped>
.authorization-dialog-content { min-width: 0; }
.authorization-dialog-intro { margin: 0 0 var(--spacing-6); color: var(--color-text-secondary); font-size: var(--font-size-md); line-height: var(--performance-input-line-height); }
.authorization-dialog-hint { display: block; margin-top: var(--performance-field-error-gap); color: var(--performance-field-help-color); font-size: var(--font-size-sm); line-height: var(--performance-field-error-line-height); }
.authorization-dialog-error, .rule-dialog-error { color: var(--color-danger); }
.authorization-dialog-actions { display: flex; justify-content: flex-end; gap: var(--performance-dialog-footer-gap); }
.rule-dialog-content { min-width: 0; }
.rule-dialog-scope-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--spacing-2); color: var(--color-text-primary); font: 400 var(--font-size-md)/var(--performance-input-line-height) var(--font-sans); }
.rule-dialog-scope-head strong { font-weight: 600; }
</style>
