<template>
  <PerformanceDialogShell v-model="open" :title="`编辑${role?.role_name || ''}可见字段`" width="520px" :loading="saving" @close="cancel">
    <div class="subject-visibility-editor__description">选择该角色可查看的被评估人信息字段</div>
    <div class="subject-visibility-editor__fields">
      <PerformanceCheckbox
        v-for="option in fieldOptions"
        :key="option.key"
        :model-value="draftFields.includes(option.key)"
        :label="option.label"
        :disabled="saving"
        @update:model-value="toggle(option.key, $event)"
      />
    </div>
    <template #footer>
      <div class="subject-visibility-editor__actions">
        <button type="button" :disabled="saving" @click="cancel">取消</button>
        <button class="primary" type="button" :disabled="saving" @click="submit">确定</button>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PerformanceSubjectVisibilityFieldOption, PerformanceSubjectVisibilityRole } from '@/api/performance'
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  role: PerformanceSubjectVisibilityRole | null
  fieldOptions: PerformanceSubjectVisibilityFieldOption[]
  saving?: boolean
}>(), { saving: false })
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [visibleFields: string[]]
}>()
const draftFields = ref<string[]>([])
const open = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })

watch(() => [props.modelValue, props.role] as const, ([visible]) => {
  if (visible) draftFields.value = [...(props.role?.visible_fields || [])]
}, { immediate: true })

function toggle(key: string, checked: boolean) {
  const selected = checked
    ? new Set([...draftFields.value, key])
    : new Set(draftFields.value.filter(field => field !== key))
  draftFields.value = props.fieldOptions.filter(option => selected.has(option.key)).map(option => option.key)
}
function cancel() { if (!props.saving) emit('update:modelValue', false) }
function submit() { if (!props.saving) emit('submit', [...draftFields.value]) }
</script>

<style scoped>
.subject-visibility-editor__description{margin-bottom:16px;color:#646a73;font-size:14px;line-height:22px}.subject-visibility-editor__fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 24px}.subject-visibility-editor__actions{display:flex;justify-content:flex-end;gap:12px}.subject-visibility-editor__actions button{min-width:80px;height:32px;padding:4px 16px;border:1px solid #d0d3d6;border-radius:6px;background:#fff;color:#1f2329;cursor:pointer;font:400 14px/22px inherit}.subject-visibility-editor__actions button.primary{border-color:#3370ff;background:#3370ff;color:#fff}.subject-visibility-editor__actions button:disabled{cursor:not-allowed;opacity:.6}
</style>
