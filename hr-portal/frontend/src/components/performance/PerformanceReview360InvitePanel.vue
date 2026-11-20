<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  performanceReview360InviteApi,
  type PerformanceReview360InviteCandidate,
  type PerformanceReview360InviteList,
} from '@/api/performance'
import UiButton from '../ui/UiButton.vue'
import PerformanceReviewer360InviteBody from './PerformanceReviewer360InviteBody.vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import PerformanceDisabledReason from './PerformanceDisabledReason.vue'

const props = withDefaults(defineProps<{
  projectId?: number | string
  nodeId?: string
  data?: PerformanceReview360InviteList
  readonly?: boolean
  disabled?: boolean
}>(), { readonly: false, disabled: false })
const emit = defineEmits<{
  change: [data: PerformanceReview360InviteList]
  busy: [value: boolean]
}>()
const roster = ref<PerformanceReview360InviteList>()
const loading = ref(false)
const error = ref('')
const conflict = ref(false)
const candidates = ref<PerformanceReview360InviteCandidate[]>([])
const candidateLoading = ref(false)
const candidateError = ref('')
const candidateKeyword = ref('')
const inviting = ref(false)
const searchKey = ref(0)
let contextVersion = 0
let listRequest = 0
let candidateRequest = 0
let disposed = false
const projectId = computed(() => props.projectId ?? roster.value?.project_id)
const contextMatches = computed(() => Boolean(roster.value
  && (!props.projectId || String(props.projectId) === String(roster.value.project_id))
  && (!props.data?.task_id || String(props.data.task_id) === String(roster.value.task_id))
  && (!props.data?.employee_no || props.data.employee_no === roster.value.employee_no)))
const canInvite = computed(() => Boolean(props.data && contextMatches.value && !props.readonly && !props.disabled
  && !loading.value && !conflict.value && roster.value?.task_id && typeof roster.value.version === 'string' && roster.value.version
  && roster.value.editable === true && roster.value.can_invite === true && projectId.value))
const inviteDisabledReason = computed(() => conflict.value ? '名单已变化，请重新读取名单后再操作'
  : props.disabled ? '当前暂不可操作'
    : !canInvite.value ? '当前任务不允许邀请评估人，请重新打开任务确认权限' : inviting.value ? '正在邀请，请稍候' : '')
