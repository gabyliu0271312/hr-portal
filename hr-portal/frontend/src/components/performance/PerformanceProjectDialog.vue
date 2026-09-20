<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { PerformanceCycleProjectShell, PerformanceProjectPayload } from '@/api/performance'
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
  <div v-if="modelValue" class="project-dialog-mask" role="presentation" @click.self="close">
    <form class="project-dialog" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title" @submit.prevent="submit">
      <header class="project-dialog__header">
        <h2 id="project-dialog-title">{{ mode === 'create' ? '新建项目' : '编辑项目' }}</h2>
        <button type="button" aria-label="关闭项目弹窗" :disabled="saving" @click="close">×</button>
      </header>
      <div class="project-dialog__body">
        <label for="project-name">项目名称<span>*</span></label>
        <input id="project-name" v-model="form.name" maxlength="128" required :aria-invalid="Boolean(error)" />
        <small v-if="error" class="project-error" role="alert">{{ error }}</small>
        <label for="project-description">描述</label>
        <PerformanceTextField v-model="form.description" type="textarea" input-id="project-description" :maxlength="500" show-count />
        <label for="project-administrators">项目管理员</label>
        <input id="project-administrators" v-model="form.administrators" placeholder="多个管理员用顿号或逗号分隔" maxlength="500" />
      </div>
      <footer class="project-dialog__footer">
        <button type="button" :disabled="saving" @click="close">取消</button>
        <PerformancePermissionButton :allowed="canSubmit" class="project-submit" :disabled="saving || Boolean(error)" @click="submit">
          {{ saving ? '保存中...' : '保存' }}
        </PerformancePermissionButton>
      </footer>
    </form>
  </div>
</template>

<style scoped>
.project-dialog-mask { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; background: rgba(31, 35, 41, .45); }
.project-dialog { width: min(520px, calc(100vw - 32px)); overflow: hidden; border-radius: 8px; background: #fff; box-shadow: 0 12px 32px rgba(31, 35, 41, .2); }
.project-dialog__header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 16px; border-bottom: 1px solid #dee0e3; }
.project-dialog__header h2 { margin: 0; color: #1f2329; font-size: 18px; line-height: 26px; }
.project-dialog__header button { padding: 0 4px; border: 0; background: transparent; color: #646a73; font-size: 24px; line-height: 24px; cursor: pointer; }
.project-dialog__body { display: grid; gap: 8px; padding: 20px 24px; }
.project-dialog__body label { color: #1f2329; font-size: 14px; font-weight: 600; line-height: 22px; }
.project-dialog__body label:not(:first-child) { margin-top: 8px; }
.project-dialog__body label span { color: #f04438; }
.project-dialog__body input, .project-dialog__body textarea { box-sizing: border-box; width: 100%; padding: 7px 10px; border: 1px solid #d0d3d6; border-radius: 6px; color: #1f2329; font: inherit; line-height: 22px; }
.project-dialog__body textarea { min-height: 88px; field-sizing: content; resize: none; overflow-y: hidden; }
.project-dialog__body input:focus, .project-dialog__body textarea:focus { border-color: #3370ff; outline: 2px solid rgba(51, 112, 255, .2); }
.project-error { color: #f04438; line-height: 20px; }
.project-dialog__footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 24px 20px; }
.project-dialog__footer > button { min-width: 72px; height: 32px; padding: 4px 16px; border: 1px solid #d0d3d6; border-radius: 6px; background: #fff; color: #1f2329; font: inherit; cursor: pointer; }
.project-dialog__footer .project-submit { min-width: 72px; height: 32px; padding: 4px 16px; border: 1px solid #3370ff; border-radius: 6px; background: #3370ff; color: #fff; }
.project-dialog__footer .project-submit:disabled { border-color: #f2f3f5; background: #f2f3f5; color: #bbbfc4; cursor: not-allowed; }
</style>
