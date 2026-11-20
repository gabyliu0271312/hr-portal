<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  performanceReview360InviteApi,
  type PerformanceReview360InvitedReviewer,
  type PerformanceReview360InviteCandidate,
  type PerformanceReview360InviteList,
} from '@/api/performance'
import UiButton from '../ui/UiButton.vue'
import PerformanceReviewer360InviteBody from './PerformanceReviewer360InviteBody.vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import PerformanceConfirmDialog from './PerformanceConfirmDialog.vue'

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
const limitDialogOpen = ref(false)
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
const canEdit = computed(() => Boolean(props.data && contextMatches.value && !props.readonly && !props.disabled
  && !loading.value && !conflict.value && roster.value?.task_id && typeof roster.value.version === 'string' && roster.value.version
  && roster.value.editable === true && projectId.value))
function effectiveLimit(data?: PerformanceReview360InviteList) {
  if (!data) return null
  const limits = [data.effective_limit,
    data.maximum_invite_mode === 'LIMIT' ? data.maximum_invited_count : null,
    data.second_prompt_enabled && data.second_prompt_mode === 'LIMIT' ? data.second_prompt_count : null,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0)
  return limits.length ? Math.min(...limits) : null
}
const limit = computed(() => effectiveLimit(roster.value))
const limitReached = computed(() => limit.value !== null && (roster.value?.count ?? 0) >= limit.value)
const canInvite = computed(() => canEdit.value && roster.value?.can_invite === true && !limitReached.value)
const items = computed(() => roster.value?.items ?? [])
const counted = computed(() => roster.value?.count ?? 0)
const candidateOptions = computed(() => candidates.value.map(candidate => ({
  value: candidate.employee_no, label: candidate.display_name,
  searchText: `${candidateKeyword.value} ${candidate.display_name} ${candidate.employee_no} ${candidate.department || ''} ${candidate.relationship || ''}`,
  subLabel: [candidate.department, candidate.relationship].filter(Boolean).join(' · ') || undefined,
  avatarFallback: candidate.display_name.slice(-1),
  disabled: candidateLoading.value || inviting.value || items.value.some(item => item.employee_no === candidate.employee_no),
  disabledText: items.value.some(item => item.employee_no === candidate.employee_no) ? '已邀请' : undefined,
})))
const minimumHint = computed(() => {
  const minimum = roster.value?.minimum_invited_count ?? 0
  const prefix = roster.value?.exclude_default_invite_from_limit ? '除系统默认邀请外，' : ''
  const hints = minimum > 0 ? [`建议至少邀请 ${minimum} 人`] : []
  if (limit.value !== null) hints.push(`最多邀请 ${limit.value} 人`)
  else if (roster.value?.maximum_invited_count != null) hints.push(`建议最多邀请 ${roster.value.maximum_invited_count} 人`)
  hints.push(`现已邀请 ${counted.value} 人`)
  const extraHints = limitReached.value ? ['已达邀请上限不能再继续添加。'] : []
  if (roster.value?.second_prompt_enabled && roster.value.second_prompt_mode !== 'LIMIT' && roster.value.second_prompt_count != null && counted.value >= roster.value.second_prompt_count) extraHints.push(`已达到二次触发提示人数（${roster.value.second_prompt_count} 人）。`)
  return `${prefix}${hints.join('，')}。${extraHints.join('')}上级和 HRBP 也可继续补充邀请 360° 评估人。`
})
const limitDescription = computed(() => `本次最多可邀请 ${limit.value ?? 0} 位360°评估人，当前计入额度 ${counted.value} 人${roster.value?.exclude_default_invite_from_limit ? '（不包含系统默认邀请）' : ''}，无法继续邀请。`)
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
    const result = await performanceReview360InviteApi.list(currentProject, undefined, sourceTaskId, 'edit')
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
async function mutateRoster(employeeNo: string, revoke = false) {
  if (inviting.value || !canEdit.value) return
  const version = contextVersion
  const data = roster.value!
  const candidateName = candidates.value.find(candidate => candidate.employee_no === employeeNo)?.display_name || employeeNo
  inviting.value = true
  error.value = ''
  emit('busy', true)
  try {
    const result = revoke
      ? await performanceReview360InviteApi.revoke(projectId.value!, employeeNo, data.task_id, data.version!)
      : await performanceReview360InviteApi.submit(projectId.value!, [employeeNo], data.task_id, data.version!)
    if (!isCurrent(version)) return
    if (!result.reviewer_360 || !matchesSnapshot(result.reviewer_360, data)) {
      conflict.value = true
      error.value = '名单已更新，请重新读取名单后继续操作'
      return
    }
    const previousCount = data.count ?? 0
    roster.value = result.reviewer_360
    closeSearch()
    searchKey.value++
    const reached = !revoke && limitReached.value && previousCount < (limit.value ?? 0)
    emit('change', result.reviewer_360)
    if (reached) limitDialogOpen.value = true
    if ('rejected' in result && result.rejected?.length) ElMessage.warning(`部分人员不可邀请：${candidateName}`)
  } catch (err: unknown) {
    if (!isCurrent(version)) return
    const response = (err as { response?: { status?: number; data?: { detail?: string } } }).response
    conflict.value = response?.status === 409
    error.value = conflict.value ? '名单已变化，请重新读取名单后再操作；本次操作未自动重试'
      : response?.data?.detail === 'INVITE_LIMIT_REACHED' ? '已达邀请人数上限，无法继续邀请' : revoke ? '移除失败，请稍后重试' : '邀请失败，请稍后重试'
    if (response?.data?.detail === 'INVITE_LIMIT_REACHED') limitDialogOpen.value = true
    ElMessage.error(error.value)
  } finally {
    inviting.value = false
    if (!disposed) emit('busy', false)
  }
}
async function inviteCandidate(employeeNo: string | string[] | null) {
  if (typeof employeeNo !== 'string' || !canInvite.value || inviting.value || candidateLoading.value || candidateError.value
    || !candidates.value.some(candidate => candidate.employee_no === employeeNo)
    || items.value.some(item => item.employee_no === employeeNo)) return
  await mutateRoster(employeeNo)
}
async function revokeReviewer(row: PerformanceReview360InvitedReviewer) {
  if (!canEdit.value || row.can_revoke !== true || !items.value.includes(row)) return
  await mutateRoster(row.employee_no, true)
}
watch(() => [props.projectId, props.nodeId, props.data, props.readonly, props.disabled] as const, (next, previous) => {
  if (previous && next[0] === previous[0] && next[1] === previous[1] && next[3] === previous[3] && next[4] === previous[4] && next[2] === roster.value) return
  contextVersion++
  searchKey.value++
  listRequest++
  closeSearch()
  loading.value = false
  roster.value = props.data
  error.value = ''
  conflict.value = false
  limitDialogOpen.value = false
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
    <PerformanceReviewer360InviteBody :items="items" :total="roster?.total ?? 0" :minimum-hint="minimumHint" :editable="canEdit" interactive>
      <template #search>
        <PerformanceSearchSelect class="invite-panel__search" :key="searchKey" :model-value="null" :options="candidateOptions" remote-search hide-arrow option-style="none" option-layout="detailed" placeholder="搜索成员" aria-label="搜索可邀请成员" :loading="candidateLoading" loading-text="正在加载成员…" :empty-text="candidateError || '暂无可以邀请的成员'" :disabled="!canInvite || inviting" @search="loadCandidates" @close="closeSearch" @update:model-value="inviteCandidate">
          <template v-if="candidateError" #footer><UiButton variant="text" @click="loadCandidates(candidateKeyword)">重试</UiButton></template>
        </PerformanceSearchSelect>
        <div v-if="error" class="invite-panel__error" role="alert">
          {{ error }}
          <UiButton v-if="!readonly" variant="text" :disabled="loading || inviting" @click="load">重新读取名单</UiButton>
        </div>
        <div v-if="loading" class="invite-panel__state" role="status">正在加载 360° 评估邀请…</div>
      </template>
      <template #actions="{ row }">
        <button type="button" class="invite-panel__remove" :disabled="inviting" :aria-label="`移除${row.display_name}`" @click="revokeReviewer(row)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" data-icon="CloseBoldOutlined" aria-hidden="true"><path d="M19.778 19.778a1.5 1.5 0 0 0 0-2.121L14.122 12l5.656-5.657a1.5 1.5 0 1 0-2.12-2.121L12 9.879 6.343 4.222a1.5 1.5 0 1 0-2.12 2.121L9.878 12l-5.657 5.657a1.5 1.5 0 1 0 2.121 2.121L12 14.121l5.657 5.657a1.5 1.5 0 0 0 2.121 0Z" fill="currentColor" /></svg></button>
      </template>
    </PerformanceReviewer360InviteBody>
    <PerformanceConfirmDialog v-model="limitDialogOpen" appearance="submit" message="已达360°评估人邀请数量上限" :description="limitDescription" :show-cancel="false" confirm-text="我知道了" confirm-variant="primary" @confirm="limitDialogOpen = false" />
  </section>
</template>

<style scoped>
.invite-panel { min-width: 0; }
.invite-panel__search { display: flex; width: 100%; min-width: 0; }
.invite-panel__search :deep(.performance-select-shell) { flex: 1; width: 100%; min-width: 0; }
.invite-panel__search :deep(.performance-search-select__trigger) { width: 100%; min-width: 0; }
.invite-panel__error { padding: var(--spacing-2) 0; color: var(--color-danger); overflow-wrap: anywhere; }
.invite-panel__state { padding: var(--spacing-6) 0; color: var(--color-text-secondary); }
.invite-panel__remove { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 12px; height: 12px; padding: 0; border: 0; background: transparent; color: var(--performance-invite-close-color); cursor: pointer; }
.invite-panel__remove:hover:not(:disabled) { color: var(--performance-invite-close-hover-color); }
.invite-panel__remove:active:not(:disabled) { color: var(--performance-invite-close-active-color); }
.invite-panel__remove:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.invite-panel__remove:disabled { cursor: not-allowed; color: var(--color-text-disabled); }
.invite-panel__remove svg { display: block; width: 12px; height: 12px; }
</style>