const items = computed(() => roster.value?.items ?? [])
const counted = computed(() => roster.value?.count ?? 0)
const candidateOptions = computed(() => candidates.value.map(candidate => ({
  value: candidate.employee_no, label: candidate.display_name,
  searchText: `${candidateKeyword.value} ${candidate.display_name} ${candidate.employee_no} ${candidate.department || ''}`,
  subLabel: candidate.department || undefined,
  avatarFallback: candidate.display_name.slice(-1),
  disabled: candidateLoading.value || inviting.value || items.value.some(item => item.employee_no === candidate.employee_no),
  disabledText: items.value.some(item => item.employee_no === candidate.employee_no) ? '已邀请' : undefined,
})))
const minimumHint = computed(() => {
  const minimum = roster.value?.minimum_invited_count ?? 0
  const remaining = Math.max(0, minimum - counted.value)
  const prefix = roster.value?.exclude_default_invite_from_limit ? '除系统默认邀请外，' : ''
  return `${prefix}${remaining ? `仍需邀请至少 ${remaining} 人` : `已满足最少邀请人数（${minimum} 人）`}`
})
const limitHint = computed(() => {
  const data = roster.value
  if (!data) return ''
  const hints: string[] = []
  if (data.maximum_invited_count != null) hints.push(`${data.maximum_invite_mode === 'LIMIT' ? '最多可邀请' : '建议最多邀请'} ${data.maximum_invited_count} 人`)
  if (data.second_prompt_enabled && data.second_prompt_count && counted.value >= data.second_prompt_count) {
    hints.push(`已达到二次触发提示人数（${data.second_prompt_count} 人）${data.second_prompt_mode === 'LIMIT' ? '，达到二次邀请上限' : ''}`)
  }
  return hints.join('；')
})
function isCurrent(version: number) { return !disposed && version === contextVersion }
function matchesSnapshot(next: PerformanceReview360InviteList, current: PerformanceReview360InviteList) {
  return String(next.project_id) === String(current.project_id)
    && String(next.task_id) === String(current.task_id)
    && next.employee_no === current.employee_no && next.node_id === current.node_id
    && typeof next.version === 'string' && Boolean(next.version)
}
async function load() {
  if (props.readonly || !projectId.value || loading.value || inviting.value) return
  const version = contextVersion
  const request = ++listRequest
  const currentProject = projectId.value
  const sourceTaskId = roster.value?.task_id
  const current = roster.value
  loading.value = true
  error.value = ''
  try {
    const result = await performanceReview360InviteApi.list(currentProject, undefined, sourceTaskId)
    if (!isCurrent(version) || request !== listRequest) return
    if (props.data && current && !matchesSnapshot(result, current)) {
      error.value = '名单上下文不一致，请重新打开当前任务'
      conflict.value = true
      return
    }
    roster.value = result
    conflict.value = false
    if (props.data) emit('change', result)
  } catch {
    if (isCurrent(version) && request === listRequest) error.value = '360° 评估邀请加载失败，请重试'
  } finally {
    if (isCurrent(version) && request === listRequest) loading.value = false
  }
}
async function loadCandidates(keyword: string) {
  if (!canInvite.value || inviting.value || !keyword.trim()) return
  const version = contextVersion
  const request = ++candidateRequest
  candidateKeyword.value = keyword.trim()
  candidates.value = []
  candidateLoading.value = true
  candidateError.value = ''
  try {
    const result = await performanceReview360InviteApi.candidates(projectId.value!, keyword.trim(), roster.value!.task_id)
    if (!isCurrent(version) || request !== candidateRequest || !canInvite.value) return
    candidates.value = result.items
  } catch {
    if (isCurrent(version) && request === candidateRequest) candidateError.value = '成员加载失败，请重试'
  } finally {
    if (isCurrent(version) && request === candidateRequest) candidateLoading.value = false
  }
}
function closeSearch() {
  candidateRequest++
  candidateLoading.value = false
  candidates.value = []
  candidateError.value = ''
  candidateKeyword.value = ''
}
async function inviteCandidate(employeeNo: string | string[] | null) {
  if (typeof employeeNo !== 'string' || !canInvite.value || inviting.value || candidateLoading.value || candidateError.value
    || !candidates.value.some(candidate => candidate.employee_no === employeeNo)
    || items.value.some(item => item.employee_no === employeeNo)) return
  const version = contextVersion
  const data = roster.value!
  const candidateName = candidates.value.find(candidate => candidate.employee_no === employeeNo)!.display_name
  inviting.value = true
  error.value = ''
  emit('busy', true)
  try {
    const result = await performanceReview360InviteApi.submit(projectId.value!, [employeeNo], data.task_id, data.version!)
    if (!isCurrent(version) || !canInvite.value) return
    if (!result.reviewer_360 || !matchesSnapshot(result.reviewer_360, data)) {
      conflict.value = true
      error.value = '名单已更新，请重新读取名单后继续操作'
      return
    }
    roster.value = result.reviewer_360
    emit('change', result.reviewer_360)
    if (result.rejected?.length) ElMessage.warning(`部分人员不可邀请：${candidateName}`)
  } catch (err: unknown) {
    if (!isCurrent(version)) return
    const response = (err as { response?: { status?: number; data?: { detail?: string } } }).response
    conflict.value = response?.status === 409
    error.value = conflict.value ? '名单已变化，请重新读取名单后再操作；本次邀请未自动重试'
      : response?.data?.detail === 'INVITE_LIMIT_REACHED' ? '已达邀请人数上限，无法继续邀请' : '邀请失败，请稍后重试'
    ElMessage.error(error.value)
  } finally {
    inviting.value = false
    if (!disposed) emit('busy', false)
  }
}
watch(() => [props.projectId, props.nodeId, props.data, props.readonly, props.disabled] as const, () => {
  contextVersion++
  searchKey.value++
  listRequest++
  closeSearch()
  loading.value = false
  roster.value = props.data
  error.value = ''
  conflict.value = false
  if (!props.data && !props.readonly) void load()
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => {
  disposed = true
  contextVersion++
  if (inviting.value) emit('busy', false)
})
</script>

<template>
  <section class="invite-panel" aria-label="360° 评估邀请" :aria-busy="inviting || loading">
    <PerformanceReviewer360InviteBody :items="items" :total="roster?.total ?? 0" :minimum-hint="minimumHint" :limit-hint="limitHint" interactive>
      <template v-if="!readonly" #search>
        <PerformanceDisabledReason class="invite-panel__search" :disabled="!canInvite || inviting" :reason="inviteDisabledReason">
          <PerformanceSearchSelect :key="searchKey" :model-value="null" :options="candidateOptions" remote-search hide-arrow option-style="none" option-layout="detailed" placeholder="搜索成员" aria-label="搜索可邀请成员" :loading="candidateLoading" loading-text="正在加载成员…" :empty-text="candidateError || '暂无可以邀请的成员'" :disabled="!canInvite || inviting" @search="loadCandidates" @close="closeSearch" @update:model-value="inviteCandidate">
            <template v-if="candidateError" #footer><UiButton variant="text" @click="loadCandidates(candidateKeyword)">重试</UiButton></template>
          </PerformanceSearchSelect>
        </PerformanceDisabledReason>
        <div v-if="error" class="invite-panel__error" role="alert">
          {{ error }}
          <UiButton v-if="!readonly" variant="text" :disabled="loading || inviting" @click="load">重新读取名单</UiButton>
        </div>
        <div v-if="loading" class="invite-panel__state" role="status">正在加载 360° 评估邀请…</div>
      </template>
      <template v-if="!readonly" #actions="{ row }">
        <PerformanceDisabledReason disabled :reason="row.revoke_disabled_reason || '周期删除策略尚未开放，暂不可撤销邀请'">
          <UiButton variant="text" size="small" disabled aria-label="撤销邀请">撤销</UiButton>
        </PerformanceDisabledReason>
      </template>
    </PerformanceReviewer360InviteBody>
  </section>
</template>

<style scoped>
.invite-panel { min-width: 0; }
.invite-panel__search { display: flex; width: 100%; min-width: 0; }
.invite-panel__error { padding: 8px 0; color: var(--color-danger); overflow-wrap: anywhere; }
.invite-panel__state { padding: 24px 0; color: var(--color-text-secondary); }
</style>
