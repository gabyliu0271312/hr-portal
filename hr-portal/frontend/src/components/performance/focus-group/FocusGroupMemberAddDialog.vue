<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { performanceFocusGroupApi } from '@/api/performance'
import PerformanceDialogShell from '../PerformanceDialogShell.vue'
import PerformancePersonSelect from '../PerformancePersonSelect.vue'
import type { PerformanceSearchSelectOption } from '../PerformanceSearchSelect.vue'
import UiButton from '@/components/ui/UiButton.vue'

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
const selected = ref<string[]>([])
const options = ref<PerformanceSearchSelectOption[]>([])
const searching = ref(false)
const saving = ref(false)
const error = ref('')
let searchVersion = 0

watch(() => props.modelValue, visible => {
  if (visible) {
    selected.value = []
    options.value = []
    error.value = ''
  }
})

async function search(keyword: string) {
  const query = keyword.trim()
  if (!query || !props.cycleId) { options.value = []; return }
  const version = ++searchVersion
  searching.value = true
  try {
    const result = await performanceFocusGroupApi.searchPeople(props.cycleId, query)
    if (version !== searchVersion) return
    options.value = result.map(person => ({ value: person.value, label: person.label, subLabel: person.sub_label || undefined }))
  } catch {
    if (version === searchVersion) options.value = []
  } finally {
    if (version === searchVersion) searching.value = false
  }
}

async function submit() {
  if (!props.cycleId || !props.groupId || saving.value) return
  if (!selected.value.length) { error.value = '请选择要添加的成员'; return }
  saving.value = true
  error.value = ''
  try {
    const next = [...props.currentEmployeeNos]
    for (const employeeNo of selected.value) {
      if (!next.includes(employeeNo)) next.push(employeeNo)
    }
    await performanceFocusGroupApi.updateMembers(props.cycleId, props.groupId, next)
    emit('added')
    emit('update:modelValue', false)
    ElMessage.success('添加成功')
  } catch (e: any) {
    error.value = e?.response?.data?.detail || '添加失败，请稍后重试'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <PerformanceDialogShell v-model="open" title="添加成员" :loading="saving" @close="emit('update:modelValue', false)">
    <p v-if="error" class="focus-group-member-add-error" role="alert">{{ error }}</p>
    <PerformancePersonSelect
      v-model="selected"
      :options="options"
      :remote-search="true"
      multiple
      placeholder="搜索并选择成员"
      aria-label="选择要添加的成员"
      :disabled="saving || !cycleId"
      @search="search"
    />
    <template #footer>
      <div class="focus-group-member-add-footer">
        <UiButton variant="primary" :loading="saving" :disabled="!selected.length || !cycleId" @click="submit">确定</UiButton>
        <UiButton variant="secondary" :disabled="saving" @click="emit('update:modelValue', false)">取消</UiButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<style scoped>
.focus-group-member-add-error { margin: 0 0 var(--spacing-3); color: var(--performance-field-error-color); font-size: var(--font-size-md); line-height: 22px; }
.focus-group-member-add-footer { display: flex; justify-content: flex-end; gap: var(--performance-dialog-footer-gap); }
.focus-group-member-add-footer .performance-button { min-width: var(--performance-button-min-width); }
</style>
