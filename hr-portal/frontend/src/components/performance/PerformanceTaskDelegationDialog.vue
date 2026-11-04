<template>
  <PerformanceDialogShell v-model="open" :title="calibration ? '新建授权' : action === 'TRANSFER' ? '转交他人处理' : '授权他人处理'" :loading="saving">
    <p v-if="calibration && readOnly" class="readonly-notice" role="alert">校准任务已完成。授权后，被授权人仅有查看权限，无法修改被评估人的绩效结果。</p>
    <p v-if="!calibration" class="description">{{ action === 'TRANSFER' ? '转交后仅接收人可处理所选任务，原处理人不再具有处理资格。' : '授权后原处理人与被授权人均可处理同一任务。' }}已保存或提交的内容及审计记录保留。</p>
    <PerformanceFormItem :label="calibration ? '授权给' : '选择人员'" required><PerformanceSearchSelect v-model="recipient" :options="options" aria-label="选择授权接收人" :disabled="saving || loading" /></PerformanceFormItem>
    <PerformanceFormItem v-if="!calibration && reviewees.length" label="被评估人">
      <div class="reviewee-tags">
        <span v-for="reviewee in reviewees" :key="reviewee.employee_no" class="reviewee-tag">{{ reviewee.display_name }}</span>
      </div>
    </PerformanceFormItem>
    <PerformanceFormItem v-if="!calibration && stageGroups.length" label="授权环节">
      <p class="scope-count">共 {{ selectedStageCount }} 个环节任务</p>
      <div class="stage-notice">请确保授权对象有所选环节的操作资格，避免错误授权泄露敏感数据。</div>
      <div class="stage-groups">
        <div class="stage-groups__roles">
          <p class="stage-group__role-title">按执行角色选择</p>
          <button v-for="group in stageGroups" :key="group.role_key" type="button" class="stage-role" :class="{ 'is-active': activeRole === group.role_key }" @click="activeRole = group.role_key">{{ group.role_label }}</button>
        </div>
        <div class="stage-groups__options">
          <p class="stage-group__title">{{ (stageGroups.find(group => group.role_key === activeRole) || stageGroups[0])?.role_label }} 执行的任务</p>
          <div v-for="option in (stageGroups.find(group => group.role_key === activeRole) || stageGroups[0])?.options || []" :key="option.task_id" class="stage-option">
            <PerformanceCheckbox
              :model-value="selectedStages.includes(String(option.task_id))"
              :label="option.stage_label"
              :disabled="saving || !option.can_authorize"
              @update:model-value="toggleStage(String(option.task_id), $event)"
            />
          </div>
        </div>
      </div>
    </PerformanceFormItem>
    <PerformanceFormItem v-if="!calibration" label="原因" required><textarea v-model="reason" aria-label="授权转交原因" maxlength="1000" rows="3" :disabled="saving" /></PerformanceFormItem>
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
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <template #footer><div class="actions"><UiButton :disabled="saving" @click="open = false">取消</UiButton><UiButton variant="primary" :disabled="!recipient || (!calibration && !reason.trim()) || (!calibration && stageGroups.length && !selectedStages.length) || !filteredTasks.length || saving || loading || Boolean(error)" @click="confirm">确定</UiButton></div></template>
  </PerformanceDialogShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { projectManagementApi, type PerformanceTaskDelegationTarget } from '@/api/performance'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import UiButton from '../ui/UiButton.vue'
import PerformanceRadioGroup from './PerformanceRadioGroup.vue'
import UiSwitch from '../ui/UiSwitch.vue'
import PerformanceCheckbox from './PerformanceCheckbox.vue'

