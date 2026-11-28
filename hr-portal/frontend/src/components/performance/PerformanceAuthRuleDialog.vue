<template>
  <PerformanceDialogShell :model-value="modelValue" :title="rule ? '编辑规则' : '添加规则'" width="var(--performance-dialog-md-width)" :loading="saving" @update:model-value="close">
    <PerformanceFormItem label="用户范围" required>
      <p class="rule-count" role="status">符合条件的员工，共计 {{ resolving ? '计算中' : count ?? '--' }} 人</p>
      <PerformanceAudienceRuleEditor v-model="groups" scope-mode :show-scope-heading="false" default-field="directLeader" :allowed-fields="allowedFields" :organization-tree="options.organization_tree" :person-options="options.people" :snapshot-options="options" :employee-type-options="options.employee_types" :hire-date-range="options.hire_date_range" :loading="loading" :disabled="saving" :highlight-invalid="submitted">
        <template #group-heading-extra="{ index }"><span>同时满足以下条件：{{ groupCounts[index] ?? '--' }} 人</span></template>
      </PerformanceAudienceRuleEditor>
    </PerformanceFormItem>
    <PerformanceFormItem label="授权角色" required :invalid="submitted && !roleId">
      <PerformanceSearchSelect v-model="roleId" :options="roles" placeholder="请选择授权角色" aria-label="授权角色" :disabled="loading || saving" />
    </PerformanceFormItem>
    <p v-if="error" role="alert" class="rule-error">{{ error }} <UiButton v-if="loadFailed" variant="text" @click="loadOptions">重试</UiButton></p>
    <p v-if="previewError" role="alert" class="rule-error">{{ previewError }}</p>
    <template #footer><div class="rule-actions">
      <UiButton variant="secondary" :disabled="saving" @click="close(false)">取消</UiButton>
      <UiButton variant="primary" :disabled="loading || saving || loadFailed" @click="save">{{ saving ? '保存中' : '保存' }}</UiButton>
    </div></template>
  </PerformanceDialogShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { performanceAuthRuleApi, type PerformanceAudienceField, type PerformanceAudienceGroup, type PerformanceAuthRule, type PerformanceAuthRuleOptions } from '@/api/performance'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformanceAudienceRuleEditor from './PerformanceAudienceRuleEditor.vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import UiButton from '../ui/UiButton.vue'
import { PERFORMANCE_CONDITION_FIELDS, isDateConditionField, validHireDateCondition } from './performanceConditionFields'

const props = defineProps<{ modelValue: boolean; rule?: PerformanceAuthRule | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; saved: [] }>()
const groups = ref<PerformanceAudienceGroup[]>([])
const roleId = ref<string | string[] | null>(null)
const options = ref<PerformanceAuthRuleOptions>({ fields: [], organization_tree: [], people: [], roles: [], job_families: [], position_levels: [], employee_types: [], hire_date_range: { min: null, max: null } })
const allowedFields = computed(() => options.value.fields.filter(field => field.key in PERFORMANCE_CONDITION_FIELDS).map(field => field.key as PerformanceAudienceField))
const roles = computed(() => {
  const available = options.value.roles.map(role => ({ value: String(role.id), label: role.name }))
  if (props.rule && !available.some(role => role.value === String(props.rule?.role_id))) available.push({ value: String(props.rule.role_id), label: `${props.rule.role_name}（已停用或不可用，请更换）` })
  return available
})
const count = ref<number | null>(null)
const groupCounts = ref<number[]>([])
const loading = ref(false)
const saving = ref(false)
const resolving = ref(false)
const loadFailed = ref(false)
const submitted = ref(false)
const error = ref('')
const previewError = ref('')
let loadVersion = 0
let previewVersion = 0
let previewTimer: ReturnType<typeof setTimeout> | undefined
const validScope = computed(() => groups.value.length > 0 && groups.value.every(group => group.conditions.length > 0 && group.conditions.every(condition =>
  allowedFields.value.includes(condition.field) && condition.values.length > 0 && condition.values.every(value => value.trim())
  && (isDateConditionField(condition.field) ? validHireDateCondition(condition.operator, condition.values) : ['include', 'exclude'].includes(condition.operator)),
)))

async function loadOptions() {
  const version = ++loadVersion
  loading.value = true
  loadFailed.value = false
  error.value = ''
  try {
    const result = await performanceAuthRuleApi.options()
    if (version === loadVersion && props.modelValue) options.value = result
  } catch (e: any) {
    if (version === loadVersion && props.modelValue) {
      error.value = e?.response?.data?.detail || e?.message || '范围选项加载失败'
      loadFailed.value = true
    }
  } finally {
    if (version === loadVersion) loading.value = false
  }
}

watch([groups, validScope], () => {
  const version = ++previewVersion
  clearTimeout(previewTimer)
  count.value = null
  groupCounts.value = []
  previewError.value = ''
  resolving.value = false
  if (!props.modelValue || !validScope.value) return
  resolving.value = true
  const scope = JSON.parse(JSON.stringify(groups.value))
  previewTimer = setTimeout(async () => {
    try {
      const result = await performanceAuthRuleApi.resolveScope(scope)
      if (version !== previewVersion || !props.modelValue) return
      count.value = result.count
      groupCounts.value = result.group_counts || []
    } catch (e: any) {
      if (version === previewVersion && props.modelValue) previewError.value = e?.response?.data?.detail || '范围人数计算失败，请重新选择条件'
    } finally {
      if (version === previewVersion) resolving.value = false
    }
  }, 300)
}, { deep: true })

async function save() {
  if (saving.value || loading.value || loadFailed.value) return
  submitted.value = true
  if (!validScope.value || typeof roleId.value !== 'string' || !options.value.roles.some(role => String(role.id) === roleId.value)) {
    error.value = '请选择完整范围条件和有效的授权角色'
    return
  }
  saving.value = true
  error.value = ''
  try {
    await performanceAuthRuleApi.save(Number(roleId.value), groups.value, Boolean(props.rule), props.rule?.id)
    emit('saved')
    emit('update:modelValue', false)
  } catch (e: any) {
    error.value = e?.response?.data?.detail || e?.message || '规则保存失败'
  } finally {
    saving.value = false
  }
}
function close(value: boolean) { if (!saving.value) emit('update:modelValue', value) }
watch(() => [props.modelValue, props.rule] as const, () => {
  ++loadVersion
  ++previewVersion
  clearTimeout(previewTimer)
  error.value = ''
  previewError.value = ''
  count.value = null
  groupCounts.value = []
  resolving.value = false
  submitted.value = false
  groups.value = props.rule ? JSON.parse(JSON.stringify(props.rule.or_scope)) : [{ conditions: [{ field: 'directLeader', operator: 'include', values: [] }] }]
  roleId.value = props.rule ? String(props.rule.role_id) : null
  if (props.modelValue) void loadOptions()
}, { immediate: true })
onBeforeUnmount(() => { ++loadVersion; ++previewVersion; clearTimeout(previewTimer) })
</script>

<style scoped>
.rule-count { margin: 0 0 var(--spacing-2); color: var(--color-text-secondary); font-size: var(--font-size-md); line-height: var(--performance-input-line-height); }
.rule-error { color: var(--performance-field-error-color); }
.rule-actions { display: flex; justify-content: flex-end; gap: var(--performance-dialog-footer-gap); }
</style>
