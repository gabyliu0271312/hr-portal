<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { performanceFocusGroupApi } from '@/api/performance'
import PerformanceConfirmDialog from './PerformanceConfirmDialog.vue'
import PerformancePersonSelect from './PerformancePersonSelect.vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import type { PerformanceSearchSelectOption } from './PerformanceSearchSelect.vue'
import UiButton from '@/components/ui/UiButton.vue'

const props = defineProps<{ cycleId: number | null }>()
const open = ref(false)
const groups = ref<Array<{ id: number; name: string }>>([])
const groupId = ref('')
const employeeNos = ref<string[]>([])
const people = ref<PerformanceSearchSelectOption[]>([])
const loading = ref(false)
const saving = ref(false)
const loaded = ref(false)
const error = ref('')
let listVersion = 0
let memberVersion = 0
const groupOptions = computed(() => groups.value.map(group => ({ value: String(group.id), label: group.name })))

watch(() => props.cycleId, async cycleId => {
  const request = ++listVersion
  memberVersion += 1
  open.value = false
  groups.value = []
  groupId.value = ''
  employeeNos.value = []
  people.value = []
  loaded.value = false
  loading.value = false
  if (!cycleId) return
  try {
    const [semester, project] = await Promise.all([performanceFocusGroupApi.manageable(cycleId, 'semester'), performanceFocusGroupApi.manageable(cycleId, 'project')])
    if (request !== listVersion) return
    groups.value = [...semester.items, ...project.items]
  } catch { if (request === listVersion) groups.value = [] }
}, { immediate: true })

watch(groupId, async value => {
  const request = ++memberVersion
  employeeNos.value = []
  people.value = []
  loaded.value = false
  error.value = ''
  if (!value || !props.cycleId) return
  loading.value = true
  try {
    const result = await performanceFocusGroupApi.members(props.cycleId, Number(value))
    if (request !== memberVersion) return
    employeeNos.value = result.employee_nos
    people.value = result.people.map(person => ({ value: person.value, label: person.label, subLabel: person.sub_label || undefined }))
    loaded.value = true
  } catch (e: any) { if (request === memberVersion) error.value = e?.response?.data?.detail || '成员加载失败，请重新选择人员组' }
  finally { if (request === memberVersion) loading.value = false }
})

function show() {
  groupId.value = ''
  loaded.value = false
  open.value = true
}
async function save() {
  if (!props.cycleId || !groupId.value || !loaded.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    await performanceFocusGroupApi.updateMembers(props.cycleId, Number(groupId.value), employeeNos.value)
    open.value = false
  } catch (e: any) { error.value = e?.response?.data?.detail || '成员保存失败，请稍后重试' }
  finally { saving.value = false }
}
</script>

<template>
  <UiButton v-if="groups.length" variant="text" @click="show">维护人员组成员</UiButton>
  <PerformanceConfirmDialog v-model="open" message="维护人员组成员" description="仅展示并维护你有权限管理的成员，其他成员保持不变。" confirm-text="保存" cancel-text="取消" confirm-variant="primary" :loading="saving" :confirm-disabled="!loaded || loading" :error-message="error" @confirm="save">
    <template #check>
      <PerformanceSearchSelect v-model="groupId" :options="groupOptions" aria-label="选择人员组" placeholder="选择人员组" :disabled="saving" />
      <p v-if="loading" role="status">正在加载成员…</p>
      <PerformancePersonSelect v-if="loaded" v-model="employeeNos" :options="people" :remote-search="false" multiple aria-label="可管理成员" placeholder="选择成员" :disabled="saving" />
    </template>
  </PerformanceConfirmDialog>
</template>
