<template>
  <PerformanceDialogShell v-model="open" :title="calibration ? '新建授权' : `${verb}他人处理`" :loading="locked" dialog-class="delegation-dialog">
    <template v-if="!calibration" #description>{{ action === 'TRANSFER' ? '转交后，原评估人将失去任务权限' : '授权后，原评估人在截止时间之前仍有该任务的操作权限。' }}</template>
    <p v-if="calibration && readOnly" class="readonly-notice" role="alert">校准任务已完成。授权后，被授权人仅有查看权限，无法修改被评估人的绩效结果。</p>
    <PerformanceFormItem v-if="!calibration && reviewees.length" label="被评估人">
      <div class="reviewee-tags"><PerformanceMemberIdentity v-for="reviewee in reviewees" :key="`${reviewee.project_id}:${reviewee.employee_no}`" :display-name="reviewee.display_name || reviewee.employee_no || ''" size="sm" tag /></div>
    </PerformanceFormItem>
    <PerformanceFormItem :label="calibration ? '授权给' : `${verb}给`" required>
      <PerformanceSearchSelect v-model="recipient" :options="options" placeholder="搜索成员" aria-label="选择授权接收人" :disabled="locked || loading" :loading="loading" />
    </PerformanceFormItem>
    <PerformanceFormItem v-if="!calibration && mapped" :label="`${verb}环节`" class="stage-field">
      <PerformancePromptNotice v-if="hasNoOriginReviewer" class="stage-notice" type="warning">存在无原处理人的任务：授权前需选择是否授权；无原处理人的任务不可转交。</PerformancePromptNotice>
      <PerformancePromptNotice v-else class="stage-notice" type="warning">请确保{{ verb }}对象有所选环节的操作资格，避免错误授权泄露敏感数据。</PerformancePromptNotice>
      <PerformanceDelegationStages :model-value="activeRole" :roles="roles" :stages="visibleStages" :selected="selectedStages" :selected-tasks="selectedTasks" :disabled="locked" @update:model-value="selectRole" @toggle="toggleStage" @toggle-task="toggleTask" />
    </PerformanceFormItem>
    <div v-if="!calibration" class="notification-setting"><span>通知原评估人任务将{{ verb }}他人处理</span><UiSwitch v-model="notifyOriginal" :disabled="locked" :aria-label="`通知原评估人任务将${verb}他人处理`" /></div>
    <template v-if="calibration">
      <PerformanceFormItem label="授权范围">
        <p class="scope-count">总人数：{{ filteredTasks.length }} 人</p>
        <PerformanceRadioGroup v-model="scopeMode" :options="[{ value:'PARTIAL', label:'任务内的部分人员' },{ value:'ALL', label:'任务内的全部人员' }]" direction="vertical" :gap="16" name="authorization-scope" aria-label="授权范围">
          <template #after-option="{ option }"><div v-if="option.value === 'PARTIAL' && scopeMode === 'PARTIAL'" class="scope-detail">
            <PerformanceRadioGroup v-model="scopeKind" :options="[{ value:'DIRECT_SUBORDINATES', label:'被授权人的全部实线下级' },{ value:'DEPARTMENT', label:'指定部门' },{ value:'PEOPLE', label:'指定人员' }]" direction="vertical" :gap="12" name="authorization-scope-kind" aria-label="部分人员范围" />
            <PerformanceSearchSelect v-if="scopeKind === 'DEPARTMENT'" v-model="departments" :options="departmentOptions" multiple aria-label="指定部门" />
            <PerformanceSearchSelect v-if="scopeKind === 'PEOPLE'" v-model="employees" :options="personOptions" multiple aria-label="指定人员" />
          </div></template>
        </PerformanceRadioGroup>
      </PerformanceFormItem>
      <PerformanceFormItem label="强制 / 建议分布规则" required><PerformanceRadioGroup v-model="distribution" :options="[{value:'INHERIT',label:'沿用此任务的分布规则'},{value:'NONE',label:'无需满足分布规则',disabled:true,info:'后端拒绝此策略，本轮不可选择'}]" name="authorization-distribution" /></PerformanceFormItem>
      <div class="switch-setting"><span>允许继续授权他人校准</span><UiSwitch v-model="allowReauthorize" aria-label="允许继续授权他人校准" /></div>
      <p class="helper">开启后，被授权人和项目管理角色可以继续授权他人对校准范围内的人员进行校准</p>
      <div class="switch-setting"><span>通知原校准人任务将授权他人处理</span><UiSwitch v-model="notifyOriginal" aria-label="通知原校准人任务将授权他人处理" /></div>
    </template>
    <p v-if="requestMessage" class="error" role="status">{{ requestMessage }}</p>
    <UiButton v-if="pending.length" :disabled="locked" @click="retry">重试未确认项</UiButton>
    <ul v-if="pending.length" class="retry-details"><li v-for="entry in pending" :key="`${entry.request.project_id}:${entry.request.task_id}:${entry.request.action}`">{{ entry.request.action === 'TRANSFER' ? '转交' : '授权' }} · {{ entry.request.taskLabel || `${entry.request.project_id}:${entry.request.task_id}` }} → {{ entry.request.recipientLabel || entry.request.recipient }}</li></ul>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <template #footer><div class="actions"><UiButton :disabled="locked" @click="open = false">取消</UiButton><UiButton variant="primary" :disabled="!canSubmit || locked" @click="openConfirmation">确定</UiButton></div></template>
  </PerformanceDialogShell>
  <PerformanceConfirmDialog v-model="confirmationOpen" appearance="delegation" confirm-variant="primary" :message="`确定${verb}吗?`" :description="`请确保${verb}对象有所选环节的操作资格，避免泄露敏感数据。`" cancel-text="取消" confirm-text="确定" :loading="saving" :confirm-disabled="!canSubmit || (noOriginTasks.length > 0 && !noOriginChoice)" @confirm="submit">
    <template v-if="noOriginTasks.length" #check><PerformanceDelegationNoOriginChoice v-model="noOriginChoice" :tasks="noOriginTasks" :recipient="options.find(option => option.value === recipient)?.label || String(recipient)" :disabled="saving" /></template>
  </PerformanceConfirmDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { projectManagementApi, type PerformanceTaskDelegationTarget } from '@/api/performance'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceConfirmDialog from './PerformanceConfirmDialog.vue'
