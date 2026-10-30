<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  performanceReview360InviteApi,
  type PerformanceReview360InviteCandidate,
  type PerformanceReview360InvitedReviewer,
} from '@/api/performance'
import PerformanceListToolbar from './PerformanceListToolbar.vue'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceDrawerShell from './PerformanceDrawerShell.vue'
import ProjectMemberColumnDrawer, { type MemberColumnOption } from './ProjectMemberColumnDrawer.vue'
import PerformanceColumnVisibilityIcon from './PerformanceColumnVisibilityIcon.vue'

const props = defineProps<{
  projectId: number | string
  nodeId: string
}>()

const loading = ref(false)
const error = ref('')
const keyword = ref('')
const items = ref<PerformanceReview360InvitedReviewer[]>([])
const total = ref(0)
const minimumInvitedCount = ref(0)
const maximumInvitedCount = ref<number | null>(null)
const maximumInviteMode = ref('SUGGESTED')
const secondPromptEnabled = ref(false)
const secondPromptCount = ref<number | null>(null)
const secondPromptMode = ref('SUGGESTED')

const columns: MemberColumnOption[] = [
  { key: 'name', label: '姓名', locked: true },
  { key: 'status', label: '360° 评估状态' },
  { key: 'source_label', label: '评估类型' },
  { key: 'due_at', label: '360° 评估截止时间' },
  { key: 'job_sequence', label: '序列' },
  { key: 'department', label: '所属部门' },
]
const selectedColumnKeys = ref<string[]>(columns.map(column => column.key))
const columnDrawerOpen = ref(false)
const hiddenColumnCount = computed(() => Math.max(0, columns.length - selectedColumnKeys.value.length))
const visibleColumns = computed(() => selectedColumnKeys.value.map(key => columns.find(column => column.key === key)).filter((column): column is MemberColumnOption => Boolean(column)))