const props = defineProps<{ modelValue: boolean; action: 'AUTHORIZE' | 'TRANSFER'; tasks: Array<PerformanceTaskDelegationTarget & {
  direct_supervisor_employee_no?: string; department_path?: string
}>; calibration?: boolean; readOnly?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; completed: [count: number, notificationStatus?: string] }>()
const open = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const recipient = ref<string | string[] | null>(null)
const reason = ref('')
const options = ref<Array<{ value: string; label: string }>>([])
const people = ref<Array<{ employee_no: string; display_name: string; department_path?: string; direct_supervisor_employee_no?: string }>>([])
const scopeMode = ref('PARTIAL')
const scopeKind = ref('DIRECT_SUBORDINATES')
const distribution = ref('INHERIT')
const departments = ref<string | string[] | null>([])
const employees = ref<string | string[] | null>([])
const allowReauthorize = ref(false)
const notifyOriginal = ref(true)
const selectedStages = ref<string[]>([])
const activeRole = ref('')
const departmentOptions = computed(() => [...new Set(props.tasks.map(person => person.department_path).filter((value): value is string => Boolean(value)))].map(value => ({value,label:value})))
const personOptions = computed(() => props.tasks.filter(task => task.employee_no).map(task => ({value:task.employee_no!,label:task.display_name || task.employee_no!})))
const reviewees = computed(() => props.tasks.filter(task => task.employee_no))
const stageOptions = computed(() => props.tasks.flatMap(task => (task.task_map || []).map(option => ({ ...option, project_id: task.project_id, display_name: task.display_name, employee_no: task.employee_no }))))
const stageGroups = computed(() => {
  const groups: Array<{ role_key: string; role_label: string; options: typeof stageOptions.value }> = []
  for (const option of stageOptions.value) {
    if (!option.role_key) continue
    let group = groups.find(item => item.role_key === option.role_key)
    if (!group) { group = { role_key: option.role_key, role_label: option.role_label || '', options: [] }; groups.push(group) }
    group.options.push(option)
  }
  return groups
})
const selectedStageCount = computed(() => selectedStages.value.length)
function toggleStage(taskId: string, checked: boolean) {
  if (!checked) { selectedStages.value = selectedStages.value.filter(id => id !== taskId); return }
  selectedStages.value = [...new Set([...selectedStages.value, taskId])]
}
const filteredTasks = computed(() => {
  if (props.calibration) {
    if (scopeMode.value === 'ALL') return props.tasks
    if (typeof recipient.value !== 'string') return []
    const selected = new Set(Array.isArray(employees.value) ? employees.value : [])
    const paths = Array.isArray(departments.value) ? departments.value : []
    return props.tasks.filter(task => {
      const person = task.department_path || task.direct_supervisor_employee_no ? task : people.value.find(person => person.employee_no === task.employee_no)
      return scopeKind.value === 'PEOPLE' ? Boolean(task.employee_no && selected.has(task.employee_no)) : scopeKind.value === 'DEPARTMENT' ? Boolean(person?.department_path && paths.some(path => person.department_path === path || person.department_path!.startsWith(path + '/'))) : person?.direct_supervisor_employee_no === recipient.value
    })
  }
  if (!stageGroups.value.length) return props.tasks.filter(task => task.task_id)
  return stageOptions.value.filter(option => selectedStages.value.includes(String(option.task_id)) && option.can_authorize)
})
const error = ref('')
const saving = ref(false)
const loading = ref(false)
let version = 0
watch(() => props.modelValue, async value => {
  const current = ++version
  if (!value) return
  recipient.value = null; reason.value = ''; error.value = ''; options.value = []; scopeMode.value = 'PARTIAL'; scopeKind.value = 'DIRECT_SUBORDINATES'; departments.value = []; employees.value = []; distribution.value = 'INHERIT'; allowReauthorize.value = false; notifyOriginal.value = true; selectedStages.value = []; activeRole.value = stageGroups.value[0]?.role_key || ''
  if (!props.tasks.length) { error.value = '没有可授权的任务'; return }
  loading.value = true
  try {
    const candidateTasks = props.calibration
      ? props.tasks
      : stageGroups.value.length
        ? stageOptions.value
        : props.tasks
    let candidates: Array<{ employee_no: string; display_name: string; department_path?: string; direct_supervisor_employee_no?: string }> | null = null
    for (const task of candidateTasks) {
      const available = await projectManagementApi.delegationCandidates(task.project_id, task.task_id)
      if (current !== version) return
      const allowed = new Set(available.map(person => person.employee_no))
      candidates = candidates ? candidates.filter(person => allowed.has(person.employee_no)) : available
      if (!candidates.length) break
    }
    people.value = candidates || []
    options.value = (candidates || []).map(person => ({ value: person.employee_no, label: person.display_name }))
  } catch { if (current === version) error.value = '加载可授权人员失败，请重新打开后重试' } finally { if (current === version) loading.value = false }
})
async function confirm() {
  if (typeof recipient.value !== 'string' || (!props.calibration && !reason.value.trim()) || (!props.calibration && stageGroups.value.length && !selectedStages.value.length) || saving.value || error.value) return
  saving.value = true; error.value = ''
  const remaining = [...filteredTasks.value]
  let completed = 0
  let notificationStatus = ''
  try {
    if (!remaining.length) { error.value = '没有可处理的任务，请关闭后重试'; return }
    for (const task of remaining) {
      const result = props.calibration
        ? await projectManagementApi.authorizeTask(task.project_id, task.task_id, props.action, recipient.value, reason.value, { scope_mode: scopeMode.value as 'PARTIAL' | 'ALL', scope_kind: scopeKind.value, selected_employee_nos: Array.isArray(employees.value) ? employees.value : [], department_paths: Array.isArray(departments.value) ? departments.value : [], distribution_mode: distribution.value, allow_reauthorize: allowReauthorize.value, notify_original: notifyOriginal.value })
        : await projectManagementApi.authorizeTask(task.project_id, task.task_id, props.action, recipient.value, reason.value)
      notificationStatus = result.notification_status || ''
      completed++
    }
    emit('completed', completed, notificationStatus); open.value = false
  } catch { error.value = `已处理 ${completed} 项，其余结果未确认。请关闭并刷新名单后核对，勿重复提交。`; if (completed) emit('completed', completed, notificationStatus) } finally { saving.value = false }
}
</script>