import PerformanceDelegationStages from './PerformanceDelegationStages.vue'
import PerformanceDelegationNoOriginChoice from './PerformanceDelegationNoOriginChoice.vue'
import { useTaskDelegationRequests, type DelegationRequest } from './useTaskDelegationRequests'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import PerformanceMemberIdentity from './PerformanceMemberIdentity.vue'
import PerformancePromptNotice from './PerformancePromptNotice.vue'
import UiButton from '../ui/UiButton.vue'
import PerformanceRadioGroup from './PerformanceRadioGroup.vue'
import UiSwitch from '../ui/UiSwitch.vue'

const props = defineProps<{ modelValue: boolean; action: 'AUTHORIZE' | 'TRANSFER'; tasks: Array<PerformanceTaskDelegationTarget & { direct_supervisor_employee_no?: string; department_path?: string }>; calibration?: boolean; readOnly?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; completed: [count: number, notificationStatus?: string, recordId?: number, skippedCount?: number]; refresh: [] }>()
const open = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const verb = computed(() => props.action === 'TRANSFER' ? '转交' : '授权')
const recipient = ref<string | string[] | null>(null)
type Person = { employee_no: string; display_name: string; department_path?: string; direct_supervisor_employee_no?: string }
const people = ref<Person[]>([])
const options = computed(() => people.value.map(person => ({ value: person.employee_no, label: person.display_name, subLabel: person.department_path })))
const scopeMode = ref('PARTIAL'), scopeKind = ref('DIRECT_SUBORDINATES'), distribution = ref('INHERIT')
const departments = ref<string | string[] | null>([]), employees = ref<string | string[] | null>([])
const allowReauthorize = ref(false), notifyOriginal = ref(true), confirmationOpen = ref(false)
const selectedStages = ref<string[]>([]), selectedTasks = ref<string[]>([]), activeRole = ref(''), noOriginChoice = ref('')
const error = ref(''), loading = ref(false)
const { saving, message: requestMessage, pending, isUncertain, submit: sendRequests, retry } = useTaskDelegationRequests((count, notification, id, skipped) => { confirmationOpen.value = false; emit('completed', count, notification, id, skipped); open.value = false }, () => { confirmationOpen.value = false; emit('refresh') })
const locked = computed(() => saving.value || confirmationOpen.value)
const roles = computed(() => [...new Map(stageOptions.value.filter(option => option.role_key).map(option => [option.role_key!, { key: option.role_key!, label: option.role_label || option.role_key! }])).values()])
const departmentOptions = computed(() => [...new Set(props.tasks.map(person => person.department_path).filter((value): value is string => Boolean(value)))].map(value => ({ value, label: value })))
const personOptions = computed(() => props.tasks.filter(task => task.employee_no).map(task => ({ value: task.employee_no!, label: task.display_name || task.employee_no! })))
const reviewees = computed(() => [...new Map(props.tasks.filter(task => task.employee_no).map(task => [`${task.project_id}:${task.employee_no}`, task])).values()])
const mapped = computed(() => props.tasks.some(task => task.task_map !== undefined))
const hasNoOriginReviewer = computed(() => stageOptions.value.some(option => !option.handler_ref))
const stageOptions = computed(() => [...new Map(props.tasks.flatMap(task => (task.task_map || []).map(option => ({ ...option, project_id: task.project_id, employee_no: task.employee_no, display_name: task.display_name }))).map(option => [`${option.project_id}:${option.task_id}:${option.role_key}`, option])).values()])
function stageKey(option: typeof stageOptions.value[number]) { return `${option.role_key}:${option.stage_id || option.stage_key}` }
function taskKey(task: { project_id: number; task_id: number }) { return `${task.project_id}:${task.task_id}` }
function requestTaskLabel(task: PerformanceTaskDelegationTarget & { stage_label?: string; role_label?: string | null; role_key?: string | null }) { return `${task.display_name || task.employee_no || `项目${task.project_id}`} · ${task.stage_label || '原任务'} · ${task.role_label || task.role_key || ''}（${taskKey(task)}）` }
function actionable(option: typeof stageOptions.value[number]) { return Boolean(option.can_authorize && option.task_id && (props.action !== 'TRANSFER' || option.handler_ref)) }
const visibleStages = computed(() => {
  const keys = [...new Set(stageOptions.value.filter(option => option.role_key === activeRole.value).map(stageKey))]
  return keys.map(key => {
    const tasks = stageOptions.value.filter(option => stageKey(option) === key)
    const handlers = reviewees.value.length <= 1 && tasks.length > 1 ? tasks.map(task => ({ key: taskKey(task), label: task.handler_name || task.handler_ref || '无原处理人', disabled: !actionable(task) })) : []
    return { key, label: tasks[0].stage_label, disabled: !tasks.some(actionable), handlers }
  })
})
function selectRole(roleKey: string) {
  if (locked.value || activeRole.value === roleKey) return
  activeRole.value = roleKey; selectedStages.value = []; selectedTasks.value = []
}
function toggleStage(key: string, checked: boolean) {
  if (locked.value) return
  selectedStages.value = checked ? [...new Set([...selectedStages.value, key])] : selectedStages.value.filter(value => value !== key)
}
function toggleTask(key: string, checked: boolean) {
  if (!locked.value) selectedTasks.value = checked ? [...new Set([...selectedTasks.value, key])] : selectedTasks.value.filter(value => value !== key)
}
const filteredTasks = computed(() => {
  if (props.calibration) {
    if (scopeMode.value === 'ALL') return props.tasks
    if (typeof recipient.value !== 'string') return []
    const selected = new Set(Array.isArray(employees.value) ? employees.value : []), paths = Array.isArray(departments.value) ? departments.value : []
    return props.tasks.filter(task => {
      const person = task.department_path || task.direct_supervisor_employee_no ? task : people.value.find(person => person.employee_no === task.employee_no)
      return scopeKind.value === 'PEOPLE' ? Boolean(task.employee_no && selected.has(task.employee_no)) : scopeKind.value === 'DEPARTMENT' ? Boolean(person?.department_path && paths.some(path => person.department_path === path || person.department_path!.startsWith(path + '/'))) : person?.direct_supervisor_employee_no === recipient.value
    })
  }
  const tasks = mapped.value ? stageOptions.value.filter(option => option.role_key === activeRole.value && selectedStages.value.includes(stageKey(option)) && actionable(option) && (!visibleStages.value.find(stage => stage.key === stageKey(option))?.handlers.length || selectedTasks.value.includes(taskKey(option)))) : props.tasks.filter(task => task.task_id)
  return [...new Map(tasks.map(task => [taskKey(task), task])).values()]
})
const noOriginTasks = computed(() => props.action === 'AUTHORIZE' && !props.calibration ? [...new Map(stageOptions.value.filter(task => task.role_key === activeRole.value && !task.handler_ref && filteredTasks.value.some(selected => taskKey(selected) === taskKey(task))).map(task => [taskKey(task), task])).values()] : [])
const candidateTasks = computed(() => props.calibration ? props.tasks : filteredTasks.value.length ? filteredTasks.value : mapped.value ? stageOptions.value.filter(option => option.role_key === activeRole.value && actionable(option)) : props.tasks)
const requests = computed<DelegationRequest[]>(() => filteredTasks.value.map(task => ({ project_id: task.project_id, task_id: task.task_id, action: props.action, recipient: String(recipient.value), options: { ...(props.calibration ? { scope_mode: scopeMode.value as 'PARTIAL' | 'ALL', scope_kind: scopeKind.value, selected_employee_nos: Array.isArray(employees.value) ? employees.value : [], department_paths: Array.isArray(departments.value) ? departments.value : [], distribution_mode: distribution.value, allow_reauthorize: allowReauthorize.value } : {}), notify_original: notifyOriginal.value, ...(noOriginTasks.value.some(item => taskKey(item) === taskKey(task)) && noOriginChoice.value ? { no_origin_reviewer_authorize: noOriginChoice.value === 'AUTHORIZE' } : {}) }, taskLabel: requestTaskLabel(task), recipientLabel: `${options.value.find(option => option.value === recipient.value)?.label || String(recipient.value)}（${String(recipient.value)}）` })))
const canSubmit = computed(() => typeof recipient.value === 'string' && options.value.some(option => option.value === recipient.value) && filteredTasks.value.length > 0 && !visibleStages.value.some(stage => selectedStages.value.includes(stage.key) && stage.handlers.length && !stage.handlers.some(handler => selectedTasks.value.includes(handler.key) && !handler.disabled)) && !loading.value && !error.value && !isUncertain(requests.value))
let version = 0
watch(() => [props.modelValue, props.action, props.tasks, props.calibration], () => {
  ++version; confirmationOpen.value = false
  if (pending.value.length) return
  recipient.value = null; people.value = []; error.value = ''; noOriginChoice.value = ''; requestMessage.value = ''
  scopeMode.value = 'PARTIAL'; scopeKind.value = 'DIRECT_SUBORDINATES'; departments.value = []; employees.value = []; distribution.value = 'INHERIT'; allowReauthorize.value = false; notifyOriginal.value = true; selectedStages.value = []; selectedTasks.value = []
  activeRole.value = stageOptions.value.find(option => actionable(option) && option.role_key)?.role_key || roles.value[0]?.key || ''
}, { immediate: true, deep: true })
watch(() => JSON.stringify([props.modelValue, props.action, props.tasks, candidateTasks.value.map(task => [task.project_id, task.task_id])]), async () => {
  const current = ++version
  loading.value = false
  if (pending.value.length && isUncertain(requests.value)) return
  people.value = []; error.value = ''
  if (!props.modelValue) return
  const tasks = [...new Map(candidateTasks.value.map(task => [`${task.project_id}:${task.task_id}`, task])).values()]
  if (!tasks.length) { recipient.value = null; return }
  loading.value = true
  try {
    let lists: Array<Array<Person>>
    if (tasks.length > 1 && tasks.every(task => task.project_id === tasks[0].project_id)) {
      const groups = await projectManagementApi.delegationCandidatesBatch(tasks[0].project_id, tasks.map(task => task.task_id))
      lists = tasks.map(task => groups.find(group => group.task_id === task.task_id)?.candidates ?? [])
    } else {
      lists = await Promise.all(tasks.map(task => projectManagementApi.delegationCandidates(task.project_id, task.task_id)))
    }
    if (current !== version) return
    people.value = lists[0].filter(person => lists.every(list => list.some(item => item.employee_no === person.employee_no)))
    if (!people.value.some(person => person.employee_no === recipient.value)) recipient.value = null
  } catch { if (current === version) { recipient.value = null; error.value = '加载可授权人员失败，请重新打开后重试' } }
  finally { if (current === version) loading.value = false }
}, { immediate: true })
function openConfirmation() {
  if (!canSubmit.value || locked.value) return
  if (props.calibration) void submit()
  else confirmationOpen.value = true
}
async function submit() {
  if (!canSubmit.value || saving.value || (!props.calibration && !confirmationOpen.value) || (noOriginTasks.value.length && !noOriginChoice.value)) return
  await sendRequests(requests.value)
}
</script>

