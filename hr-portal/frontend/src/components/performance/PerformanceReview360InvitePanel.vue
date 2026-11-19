<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  performanceReview360InviteApi,
  type PerformanceReview360InviteCandidate,
  type PerformanceReview360InviteList,
  type PerformanceReview360InvitedReviewer,
} from '@/api/performance'
import PerformanceListToolbar from './PerformanceListToolbar.vue'
import UiButton from '../ui/UiButton.vue'
import UiDrawerShell from '../ui/UiDrawerShell.vue'
import PerformanceManagementTable from './PerformanceManagementTable.vue'
import PerformanceMemberIdentity from './PerformanceMemberIdentity.vue'
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
const keyword = ref('')
const groupBy = ref<'relationship' | 'inviter'>('relationship')
const inviteDrawerOpen = ref(false)
const candidateKeyword = ref('')
const candidates = ref<PerformanceReview360InviteCandidate[]>([])
const candidateLoading = ref(false)
const candidateError = ref('')
const selectedCandidates = ref<Set<string>>(new Set())
const inviting = ref(false)
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
    : !canInvite.value ? '当前任务不允许邀请评估人，请重新打开任务确认权限' : '')
const items = computed(() => roster.value?.items ?? [])
const manualCount = computed(() => roster.value?.manual_count ?? items.value.filter(item => item.source_type !== 'DEFAULT').length)
const counted = computed(() => roster.value?.count ?? (roster.value?.exclude_default_invite_from_limit ? manualCount.value : (roster.value?.total ?? 0)))
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
const groups = computed(() => {
  const search = keyword.value.trim().toLocaleLowerCase()
  const grouped = new Map<string, PerformanceReview360InvitedReviewer[]>()
  items.value.filter(item => !search || [item.display_name, item.employee_no, item.department, item.relationship, item.source_label]
    .some(value => value?.toLocaleLowerCase().includes(search))).forEach(item => {
    const label = groupBy.value === 'relationship' ? item.relationship || '关系未提供' : item.source_label || '邀请来源未提供'
    grouped.set(label, [...(grouped.get(label) ?? []), item])
  })
  return [...grouped].map(([label, rows]) => ({ label, rows }))
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
async function loadCandidates() {
  if (!canInvite.value || inviting.value || !inviteDrawerOpen.value) return
  const version = contextVersion
  const request = ++candidateRequest
  candidateLoading.value = true
  candidateError.value = ''
  try {
    const result = await performanceReview360InviteApi.candidates(projectId.value!, candidateKeyword.value.trim() || undefined, roster.value!.task_id)
    if (!isCurrent(version) || request !== candidateRequest || !canInvite.value || !inviteDrawerOpen.value) return
    candidates.value = result.items
  } catch {
    if (isCurrent(version) && request === candidateRequest && inviteDrawerOpen.value) candidateError.value = '成员加载失败，请重试'
  } finally {
    if (isCurrent(version) && request === candidateRequest) candidateLoading.value = false
  }
}
function openInviteDrawer() {
  if (!canInvite.value || inviting.value) return
  candidateKeyword.value = ''
  candidates.value = []
  selectedCandidates.value = new Set()
  inviteDrawerOpen.value = true
  void loadCandidates()
}
function toggleCandidate(employeeNo: string) {
  if (!canInvite.value || inviting.value || candidateLoading.value || candidateError.value) return
  const next = new Set(selectedCandidates.value)
  if (next.has(employeeNo)) next.delete(employeeNo)
  else next.add(employeeNo)
  selectedCandidates.value = next
}
async function confirmInvite() {
  if (!canInvite.value || inviting.value || candidateLoading.value || candidateError.value || !inviteDrawerOpen.value || !selectedCandidates.value.size) return
  const version = contextVersion
  const data = roster.value!
  inviting.value = true
  error.value = ''
  emit('busy', true)
  try {
    const result = await performanceReview360InviteApi.submit(projectId.value!, [...selectedCandidates.value], data.task_id, data.version!)
    if (!isCurrent(version) || !canInvite.value) return
    if (!result.reviewer_360 || !matchesSnapshot(result.reviewer_360, data)) {
      conflict.value = true
      error.value = '名单已更新，请重新读取名单后继续操作'
      return
    }
    roster.value = result.reviewer_360
    emit('change', result.reviewer_360)
    if (result.rejected?.length) ElMessage.warning(`部分人员不可邀请：${result.rejected.map(employeeNo => candidates.value.find(item => item.employee_no === employeeNo)?.display_name || employeeNo).join('、')}`)
    inviteDrawerOpen.value = false
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
  listRequest++
  candidateRequest++
  loading.value = false
  candidateLoading.value = false
  roster.value = props.data
  error.value = ''
  conflict.value = false
  keyword.value = ''
  inviteDrawerOpen.value = false
  candidates.value = []
  candidateError.value = ''
  selectedCandidates.value = new Set()
  if (!props.data && !props.readonly) void load()
}, { immediate: true, flush: 'sync' })
watch(inviteDrawerOpen, open => {
  if (!open) { candidateRequest++; candidateLoading.value = false }
}, { flush: 'sync' })
onBeforeUnmount(() => {
  disposed = true
  contextVersion++
  if (inviting.value) emit('busy', false)
})
</script>

<template>
  <section class="invite-panel" aria-label="360° 评估邀请" :aria-busy="inviting || loading">
    <div class="invite-panel__intro">
      <div class="performance-item-title">通过「搜索」添加 360° 评估人</div>
      <p>已邀请 {{ roster?.total ?? 0 }} 人，{{ minimumHint }}。</p>
      <p v-if="limitHint">{{ limitHint }}</p>
    </div>
    <PerformanceListToolbar v-model:keyword="keyword" search-placeholder="搜索成员" search-aria-label="搜索已邀请成员" :show-filter="false" search-fill>
      <template v-if="!readonly" #actions>
        <PerformanceDisabledReason :disabled="!canInvite" :reason="inviteDisabledReason">
          <UiButton variant="outline-primary" :disabled="!canInvite || inviting" aria-label="邀请 360° 评估人" @click="openInviteDrawer">搜索添加</UiButton>
        </PerformanceDisabledReason>
      </template>
    </PerformanceListToolbar>
    <div v-if="error" class="invite-panel__error" role="alert">
      {{ error }}
      <UiButton v-if="!readonly" variant="text" :disabled="loading || inviting" @click="load">重新读取名单</UiButton>
    </div>
    <div class="invite-panel__list-title">已邀请列表：当前共 {{ roster?.total ?? 0 }} 人</div>
    <div class="invite-panel__segmented" role="radiogroup" aria-label="邀请列表分组方式">
      <button type="button" role="radio" :aria-checked="groupBy === 'relationship'" @click="groupBy = 'relationship'">按关系</button>
      <button type="button" role="radio" :aria-checked="groupBy === 'inviter'" @click="groupBy = 'inviter'">按邀请人</button>
    </div>
    <div v-if="loading" class="invite-panel__state" role="status">正在加载 360° 评估邀请…</div>
    <div v-else-if="!groups.length" class="invite-panel__state">{{ keyword ? '未找到匹配的已邀请成员' : '暂无已邀请的评估人' }}</div>
    <div v-for="group in groups" :key="group.label" class="invite-panel__group">
      <div class="invite-panel__group-title">{{ group.label }}（{{ group.rows.length }} 人）</div>
      <PerformanceManagementTable :rows="group.rows" :loading="false" loading-text="正在加载…" empty-text="暂无评估人" table-aria-label="360° 评估邀请列表" pagination-aria-label="360° 评估邀请列表分页" :show-pagination="false" row-key="employee_no">
        <el-table-column label="姓名" min-width="160">
          <template #default="{ row }"><PerformanceMemberIdentity :display-name="row.display_name" :identity-status="row.identity_status" /></template>
        </el-table-column>
        <el-table-column label="关系" min-width="140"><template #default="{ row }">{{ row.relationship || '未提供' }}</template></el-table-column>
        <el-table-column label="邀请来源" prop="source_label" min-width="140" />
        <el-table-column v-if="!readonly" label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <PerformanceDisabledReason disabled :reason="row.revoke_disabled_reason || '周期删除策略尚未开放，暂不可撤销邀请'">
              <UiButton variant="text" size="small" disabled aria-label="撤销邀请">撤销</UiButton>
            </PerformanceDisabledReason>
          </template>
        </el-table-column>
      </PerformanceManagementTable>
    </div>
    <UiDrawerShell v-if="!readonly" v-model="inviteDrawerOpen" width="560px" variant="captured" title="邀请 360° 评估人" aria-label="邀请 360° 评估人">
      <div class="invite-candidates">
        <PerformanceListToolbar v-model:keyword="candidateKeyword" search-placeholder="搜索成员" search-aria-label="搜索可邀请成员" :show-filter="false" @search="loadCandidates" @clear="loadCandidates" />
        <div v-if="candidateLoading" class="invite-panel__state">正在加载成员…</div>
        <div v-else-if="candidateError" class="invite-panel__error" role="alert">{{ candidateError }} <UiButton variant="text" @click="loadCandidates">重试</UiButton></div>
        <div v-else-if="!candidates.length" class="invite-panel__state">暂无可以邀请的成员</div>
        <ul v-else class="invite-candidates__list">
          <li v-for="candidate in candidates" :key="candidate.employee_no">
            <label class="invite-candidate">
              <input type="checkbox" :disabled="!canInvite || inviting" :checked="selectedCandidates.has(candidate.employee_no)" :aria-label="`邀请${candidate.display_name}`" @change="toggleCandidate(candidate.employee_no)">
              <PerformanceMemberIdentity :display-name="candidate.display_name" />
              <span class="invite-candidate__meta">{{ candidate.department || '' }}</span>
            </label>
          </li>
        </ul>
        <div class="invite-candidates__footer">
          <span>已选 {{ selectedCandidates.size }} 人</span>
          <UiButton variant="primary" :disabled="!canInvite || !selectedCandidates.size || candidateLoading || Boolean(candidateError)" :loading="inviting" @click="confirmInvite">确认邀请</UiButton>
        </div>
      </div>
    </UiDrawerShell>
  </section>
</template>

<style scoped>
.invite-panel { min-width: 0; color: var(--color-text-primary); font: 400 14px/21px var(--font-sans); }
.invite-panel__intro { margin-bottom: 8px; }
.invite-panel__intro p { margin: 4px 0; color: var(--color-text-secondary); }
.invite-panel__list-title { margin-top: 20px; font-weight: 600; }
.invite-panel__segmented { display: inline-flex; margin: 8px 0 12px; }
.invite-panel__segmented button { padding: 4px 16px; border: 1px solid var(--color-border); border-radius: 6px 0 0 6px; background: var(--color-bg-card); color: inherit; font: inherit; cursor: pointer; }
.invite-panel__segmented button + button { margin-left: -1px; border-radius: 0 6px 6px 0; }
.invite-panel__segmented button[aria-checked="true"] { position: relative; border-color: var(--color-primary); color: var(--performance-button-text-color); font-weight: 500; }
.invite-panel__group { margin-bottom: 12px; min-width: 0; }
.invite-panel__group-title { padding: 8px 12px; background: var(--color-bg-subtle); color: var(--color-text-secondary); }
.invite-panel__error { padding: 8px 0; color: var(--color-danger); overflow-wrap: anywhere; }
.invite-panel__state { padding: 24px 0; color: var(--color-text-secondary); }
.invite-candidates { display: flex; min-height: 0; flex-direction: column; }
.invite-candidates__list { min-height: 0; margin: 0; padding: 0; list-style: none; overflow-y: auto; }
.invite-candidate { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--color-border); cursor: pointer; }
.invite-candidate input { flex: 0 0 16px; width: 16px; height: 16px; margin: 0; accent-color: var(--color-primary); }
.invite-candidate__meta { min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--color-text-secondary); font-size: 12px; }
.invite-candidates__footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 12px; border-top: 1px solid var(--color-border); }
</style>
