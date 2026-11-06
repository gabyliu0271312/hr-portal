<template>
  <div class="other-permission-settings-page">
    <h1>其他权限设置</h1>

    <section class="permission-settings-card">
      <h2>HRBP不可见范围</h2>

      <div class="permission-settings-card__rule">
        <div>
          <h3>通用规则：不可查看对应部门负责人的绩效详情</h3>
          <p>打开后，将向 HRBP 隐藏对应部门负责人的绩效详情，但下级部门负责人的绩效详情依然对 HRBP 可见</p>
        </div>
        <UiSwitch
          :model-value="enabled"
          aria-label="HRBP不可见范围通用规则"
          :disabled="loading || savingTarget === 'hrbp-switch'"
          @update:model-value="toggleEnabled"
        />
      </div>

      <div v-if="loadError" class="permission-settings-card__error" role="alert">
        <span>{{ loadError }}</span>
        <button type="button" @click="loadSettings">重新加载</button>
      </div>

      <div v-else class="permission-settings-card__specific">
        <div class="permission-settings-card__specific-header">
          <h3>特定范围</h3>
          <PerformancePermissionButton
            v-if="invisibleRules.length"
            :allowed="true"
            op="U"
            aria-label="编辑特定范围"
            class="permission-settings-edit-button"
            :disabled="loading || savingTarget === 'people-editor' || savingTarget === 'reminder-editor'"
            @click="openEditor"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" data-icon="EditOutlined" aria-hidden="true">
              <path d="m17.57 7.244-.006-.006.37-.37a1 1 0 0 0 .001-1.412l-3.434-3.453-.002-.002a1 1 0 0 0-1.414 0l-.705.706.01.01L2 13.186V17a1 1 0 0 0 1 1h3.814L17.57 7.244Zm-3.273.389-2.015-2.015 1.487-1.515 2.023 2.034-1.495 1.496Zm-3.415-.587 2.002 2.002-6.913 6.92h-.004l-1.934-1.935v-.003l6.849-6.984ZM3 20a1 1 0 1 0 0 2h18a1 1 0 1 0 0-2H3Z" fill="currentColor" />
            </svg>
            <span>编辑</span>
          </PerformancePermissionButton>
        </div>

        <PerformanceHrbpInvisibleScopeSummary v-if="invisibleRules.length" :groups="invisibleRules" :people="summaryPeople" :organization-tree="organizationTree" />
        <div v-else-if="loading" class="permission-range-state" role="status">正在加载...</div>
        <div v-else class="permission-range-empty" role="status">
          <MetricTemplateEmptyIllustration />
          <span>暂无内容</span>
          <PerformancePermissionButton :allowed="true" op="U" variant="primary" :disabled="savingTarget !== null" aria-label="设置范围" @click="openEditor">设置范围</PerformancePermissionButton>
        </div>
      </div>
    </section>

    <section class="permission-settings-card manager-permission-card">
      <h2>管理者权限</h2>

      <div class="permission-settings-card__rule manager-permission-card__rule">
        <div>
          <h3>管理者可催办任务</h3>
          <p>开启后，有绩效查看权限的实线上级、虚线上级可催办下级的任务进展，校准人可催办被校准人的任务进展。</p>
        </div>
        <UiSwitch
          :model-value="managerReminderEnabled"
          aria-label="管理者可催办任务"
          :disabled="loading || savingTarget === 'manager-switch'"
          @update:model-value="toggleManagerReminder"
        />
      </div>

      <div class="permission-settings-card__specific manager-permission-card__specific">
        <div class="permission-settings-card__specific-header">
          <h3>可催办的环节类型</h3>
          <PerformancePermissionButton
            :allowed="true"
            op="U"
            aria-label="编辑可催办的环节类型"
            class="permission-settings-edit-button"
            :disabled="loading || savingTarget === 'people-editor' || savingTarget === 'reminder-editor'"
            @click="openReminderEditor"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" data-icon="EditOutlined" aria-hidden="true">
              <path d="m17.57 7.244-.006-.006.37-.37a1 1 0 0 0 .001-1.412l-3.434-3.453-.002-.002a1 1 0 0 0-1.414 0l-.705.706.01.01L2 13.186V17a1 1 0 0 0 1 1h3.814L17.57 7.244Zm-3.273.389-2.015-2.015 1.487-1.515 2.023 2.034-1.495 1.496Zm-3.415-.587 2.002 2.002-6.913 6.92h-.004l-1.934-1.935v-.003l6.849-6.984ZM3 20a1 1 0 1 0 0 2h18a1 1 0 0 0 0-2H3Z" fill="currentColor" />
            </svg>
            <span>编辑</span>
          </PerformancePermissionButton>
        </div>
        <div class="permission-range-preview manager-permission-card__preview">{{ reminderNodeTypeLabels.length ? reminderNodeTypeLabels.join('、') : '暂无可催办环节' }}</div>
      </div>
    </section>

    <PerformanceDialogShell v-model="reminderEditorVisible" title="编辑可催办的环节类型" :loading="savingTarget === 'reminder-editor'">
      <PerformanceFormItem label="可催办的环节类型">
        <PerformanceSearchSelect
          v-model="reminderEditorNodeTypes"
          :options="reminderOptions"
          aria-label="可催办的环节类型"
          placeholder="请选择"
          multiple
        />
      </PerformanceFormItem>
      <template #footer>
        <div class="permission-settings-editor__actions">
          <UiButton variant="secondary" :disabled="savingTarget === 'reminder-editor'" @click="reminderEditorVisible = false">取消</UiButton>
          <UiButton variant="primary" :disabled="savingTarget === 'reminder-editor'" @click="saveReminderNodeTypes">确定</UiButton>
        </div>
      </template>
    </PerformanceDialogShell>

    <PerformanceHrbpPermissionDialog
      v-model="editorVisible"
      :mode="editorMode"
      :saving="savingTarget === 'people-editor'"
      :hrbp-options="hrbpOptions"
      :organization-tree="organizationTree"
      :invisible-people-options="invisiblePeopleOptions"
      :initial-value="editorInitialValue"
      @submit="saveHrbpPermission"
    />

    <PerformanceHrbpScopeDialog
      v-model="scopeEditorVisible"
      :saving="savingTarget === 'scope-editor'"
      :organization-tree="organizationTree"
      :person-options="invisiblePeopleOptions"
      :initial-value="scopeEditorInitialValue"
      @open-options="loadSettings"
      @search-people="searchScopePeople"
      @submit="saveHrbpScope"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  performanceOtherPermissionSettingsApi,
  type PerformanceAudienceGroup,
  type PerformanceHrbpOrganizationNode,
  type PerformanceOtherPermissionHrbpPermission,
  type PerformanceOtherPermissionHrbpPermissionPayload,
  type PerformanceOtherPermissionPerson,
  type PerformanceOtherPermissionSettings,
} from '@/api/performance'
import { identitySwitchApi } from '@/api/identitySwitch'
import UiButton from '@/components/ui/UiButton.vue'
import PerformanceDialogShell from '@/components/performance/PerformanceDialogShell.vue'
import PerformanceFormItem from '@/components/performance/PerformanceFormItem.vue'
import PerformanceHrbpPermissionDialog, { type PerformanceHrbpPermissionFormValue } from '@/components/performance/PerformanceHrbpPermissionDialog.vue'
import PerformanceHrbpScopeDialog, { type PerformanceHrbpScopeFormValue } from '@/components/performance/PerformanceHrbpScopeDialog.vue'
import PerformancePermissionButton from '@/components/performance/PerformancePermissionButton.vue'
import PerformanceSearchSelect, { type PerformanceSearchSelectOption } from '@/components/performance/PerformanceSearchSelect.vue'
import MetricTemplateEmptyIllustration from '@/components/performance/MetricTemplateEmptyIllustration.vue'
import PerformanceHrbpInvisibleScopeSummary from '@/components/performance/PerformanceHrbpInvisibleScopeSummary.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'