<style scoped>
.reviewee-tags { display:flex; flex-wrap:wrap; gap:4px; }
.reviewee-tags :deep(.member-identity) { min-height:24px; }
.stage-notice { margin-bottom:12px; }
.stage-notice :deep(.prompt-notice__text) { margin-bottom:0; padding-right:12px; white-space:normal; }
.stage-field { margin-bottom:0; }
.notification-setting { display:flex; align-items:center; gap:4px; margin-top:20px; font-weight:500; line-height:22px; }
.retry-details { margin:12px 0; padding-left:20px; color:var(--color-text-secondary); font-size:var(--font-size-md); overflow-wrap:anywhere; }
.error { color:var(--color-text-danger-strong); font-size:var(--font-size-md); }
.actions { display:flex; justify-content:flex-end; gap:var(--performance-dialog-footer-button-gap); }
.scope-count { margin:0 0 16px; color:var(--color-text-secondary); font-size:var(--font-size-md); }
.scope-detail { margin:12px 0 12px 24px; display:flex; flex-direction:column; gap:12px; }
.switch-setting { display:flex; justify-content:space-between; align-items:center; gap:16px; min-height:32px; margin:12px 0; }
.helper { color:var(--color-text-secondary); font-size:var(--font-size-xs); line-height:20px; margin-bottom:16px; }
.readonly-notice { margin:0 0 20px; padding:12px 16px; border-radius:var(--performance-control-radius); background:#fff3e5; color:var(--color-text-secondary); font-size:var(--font-size-md); line-height:22px; }
</style>
