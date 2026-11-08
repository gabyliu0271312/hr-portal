<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { performanceFocusGroupApi } from '@/api/performance'
import type { PerformanceSearchSelectOption } from '@/components/performance/PerformanceSearchSelect.vue'
import PerformanceDialogShell from '@/components/performance/PerformanceDialogShell.vue'
import PerformancePersonSelect from '@/components/performance/PerformancePersonSelect.vue'
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
const people = ref<PerformanceSearchSelectOption[]>([])
const selected = ref<string[]>([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const loaded = ref(false)
let version = 0

watch(() => props.modelValue, visible => {
  if (!visible) return
  selected.value = []
  people.value = []
  error.value = ''
  loaded.value = false
  if (!props.cycleId || props.groupId == null) return
  const request = ++version
  loading.value = true
  void performanceFocusGroupApi.members(props.cycleId, props.groupId, { size: 1000 })
    .then(result => {
      if (request !== version) return
      people.value = result.people.map(person => ({ value: person.value, label: person.label, subLabel: person.sub_label || undefined }))
      loaded.value = true
    })
    .catch(e => { if (request === version) error.value = e?.response?.data?.detail || '成员加载失败，请重新选择' })
    .finally(() => { if (request === version) loading.value = false })
})

async function save() {
  if (!props.cycleId || props.groupId == null || !selected.value.length || saving.value) return
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
  <PerformanceDialogShell v-model="open" title="添加人员" width="var(--performance-dialog-wide-width)" :loading="saving" @close="emit('update:modelValue', false)">
    <div class="front-fg-add">
      <p class="front-fg-add__label">选择人员<span class="front-fg-add__required">*</span></p>
      <p v-if="error" class="front-fg-add__error" role="alert">{{ error }}</p>
      <p v-if="loading" role="status">正在加载成员…</p>
      <PerformancePersonSelect
        v-if="loaded"
        v-model="selected"
        :options="people"
        multiple
        remote-search
        aria-label="选择人员"
        placeholder="请输入姓名"
        :disabled="saving"
      />
    </div>
    <template #footer>
      <div class="front-fg-add__footer">
        <UiButton variant="secondary" :disabled="saving" @click="emit('update:modelValue', false)">取消</UiButton>
        <UiButton variant="primary" :loading="saving" :disabled="saving || !selected.length" @click="save">确定</UiButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<style scoped>
.front-fg-add { display: flex; flex-direction: column; gap: 8px; }
.front-fg-add__label { margin: 0; color: var(--color-text-primary); font: 400 var(--font-size-md)/22px var(--font-sans); }
.front-fg-add__required { margin-left: 2px; color: var(--performance-field-error-color); }
.front-fg-add__error { margin: 0; color: var(--performance-field-error-color); font-size: var(--performance-field-error-font-size); line-height: var(--performance-field-error-line-height); }
.front-fg-add__footer { display: flex; justify-content: flex-end; gap: var(--performance-dialog-footer-gap); }
.front-fg-add__footer .performance-button { min-width: var(--performance-button-min-width); }
</style>