<style scoped>
.description { margin:0 0 20px; color:#646a73; font-size:14px; line-height:22px; }
textarea { display:block; width:100%; border:1px solid #d0d3d6; border-radius:6px; padding:8px; box-sizing:border-box; font:inherit; }
.error { color:#f54a45; }
.actions { display:flex; justify-content:flex-end; gap:12px; }
.reviewee-tags { display:flex; flex-wrap:wrap; gap:8px; }
.reviewee-tag { display:inline-flex; align-items:center; height:26px; padding:0 12px; border-radius:9999px; background:#f2f3f5; color:#1f2329; font-size:14px; line-height:26px; }
.stage-notice { margin:4px 0 12px; padding:10px 14px; border-radius:6px; background:#fff7e8; color:#8f5b10; font-size:12px; line-height:20px; }
.stage-groups { display:flex; border:1px solid #e5e6e8; border-radius:8px; overflow:hidden; }
.stage-groups__roles { flex:0 0 128px; padding:10px 0; background:#fafbfc; border-right:1px solid #e5e6e8; }
.stage-group__role-title { margin:0; padding:0 12px 8px; color:#646a73; font-size:12px; line-height:20px; }
.stage-role { display:block; width:100%; height:36px; padding:0 12px; border:0; background:transparent; color:#1f2329; font-size:14px; line-height:36px; text-align:left; cursor:pointer; }
.stage-role.is-active { background:#e1eaff; color:#0c296e; font-weight:500; }
.stage-groups__options { flex:1; min-width:0; padding:12px 16px; }
.stage-group__title { margin:0 0 8px; color:#646a73; font-size:12px; line-height:20px; }
.stage-option { margin:0 0 6px; }
.stage-groups__options .stage-option:last-child { margin-bottom:0; }
</style>

<style scoped>
.readonly-notice { margin:0 0 20px; padding:12px 16px; border-radius:6px; background:#fff7e8; color:#8f5b10; font-size:14px; line-height:22px; }
.scope-count { margin:0 0 16px; color:#646a73; font-size:14px; }
.scope-detail { margin:12px 0 12px 24px; display:flex; flex-direction:column; gap:12px; }
.switch-setting { display:flex; justify-content:space-between; align-items:center; gap:16px; min-height:32px; margin:12px 0; }
.helper { color:#646a73; font-size:12px; line-height:20px; margin-bottom:16px; }
</style>
