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
        <PerformanceSwitch
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

        <div class="permission-range-preview">
          <template v-if="selectedPeople.length">
            <span class="permission-range-preview__field">员工</span>
            <span>包含</span>
            <span v-for="person in selectedPeople" :key="person.employee_no" class="permission-range-preview__person">
              <span class="permission-range-preview__avatar" aria-hidden="true">{{ person.display_name.slice(0, 1) }}</span>
              <span>{{ person.display_name }}</span>
            </span>
          </template>
          <span v-else class="permission-range-preview__empty">暂未设置特定范围</span>
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
        <PerformanceSwitch
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
          <PerformanceButton variant="secondary" :disabled="savingTarget === 'reminder-editor'" @click="reminderEditorVisible = false">取消</PerformanceButton>
          <PerformanceButton variant="primary" :disabled="savingTarget === 'reminder-editor'" @click="saveReminderNodeTypes">确定</PerformanceButton>
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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  performanceOtherPermissionSettingsApi,
  type PerformanceHrbpOrganizationNode,
  type PerformanceOtherPermissionHrbpPermission,
  type PerformanceOtherPermissionHrbpPermissionPayload,
  type PerformanceOtherPermissionPerson,
  type PerformanceOtherPermissionSettings,
} from '@/api/performance'
import PerformanceButton from '@/components/performance/PerformanceButton.vue'
import PerformanceDialogShell from '@/components/performance/PerformanceDialogShell.vue'
import PerformanceFormItem from '@/components/performance/PerformanceFormItem.vue'
import PerformanceHrbpPermissionDialog, { type PerformanceHrbpPermissionFormValue } from '@/components/performance/PerformanceHrbpPermissionDialog.vue'
import PerformancePermissionButton from '@/components/performance/PerformancePermissionButton.vue'
import PerformanceSearchSelect, { type PerformanceSearchSelectOption } from '@/components/performance/PerformanceSearchSelect.vue'
import PerformanceSwitch from '@/components/performance/PerformanceSwitch.vue'

const enabled = ref(false)
const selectedPeople = ref<PerformanceOtherPermissionPerson[]>([])
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
const reminderEditorNodeTypes = ref<string[]>([])
const editorVisible = ref(false)
const reminderEditorVisible = ref(false)
const loading = ref(false)
type SavingTarget = 'hrbp-switch' | 'manager-switch' | 'people-editor' | 'reminder-editor'
const savingTarget = ref<SavingTarget | null>(null)
const loadError = ref('')

function applySettings(settings: PerformanceOtherPermissionSettings) {
  enabled.value = settings.hrbp_invisible_scope_enabled ?? false
  hrbpPermissions.value = Array.isArray(settings.hrbp_permissions) ? settings.hrbp_permissions : []
  selectedPeople.value = hrbpPermissions.value[0]?.invisible_people
    || (Array.isArray(settings.hrbp_invisible_people) ? settings.hrbp_invisible_people : [])
  managerReminderEnabled.value = settings.manager_reminder_enabled ?? true
  managerReminderNodeTypes.value = Array.isArray(settings.manager_reminder_node_types)
    ? settings.manager_reminder_node_types
    : [...defaultReminderNodeTypes]
  const options = (Array.isArray(settings.people_options) ? settings.people_options : []).map(person => ({
    value: person.employee_no,
    label: person.display_name,
  }))
  hrbpOptions.value = options
  invisiblePeopleOptions.value = options
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

async function updateSettings(
  changes: Partial<{
    hrbp_invisible_scope_enabled: boolean
    hrbp_invisible_people: string[]
    hrbp_permissions: PerformanceOtherPermissionHrbpPermissionPayload[]
    manager_reminder_enabled: boolean
    manager_reminder_node_types: string[]
  }>,
  target: SavingTarget,
) {
  savingTarget.value = target
  try {
    const settings = await performanceOtherPermissionSettingsApi.update({
      hrbp_invisible_scope_enabled: changes.hrbp_invisible_scope_enabled ?? enabled.value,
      hrbp_invisible_people: changes.hrbp_invisible_people ?? selectedPeople.value.map(person => person.employee_no),
      ...(changes.hrbp_permissions ? { hrbp_permissions: changes.hrbp_permissions } : {}),
      manager_reminder_enabled: changes.manager_reminder_enabled ?? managerReminderEnabled.value,
      manager_reminder_node_types: changes.manager_reminder_node_types ?? managerReminderNodeTypes.value,
    })
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
  const current = hrbpPermissions.value[0]
  editorMode.value = current ? 'edit' : 'create'
  editorInitialValue.value = current
    ? {
        hrbp: current.hrbp.employee_no,
        scope: [...current.scope],
        invisiblePeopleEnabled: current.invisible_people.length > 0,
        invisiblePeople: current.invisible_people.map(person => person.employee_no),
      }
    : {}
  editorVisible.value = true
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
.permission-range-preview__field { padding: 0 6px; border-radius: 4px; background: rgba(31, 35, 41, .1); }
.permission-range-preview__person { display: inline-flex; max-width: 220px; align-items: center; gap: 4px; overflow: hidden; padding: 1px 8px 1px 2px; border-radius: 999999px; background: rgba(31, 35, 41, .1); white-space: nowrap; }
.permission-range-preview__avatar { display: grid; width: 20px; height: 20px; flex: 0 0 20px; place-items: center; border-radius: 50%; background: #3370ff; color: #fff; font-size: 12px; }
.permission-range-preview__empty { color: #8f959e; }
.permission-settings-card__error { display: flex; min-height: 80px; align-items: center; justify-content: center; gap: 12px; color: #646a73; }
.permission-settings-card__error button { padding: 0; border: 0; background: transparent; color: #3370ff; cursor: pointer; }
.permission-settings-editor__actions { display: flex; justify-content: flex-end; gap: var(--performance-button-gap); }
.permission-settings-editor__button { min-width: 80px; height: 32px; padding: 4px 11px; border: 1px solid #d0d3d6; border-radius: 6px; background: #fff; color: #1f2329; font: 400 14px/22px var(--font-sans); cursor: pointer; }
.permission-settings-editor__button--primary { border-color: #1456f0; background: #1456f0; color: #fff; }
.permission-settings-editor__button:disabled { cursor: not-allowed; opacity: .6; }
@media (max-width: 720px) { .permission-settings-card { padding: 16px; }.permission-settings-card__rule { align-items: flex-start; }.permission-settings-card__rule :deep(.performance-switch) { margin-top: 3px; } }
</style>