async function load() {
  loading.value = true
  error.value = ''
  try {
    const result = await performanceReview360InviteApi.list(props.projectId, keyword.value.trim() || undefined)
    items.value = result.items
    total.value = result.total
    minimumInvitedCount.value = result.minimum_invited_count
    maximumInvitedCount.value = result.maximum_invited_count
    maximumInviteMode.value = result.maximum_invite_mode
    secondPromptEnabled.value = result.second_prompt_enabled
    secondPromptCount.value = result.second_prompt_count
    secondPromptMode.value = result.second_prompt_mode
  } catch {
    error.value = '360° 评估邀请加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

const inviteDrawerOpen = ref(false)
const candidateKeyword = ref('')
const candidates = ref<PerformanceReview360InviteCandidate[]>([])
const candidateLoading = ref(false)
const selectedCandidates = ref<Set<string>>(new Set())

async function loadCandidates() {
  candidateLoading.value = true
  try {
    const result = await performanceReview360InviteApi.candidates(props.projectId, candidateKeyword.value.trim() || undefined)
    candidates.value = result.items
  } catch {
    candidates.value = []
  } finally {
    candidateLoading.value = false
  }
}
function openInviteDrawer() {
  candidateKeyword.value = ''
  selectedCandidates.value = new Set()
  inviteDrawerOpen.value = true
  void loadCandidates()
}
function searchCandidates() {
  void loadCandidates()
}
function toggleCandidate(employeeNo: string) {
  const next = new Set(selectedCandidates.value)
  if (next.has(employeeNo)) next.delete(employeeNo)
  else next.add(employeeNo)
  selectedCandidates.value = next
}
function candidateName(employeeNo: string) {
  return candidates.value.find(candidate => candidate.employee_no === employeeNo)?.display_name || employeeNo
}
const inviting = ref(false)
async function confirmInvite() {
  if (inviting.value || selectedCandidates.value.size === 0) return
  inviting.value = true
  try {
    const result = await performanceReview360InviteApi.submit(props.projectId, [...selectedCandidates.value])
    if (result.rejected.length) {
      ElMessage.warning(`部分人员不可邀请：${result.rejected.map(candidateName).join('、')}`)
    }
    inviteDrawerOpen.value = false
    void load()
  } catch (err: unknown) {
    const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    ElMessage.error(detail === 'INVITE_LIMIT_REACHED' ? '已达邀请人数上限，无法继续邀请' : '邀请提交失败，请稍后重试')
  } finally {
    inviting.value = false
  }
}
const revoking = ref<string | null>(null)
async function revoke(employeeNo: string) {
  if (revoking.value) return
  revoking.value = employeeNo
  try {
    await performanceReview360InviteApi.revoke(props.projectId, employeeNo)
    void load()
  } catch {
    ElMessage.error('撤销邀请失败，请稍后重试')
  } finally {
    revoking.value = null
  }
}

const statusLabel: Record<string, string> = { invited: '已邀请', pending: '待填写', completed: '已完成' }
const minimumHint = computed(() => {
  if (!minimumInvitedCount.value) return ''
  if (total.value < minimumInvitedCount.value) return `任务未完成：还需邀请 ${minimumInvitedCount.value - total.value} 人`
  return `已满足最少邀请人数（${minimumInvitedCount.value} 人）`
})
const maximumHint = computed(() => {
  if (!maximumInvitedCount.value) return ''
  if (maximumInviteMode.value === 'LIMIT' && total.value >= maximumInvitedCount.value) return `已达最多邀请人数上限（${maximumInvitedCount.value} 人）`
  return `最多邀请人数 ${maximumInvitedCount.value} 人`
})
const secondPromptHint = computed(() => {
  if (!secondPromptEnabled.value || !secondPromptCount.value || total.value < secondPromptCount.value) return ''
  const mode = secondPromptMode.value === 'LIMIT' ? '，达到二次邀请上限' : ''
  return `已达到二次触发提示人数（${secondPromptCount.value} 人）${mode}`
})
function columnMinWidth(key: string) {
  switch (key) {
    case 'name': return 160
    case 'due_at': return 160
    case 'status': return 130
    case 'source_label': return 110
    case 'department': return 160
    default: return 100
  }
}
function cellValue(item: PerformanceReview360InvitedReviewer, key: string) {
  switch (key) {
    case 'name': return item.display_name
    case 'status': return statusLabel[item.status] || item.status
    case 'source_label': return item.source_label
    case 'due_at': return item.due_at ? new Date(item.due_at).toLocaleString('zh-CN', { hour12: false }) : '--'
    case 'job_sequence': return item.job_sequence || '--'
    case 'department': return item.department || '--'
    default: return ''
  }
}
function applyColumns(keys: string[]) { selectedColumnKeys.value = keys }

watch(() => props.projectId, () => { void load() })
onMounted(() => void load())
</script>

<template>
  <section class="invite-panel" aria-label="360° 评估邀请">
    <PerformanceListToolbar
      v-model:keyword="keyword"
      search-placeholder="搜索成员"
      search-aria-label="搜索成员"
      :show-filter="false"
      @search="load()"
      @clear="load()"
    >
      <template #actions>
        <PerformanceButton variant="primary" aria-label="邀请 360° 评估人" @click="openInviteDrawer">邀请评估人</PerformanceButton>
      </template>
    </PerformanceListToolbar>
    <div class="invite-panel__summary">
      <span>{{ total }}个结果</span>
      <button class="invite-panel__column-button" type="button" @click="columnDrawerOpen = true"><PerformanceColumnVisibilityIcon /><span>{{ hiddenColumnCount }} 列被隐藏</span></button>
    </div>
    <p v-if="minimumHint || maximumHint || secondPromptHint" class="invite-panel__hint">
      <span v-if="minimumHint" class="invite-panel__hint-item" :class="{ 'is-incomplete': total < minimumInvitedCount }">{{ minimumHint }}</span>
      <span v-if="maximumHint" class="invite-panel__hint-item">{{ maximumHint }}</span>
      <span v-if="secondPromptHint" class="invite-panel__hint-item">{{ secondPromptHint }}</span>
    </p>
    <div style="overflow-x: auto">
      <el-table :data="items" v-loading="loading" style="width: 100%" max-height="600" :empty-text="error || '暂无 360° 评估邀请，可以邀请其他同事'">
        <el-table-column v-for="column in visibleColumns" :key="column.key" :prop="column.key" :label="column.label" :min-width="columnMinWidth(column.key)">
          <template #default="{ row }">
            <span v-if="column.key === 'name'" class="invite-panel__identity">{{ row.display_name }}</span>
            <span v-else-if="column.key === 'status'">
              <span class="invite-panel__status" :class="`is-${row.status}`">{{ cellValue(row, column.key) }}</span>
            </span>
            <span v-else>{{ cellValue(row, column.key) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <PerformanceButton variant="text" size="small" :disabled="row.status === 'completed' || Boolean(revoking)" aria-label="撤销邀请" @click="revoke(row.employee_no)">撤销</PerformanceButton>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <ProjectMemberColumnDrawer v-model="columnDrawerOpen" :columns="columns" :selected-keys="selectedColumnKeys" @confirm="applyColumns" />

    <PerformanceDrawerShell v-model="inviteDrawerOpen" width="560px" variant="captured" title="邀请 360° 评估人" aria-label="邀请 360° 评估人">
      <div class="invite-candidates">
        <PerformanceListToolbar
          v-model:keyword="candidateKeyword"
          search-placeholder="搜索成员"
          search-aria-label="搜索成员"
          :show-filter="false"
          @search="searchCandidates"
          @clear="searchCandidates"
        />
        <div v-if="candidateLoading" class="invite-candidates__state">正在加载成员…</div>
        <div v-else-if="!candidates.length" class="invite-candidates__state">暂无可以邀请的成员</div>
        <ul v-else class="invite-candidates__list">
          <li v-for="candidate in candidates" :key="candidate.employee_no">
            <label class="invite-candidate">
              <input type="checkbox" :checked="selectedCandidates.has(candidate.employee_no)" :aria-label="`邀请${candidate.display_name}`" @change="toggleCandidate(candidate.employee_no)">
              <span class="invite-candidate__avatar">{{ candidate.display_name.slice(-1) }}</span>
              <span class="invite-candidate__copy">
                <span class="invite-candidate__name">{{ candidate.display_name }}</span>
                <span class="invite-candidate__meta">{{ candidate.job_sequence || '--' }}<template v-if="candidate.department"> · {{ candidate.department }}</template></span>
              </span>
            </label>
          </li>
        </ul>
        <div class="invite-candidates__footer">
          <span>已选 {{ selectedCandidates.size }} 人</span>
          <PerformanceButton variant="primary" :disabled="selectedCandidates.size === 0 || inviting" :loading="inviting" @click="confirmInvite">确认邀请</PerformanceButton>
        </div>
      </div>
    </PerformanceDrawerShell>
  </section>
</template>

<style scoped>
.invite-panel { min-width: 0; padding: 20px; box-sizing: border-box; border-radius: 8px; background: #fff; color: #1f2329; box-shadow: rgba(31,35,41,.03) 0 4px 16px 4px, rgba(31,35,41,.02) 0 4px 8px, rgba(31,35,41,.02) 0 2px 4px -4px; }
.invite-panel__summary { display: flex; align-items: center; justify-content: space-between; height: 22px; margin-bottom: 12px; font-size: 14px; line-height: 22px; }
.invite-panel__column-button { display: inline-flex; align-items: center; height: 22px; padding: 2px 4px; border: 0; border-radius: 6px; background: transparent; color: #1456f0; cursor: pointer; font: inherit; }
.invite-panel__column-button svg { flex: 0 0 16px; width: 16px; height: 16px; margin-right: 4px; }
.invite-panel__hint { display: flex; flex-wrap: wrap; gap: 8px 24px; margin: 0 0 12px; font-size: 13px; line-height: 20px; }
.invite-panel__hint-item { color: #646a73; }
.invite-panel__hint-item.is-incomplete { color: #d14343; }
.invite-panel__identity { font-weight: 500; }
.invite-panel__status { display: inline-flex; align-items: center; min-width: 56px; height: 22px; padding: 0 8px; border-radius: 9999px; font-size: 12px; line-height: 22px; }
.invite-panel__status.is-invited { background: #f1f2f4; color: #646a73; }
.invite-panel__status.is-pending { background: #fff0df; color: #d46b08; }
.invite-panel__status.is-completed { background: #d5f6f2; color: #024b41; }
.invite-candidates { display: flex; min-height: 0; flex-direction: column; }
.invite-candidates__state { display: grid; min-height: 240px; place-items: center; color: #8f959e; font-size: 14px; }
.invite-candidates__list { flex: 1; min-height: 0; margin: 0; padding: 0; list-style: none; overflow-y: auto; }
.invite-candidate { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(31,35,41,.08); cursor: pointer; }
.invite-candidate input { flex: 0 0 16px; width: 16px; height: 16px; margin: 0; accent-color: #3370ff; }
.invite-candidate__avatar { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 32px; width: 32px; height: 32px; border-radius: 50%; background: #e5eaf5; color: #3b5b92; font-size: 13px; }
.invite-candidate__copy { display: flex; min-width: 0; flex-direction: column; }
.invite-candidate__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #1f2329; font-size: 14px; line-height: 22px; }
.invite-candidate__meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #646a73; font-size: 12px; line-height: 20px; }
.invite-candidates__footer { display: flex; align-items: center; justify-content: space-between; padding-top: 12px; border-top: 1px solid rgba(31,35,41,.08); }
</style>