const enabled = ref(false)
const invisibleRules = ref<PerformanceAudienceGroup[]>([])
const summaryPeople = ref<PerformanceOtherPermissionPerson[]>([])
const hrbpPermissions = ref<PerformanceOtherPermissionHrbpPermission[]>([])
const organizationTree = ref<PerformanceHrbpOrganizationNode[]>([])
const hrbpOptions = ref<PerformanceSearchSelectOption[]>([])
const invisiblePeopleOptions = ref<PerformanceSearchSelectOption[]>([])
const managerReminderEnabled = ref(true)
const managerReminderNodeTypes = ref<string[]>([])
const reminderOptions: PerformanceSearchSelectOption[] = [
  { value: 'work_summary', label: '工作总结环节' },
  { value: 'evaluation', label: '评估型环节' },
  { value: 'result_communication', label: '结果沟通环节' },
  { value: 'result_view', label: '查看绩效结果' },
]
const reminderNodeTypeLabels = computed(() => reminderOptions
  .filter(option => managerReminderNodeTypes.value.includes(option.value))
  .map(option => option.label))
const defaultReminderNodeTypes = reminderOptions.map(option => option.value)
const editorMode = ref<'create' | 'edit'>('create')
const editorInitialValue = ref<Partial<PerformanceHrbpPermissionFormValue>>({})
const scopeEditorVisible = ref(false)
const scopeEditorInitialValue = ref<import('@/api/performance').PerformanceAudienceGroup[] | undefined>(undefined)
const reminderEditorNodeTypes = ref<string[]>([])
const editorVisible = ref(false)
const reminderEditorVisible = ref(false)
const loading = ref(false)
type SavingTarget = 'hrbp-switch' | 'manager-switch' | 'people-editor' | 'scope-editor' | 'reminder-editor'
const savingTarget = ref<SavingTarget | null>(null)
const loadError = ref('')
let peopleSearchTimer: ReturnType<typeof setTimeout> | undefined

