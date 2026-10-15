<script setup lang="ts">
import { computed, reactive, watch, ref } from 'vue'
import type { PerformanceCycleProjectShell, PerformanceProjectPayload } from '@/api/performance'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformancePermissionButton from './PerformancePermissionButton.vue'
import PerformanceTextField from './PerformanceTextField.vue'
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import PerformanceSwitch from './PerformanceSwitch.vue'
import PerformanceMultiSelect from './PerformanceMultiSelect.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  mode: 'create' | 'edit'
  project?: PerformanceCycleProjectShell | null
  canSubmit: boolean
  saving?: boolean
  evaluatorOptions?: { employees: Array<{ value: string; label: string }> }
}>(), {
  project: null,
  saving: false,
  evaluatorOptions: () => ({ employees: [] }),
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [payload: PerformanceProjectPayload]
}>()

const form = reactive({ name: '', description: '', administrators: '', dataManagers: ['HRBP'] as Array<'PROJECT_ADMIN' | 'HRBP'>, scopeLimited: false, scopeEmployeeNos: [] as string[] })
const submitted = ref(false)
const error = computed(() => submitted.value && !form.name.trim() ? '请输入项目名称' : '')
const dataManagersError = computed(() => !form.dataManagers.length ? '请选择谁可管理人员绩效数据' : '')
const scopeError = computed(() => form.scopeLimited && !form.scopeEmployeeNos.length ? '请圈定至少一名被评估人' : '')
const dataManagerOptions = [{ value: 'PROJECT_ADMIN' as const, label: '项目管理员' }, { value: 'HRBP' as const, label: 'HRBP' }]

function syncForm(project = props.project) {
  form.name = project?.name || ''
  form.description = project?.description || ''
  form.administrators = project?.administrators.join('、') || ''
  form.dataManagers = project?.data_managers ? [...project.data_managers] : ['HRBP']
  form.scopeLimited = project?.scope_limited ?? false
  form.scopeEmployeeNos = project?.scope_employee_nos ? [...project.scope_employee_nos] : []
}
function toggleDataManager(value: 'PROJECT_ADMIN' | 'HRBP', checked: boolean) {
  form.dataManagers = checked ? [...new Set([...form.dataManagers, value])] : form.dataManagers.filter(item => item !== value)
}
function close() {
  if (!props.saving) emit('update:modelValue', false)
}
function submit() {
  submitted.value = true
  if (error.value || dataManagersError.value || scopeError.value || !props.canSubmit || props.saving) return
  emit('submit', {
    name: form.name.trim(),
    description: form.description.trim() || null,
    administrators: form.administrators.split(/[、,，]/).map(value => value.trim()).filter(Boolean),
    data_managers: form.dataManagers,
    scope_limited: form.scopeLimited,
    scope_employee_nos: form.scopeLimited ? form.scopeEmployeeNos : [],
  })
}
watch(() => [props.modelValue, props.project], () => {
  if (props.modelValue) {
    submitted.value = false
    syncForm()
  }
}, { immediate: true })
</script>

<template>
  <PerformanceDialogShell
    :model-value="modelValue"
    :title="mode === 'create' ? '新建项目' : '编辑项目'"
    width="600px"
    :loading="saving"
    @close="close"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <form class="project-dialog-form" @submit.prevent="submit">
      <PerformanceFormItem
        label="项目名称"
        required
        :invalid="Boolean(error)"
        :error-message="error"
        error-id="project-name-error"
      >
        <input
          id="project-name"
          v-model="form.name"
          maxlength="128"
          required
          :aria-invalid="Boolean(error)"
          aria-describedby="project-name-error"
        />
      </PerformanceFormItem>
      <PerformanceFormItem label="描述">
        <PerformanceTextField v-model="form.description" type="textarea" input-id="project-description" :maxlength="500" show-count />
      </PerformanceFormItem>
      <PerformanceFormItem label="项目管理员">
        <input id="project-administrators" v-model="form.administrators" placeholder="多个管理员用顿号或逗号分隔" maxlength="500" />
      </PerformanceFormItem>
      <PerformanceFormItem label="谁可管理人员绩效数据" required :invalid="Boolean(dataManagersError)" :error-message="dataManagersError" error-id="project-data-managers-error">
        <div class="project-data-managers" role="group" aria-label="谁可管理人员绩效数据" aria-required="true" :aria-invalid="Boolean(dataManagersError)">
          <div v-for="option in dataManagerOptions" :key="option.value" class="project-data-manager-option">
            <PerformanceCheckbox :model-value="form.dataManagers.includes(option.value)" :label="option.label" :disabled="saving" @update:model-value="toggleDataManager(option.value, $event)" />
            <p>{{ option.value === 'PROJECT_ADMIN' ? '可管理被评估人在本周期的绩效数据，具体权限以权限管理模块配置为准' : '可管理本项目业务团队成员在本周期的绩效数据（包含对应部门负责人），具体权限以权限管理模块配置为准' }}</p>
          </div>
        </div>
      </PerformanceFormItem>
      <PerformanceFormItem label="限定考核范围">
        <div class="project-scope-limit__heading"><span>开启后，只能在限定范围内圈选被评估人</span><PerformanceSwitch v-model="form.scopeLimited" aria-label="限定考核范围" :disabled="saving" /></div>
        <PerformanceMultiSelect v-if="form.scopeLimited" v-model="form.scopeEmployeeNos" :options="evaluatorOptions.employees" placeholder="请选择被评估人" />
        <span v-if="scopeError" class="scope-error" role="alert">{{ scopeError }}</span>
      </PerformanceFormItem>
    </form>

    <template #footer>
      <div class="project-dialog-footer">
        <PerformanceButton variant="secondary" :disabled="saving" @click="close">取消</PerformanceButton>
        <PerformancePermissionButton :allowed="canSubmit" variant="primary" :disabled="saving || Boolean(error) || Boolean(dataManagersError) || Boolean(scopeError)" @click="submit">{{ saving ? '保存中...' : '确定' }}</PerformancePermissionButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<style scoped>
.project-dialog-form { display: grid; gap: 0; }
.project-data-managers { display: grid; gap: 12px; }
.project-dialog-form :deep(.performance-form-item) { margin-bottom: 20px; }
.project-data-manager-option p { margin: 2px 0 0 24px; color: var(--color-text-secondary); font-size: 14px; line-height: 22px; }
.project-scope-limit__heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--color-text-primary); font-size: 14px; line-height: 22px; }
.project-scope-limit__heading span { color: var(--color-text-secondary); }
.scope-error { display: block; margin-top: 6px; color: var(--performance-field-error-color); font-size: 13px; }
.project-dialog-form :deep(input) { box-sizing: border-box; width: 100%; height: var(--performance-control-height); padding: 4px var(--performance-input-padding-x); border: 1px solid var(--performance-field-border); border-radius: var(--performance-control-radius); color: var(--color-text-primary); font: inherit; line-height: var(--performance-input-line-height); transition: border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard); }
.project-dialog-form :deep(input:focus) { border-color: var(--performance-field-border-focus); outline: 0; box-shadow: var(--performance-field-focus-ring); }
.project-dialog-form :deep(input[aria-invalid="true"]) { border-color: var(--performance-field-border-invalid); box-shadow: none; }
.project-dialog-form :deep(input::placeholder) { color: var(--color-text-placeholder); }
.project-dialog-footer { display: flex; justify-content: flex-end; gap: var(--performance-button-gap); }
</style>
