<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { PerformanceCycleProjectShell, PerformanceProjectPayload } from '@/api/performance'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformancePermissionButton from './PerformancePermissionButton.vue'
import PerformanceTextField from './PerformanceTextField.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  mode: 'create' | 'edit'
  project?: PerformanceCycleProjectShell | null
  canSubmit: boolean
  saving?: boolean
}>(), {
  project: null,
  saving: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [payload: PerformanceProjectPayload]
}>()

const form = reactive({ name: '', description: '', administrators: '' })
const error = computed(() => !form.name.trim() ? '请输入项目名称' : '')

function syncForm(project = props.project) {
  form.name = project?.name || ''
  form.description = project?.description || ''
  form.administrators = project?.administrators.join('、') || ''
}
function close() {
  if (!props.saving) emit('update:modelValue', false)
}
function submit() {
  if (error.value || !props.canSubmit || props.saving) return
  emit('submit', {
    name: form.name.trim(),
    description: form.description.trim() || null,
    administrators: form.administrators.split(/[、,，]/).map(value => value.trim()).filter(Boolean),
  })
}
watch(() => [props.modelValue, props.project], () => {
  if (props.modelValue) syncForm()
}, { immediate: true })
</script>

<template>
  <PerformanceDialogShell
    :model-value="modelValue"
    :title="mode === 'create' ? '新建项目' : '编辑项目'"
    width="520px"
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
    </form>

    <template #footer>
      <div class="project-dialog-footer">
        <PerformanceButton variant="secondary" :disabled="saving" @click="close">取消</PerformanceButton>
        <PerformancePermissionButton
          :allowed="canSubmit"
          variant="primary"
          :disabled="saving || Boolean(error)"
          @click="submit"
        >
          {{ saving ? '保存中...' : '保存' }}
        </PerformancePermissionButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<style scoped>
.project-dialog-form { display: grid; gap: 0; }
.project-dialog-form :deep(input) { box-sizing: border-box; width: 100%; height: var(--performance-control-height); padding: 4px var(--performance-input-padding-x); border: 1px solid var(--performance-field-border); border-radius: var(--performance-control-radius); color: var(--color-text-primary); font: inherit; line-height: var(--performance-input-line-height); transition: border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard); }
.project-dialog-form :deep(input:focus) { border-color: var(--performance-field-border-focus); outline: 0; box-shadow: var(--performance-field-focus-ring); }
.project-dialog-form :deep(input[aria-invalid="true"]) { border-color: var(--performance-field-border-invalid); box-shadow: none; }
.project-dialog-form :deep(input::placeholder) { color: var(--color-text-placeholder); }
.project-dialog-footer { display: flex; justify-content: flex-end; gap: var(--performance-button-gap); }
.project-dialog-footer :deep(.el-button), .project-dialog-footer :deep(.performance-button) { min-width: var(--performance-button-min-width); height: var(--performance-button-height); }
</style>