function applySettings(settings: PerformanceOtherPermissionSettings) {
  enabled.value = settings.hrbp_invisible_scope_enabled ?? false
  hrbpPermissions.value = Array.isArray(settings.hrbp_permissions) ? settings.hrbp_permissions : []
  const legacyPeople = Array.isArray(settings.hrbp_invisible_people) ? settings.hrbp_invisible_people : []
  invisibleRules.value = Array.isArray(settings.hrbp_invisible_rules)
    ? settings.hrbp_invisible_rules
    : legacyPeople.length ? [{ conditions: [{ field: 'employee', operator: 'include', values: legacyPeople.map(person => person.employee_no) }] }] : []
  summaryPeople.value = [...legacyPeople, ...(settings.people_options || [])]
  managerReminderEnabled.value = settings.manager_reminder_enabled ?? true
  managerReminderNodeTypes.value = Array.isArray(settings.manager_reminder_node_types)
    ? settings.manager_reminder_node_types
    : [...defaultReminderNodeTypes]
  const options = (Array.isArray(settings.people_options) ? settings.people_options : []).map(person => ({
    value: person.employee_no,
    label: person.display_name,
    avatarFallback: person.display_name.slice(-1),
    subLabel: person.department ?? '',
  }))
  hrbpOptions.value = options
  const current = [...new Map([...invisiblePeopleOptions.value, ...options].map(option => [option.value, option])).values()]
  invisiblePeopleOptions.value = current
  organizationTree.value = Array.isArray(settings.organization_tree) ? settings.organization_tree : []
}

async function loadSettings() {
  loading.value = true
  loadError.value = ''
  try {
    applySettings(await performanceOtherPermissionSettingsApi.get())
  } catch (error: any) {
    loadError.value = error?.response?.data?.detail || '其他权限设置加载失败'
  } finally {
    loading.value = false
  }
}

let peopleSearchVersion = 0

function searchScopePeople(keyword: string) {
  const trimmed = keyword.trim()
  const version = ++peopleSearchVersion
  clearTimeout(peopleSearchTimer)
  if (!trimmed) return
  peopleSearchTimer = setTimeout(async () => {
    try {
      const result = await identitySwitchApi.people(trimmed, 1)
      if (version !== peopleSearchVersion || !scopeEditorVisible.value) return
      const options = result.items.map(person => ({
        value: person.employee_no,
        label: person.display_name,
        avatarFallback: person.display_name.slice(-1),
        subLabel: person.organization_label ?? '',
      }))
      invisiblePeopleOptions.value = [...new Map([...invisiblePeopleOptions.value, ...options].map(option => [option.value, option])).values()]
    } catch {
      if (version === peopleSearchVersion) ElMessage.error('人员搜索失败，请重试')
    }
  }, 300)
}

async function updateSettings(
  changes: import('@/api/performance').PerformanceOtherPermissionSettingsPayload,
  target: SavingTarget,
) {
  savingTarget.value = target
  try {
    const settings = await performanceOtherPermissionSettingsApi.update(changes)
    applySettings(settings)
    return true
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.detail || '其他权限设置保存失败')
    return false
  } finally {
    savingTarget.value = null
  }
}

async function toggleEnabled(value: boolean) {
  const previous = enabled.value
  enabled.value = value
  const saved = await updateSettings({ hrbp_invisible_scope_enabled: value }, 'hrbp-switch')
  if (!saved) enabled.value = previous
}

async function toggleManagerReminder(value: boolean) {
  const previous = managerReminderEnabled.value
  managerReminderEnabled.value = value
  const saved = await updateSettings({ manager_reminder_enabled: value }, 'manager-switch')
  if (!saved) managerReminderEnabled.value = previous
}

function openEditor() {
  if (loading.value || savingTarget.value) return
  scopeEditorInitialValue.value = invisibleRules.value.length ? invisibleRules.value : undefined
  scopeEditorVisible.value = true
}

async function saveHrbpPermission(value: PerformanceHrbpPermissionFormValue) {
  const permissions: PerformanceOtherPermissionHrbpPermissionPayload[] = [
    ...hrbpPermissions.value
      .filter(permission => permission.hrbp.employee_no !== value.hrbp)
      .map(permission => ({
        hrbp: permission.hrbp.employee_no,
        scope: [...permission.scope],
        invisible_people: permission.invisible_people.map(person => person.employee_no),
      })),
    {
      hrbp: value.hrbp,
      scope: [...value.scope],
      invisible_people: value.invisiblePeopleEnabled ? [...value.invisiblePeople] : [],
    },
  ]
  const saved = await updateSettings({ hrbp_permissions: permissions }, 'people-editor')
  if (!saved) return
  editorVisible.value = false
  ElMessage.success('保存成功')
}

async function saveHrbpScope(value: PerformanceHrbpScopeFormValue) {
  const saved = await updateSettings({ hrbp_invisible_rules: value.groups }, 'scope-editor')
  if (!saved) return
  scopeEditorVisible.value = false
  ElMessage.success('保存成功')
}

function openReminderEditor() {
  reminderEditorNodeTypes.value = [...managerReminderNodeTypes.value]
  reminderEditorVisible.value = true
}

async function saveReminderNodeTypes() {
  const saved = await updateSettings({ manager_reminder_node_types: reminderEditorNodeTypes.value }, 'reminder-editor')
  if (!saved) return
  reminderEditorVisible.value = false
  ElMessage.success('保存成功')
}

onBeforeUnmount(() => {
  clearTimeout(peopleSearchTimer)
  peopleSearchVersion += 1
})
onMounted(loadSettings)
</script>

<style scoped>
.other-permission-settings-page { min-height: 0; color: #1f2329; font-family: var(--font-sans); }
.other-permission-settings-page > h1 { margin: 0 0 16px; font-size: 20px; font-weight: 600; line-height: 28px; }
.permission-settings-card { box-sizing: border-box; margin-bottom: 16px; padding: 20px; border: 1px solid transparent; border-radius: 8px; background: #fff; box-shadow: rgba(31, 35, 41, .02) 0 1px 2px -2px, rgba(31, 35, 41, .02) 0 2px 4px, rgba(31, 35, 41, .02) 0 2px 8px 2px; }
.permission-settings-card h2 { margin: 0; font-size: 18px; font-weight: 500; line-height: 28px; }
.permission-settings-card h3 { margin: 0; font-size: 14px; font-weight: 500; line-height: 22px; }
.permission-settings-card p { margin: 0; color: #646a73; font-size: 14px; line-height: 22px; }
.permission-settings-card__rule { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-top: 16px; padding-bottom: 20px; border-bottom: 1px solid rgba(31, 35, 41, .08); }
.permission-settings-card__rule > div { min-width: 0; }
.permission-settings-card__rule :deep(.performance-switch) { flex: 0 0 var(--performance-switch-width); }
.permission-settings-card__specific { margin-top: 16px; }
.permission-settings-card__specific-header { display: flex; height: 32px; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.permission-range-preview { display: flex; min-height: 48px; align-items: center; flex-wrap: wrap; gap: 6px; padding: 12px 0; box-sizing: border-box; border-radius: 8px; background: #f5f6f7; font-size: 14px; line-height: 24px; }
.manager-permission-card__preview { min-height: 45px; line-height: 21px; }
.permission-range-empty { display: flex; min-height: 240px; flex-direction: column; align-items: center; justify-content: center; gap: var(--spacing-2); font-size: var(--font-size-md); line-height: 22px; }
.permission-range-state { padding: var(--spacing-6); color: var(--color-text-secondary); text-align: center; }
.permission-settings-card__error { display: flex; min-height: 80px; align-items: center; justify-content: center; gap: 12px; color: #646a73; }
.permission-settings-card__error button { padding: 0; border: 0; background: transparent; color: #3370ff; cursor: pointer; }
.permission-settings-editor__actions { display: flex; justify-content: flex-end; gap: var(--performance-button-gap); }
.permission-settings-editor__button { min-width: 80px; height: 32px; padding: 4px 11px; border: 1px solid #d0d3d6; border-radius: 6px; background: #fff; color: #1f2329; font: 400 14px/22px var(--font-sans); cursor: pointer; }
.permission-settings-editor__button--primary { border-color: var(--color-primary); background: var(--color-primary); color: #fff; }
.permission-settings-editor__button:disabled { cursor: not-allowed; opacity: .6; }
@media (max-width: 720px) { .permission-settings-card { padding: 16px; }.permission-settings-card__rule { align-items: flex-start; }.permission-settings-card__rule :deep(.performance-switch) { margin-top: 3px; } }
</style>
