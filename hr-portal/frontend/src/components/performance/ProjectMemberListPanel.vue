<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { projectManagementApi, performanceWorkbenchApi, type ProjectMember, type PerformanceWorkbenchTaskPerson } from '@/api/performance'
import PerformanceListToolbar from './PerformanceListToolbar.vue'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceTableSummary from './PerformanceTableSummary.vue'
import PerformanceManagementTable from './PerformanceManagementTable.vue'
import PerformanceExportIcon from './PerformanceExportIcon.vue'
import ProjectMemberColumnDrawer, { type MemberColumnOption } from './ProjectMemberColumnDrawer.vue'
import { type PerformanceTableColumn } from './performanceTableColumns'
import { sortPerformanceRows, type PerformanceSortOrder } from './performanceTableSort'

type MemberRow = ProjectMember & {
  task_id?: number
  aggregate_task_id?: number | null
  status?: string
  due_at?: string | null
}

const props = withDefaults(defineProps<{
  projectId: number | string
  reviewContext?: { nodeId: string; state: 'pending' | 'completed' | 'all' }
  showExport?: boolean
  searchWidth?: string
}>(), {
  reviewContext: undefined,
  showExport: true,
  searchWidth: '224px',
})
const emit = defineEmits<{
  filter: []
  export: []
  'columns-change': [keys: string[]]
  'select-member': [member: MemberRow]
  'authorize-selected': []
  'transfer-selected': []
}>()
const keyword = ref('')
const members = ref<MemberRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(50)
const loading = ref(false)
const error = ref('')
const sortBy = ref('')
const sortOrder = ref<PerformanceSortOrder>('')

const projectColumns: MemberColumnOption[] = [
  { key: 'name', label: '姓名', locked: true },
  { key: 'rating', label: '绩效评级' },
  { key: 'completion', label: '360° 评估率' },
  { key: 'direct_supervisor', label: '直属上级' },
  { key: 'job_sequence', label: '序列' },
  { key: 'position_level', label: '职级' },
  { key: 'hire_date', label: '入职日期' },
  { key: 'department', label: '所属部门' },
]
const reviewColumns: MemberColumnOption[] = [
  { key: 'name', label: '姓名', locked: true },
  { key: 'status', label: '状态' },
  { key: 'due_at', label: '截止时间' },
  { key: 'rating', label: '绩效评级' },
  { key: 'completion', label: '360° 评估率' },
  { key: 'direct_supervisor', label: '直属上级' },
  { key: 'job_sequence', label: '序列' },
  { key: 'position_level', label: '职级' },
  { key: 'hire_date', label: '入职日期' },
  { key: 'department', label: '所属部门' },
]
const columns = computed(() => props.reviewContext ? reviewColumns : projectColumns)
const profileColumnKeys: Record<string, string> = {
  department: 'department',
  direct_supervisor: 'direct_supervisor',
  position_level: 'position_level',
  job_sequence: 'job_sequence',
  hire_date: 'hire_date',
  employee_type: 'employee_type',
}
const visibleProfileColumnKeys = computed(() => {
  const configuredRows = members.value.filter(member => Array.isArray(member.visible_profile_fields))
  if (!configuredRows.length) return null
  return new Set(configuredRows.flatMap(member => (member.visible_profile_fields || []).map(field => profileColumnKeys[field])).filter(Boolean))
})
const availableColumns = computed(() => {
  const allowed = visibleProfileColumnKeys.value
  return allowed
    ? columns.value.filter(column => !Object.values(profileColumnKeys).includes(column.key) || allowed.has(column.key))
    : columns.value
})
const columnDrawerOpen = ref(false)
const selectedColumnKeys = ref<string[]>([])
watch([availableColumns, () => Boolean(props.reviewContext)], ([available, isReview]) => {
  const base = (isReview ? reviewColumns : projectColumns).map(column => column.key)
  const allowed = new Set(available.map(column => column.key))
  selectedColumnKeys.value = selectedColumnKeys.value.filter(key => allowed.has(key))
  if (!selectedColumnKeys.value.length) selectedColumnKeys.value = base.filter(key => allowed.has(key))
})
watch(() => Boolean(props.reviewContext), isReview => {
  selectedColumnKeys.value = (isReview ? reviewColumns : projectColumns).map(column => column.key)
}, { immediate: true })
const visibleColumns = computed(() => selectedColumnKeys.value.map(key => availableColumns.value.find(column => column.key === key)).filter((column): column is MemberColumnOption => Boolean(column)))
const hiddenColumnCount = computed(() => Math.max(0, availableColumns.value.length - selectedColumnKeys.value.length))

const memberSortValue = (member: MemberRow, key: string) => {
  switch (key) {
    case 'name': return member.display_name
    case 'status': return member.status === 'completed' ? 1 : member.status === 'overdue' ? 2 : 0
    case 'due_at': return member.due_at ? new Date(member.due_at).getTime() : null
    case 'completion': return typeof member.completion === 'number' ? member.completion : null
    default: return (member[key as keyof MemberRow] ?? null) as unknown
  }
}
const sortedMembers = computed(() => props.reviewContext
  ? sortPerformanceRows(members.value, sortBy.value, sortOrder.value, memberSortValue)
  : members.value)
const displayRows = computed(() => props.reviewContext
  ? sortedMembers.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
  : members.value)

const loadMembers = async () => {
  loading.value = true
  error.value = ''
  try {
    if (props.reviewContext) {
      const result = await performanceWorkbenchApi.taskPeople(Number(props.projectId), props.reviewContext.nodeId, props.reviewContext.state, keyword.value.trim() || undefined)
      members.value = result.map((item: PerformanceWorkbenchTaskPerson) => ({
        id: item.task_id,
        employee_no: item.employee_no,
        display_name: item.display_name,
        avatar_url: null,
        rating: null,
        rating_tone: null,
        completion: null,
        job_family: item.job_family,
        job_category: item.job_category,
        standard_position: item.standard_position ?? null,
      job_sequence: item.job_sequence,
        position_level: item.position_level,
        hire_date: item.hire_date,
        department: item.department,
        employee_type: item.employee_type,
        employment_status: item.employment_status,
        visible_profile_fields: item.visible_profile_fields,
        task_id: item.task_id,
        aggregate_task_id: item.aggregate_task_id,
        status: item.status,
        due_at: item.due_at,
      }))
      total.value = members.value.length
    } else {
      const result = await projectManagementApi.members(props.projectId, keyword.value.trim() || undefined, page.value, pageSize.value, sortBy.value || undefined, sortOrder.value || undefined)
      members.value = result.items
      total.value = result.total
    }
    const availableKeys = new Set(availableColumns.value.map(column => column.key))
    selectedColumnKeys.value = selectedColumnKeys.value.filter(key => availableKeys.has(key))
  } catch {
    error.value = '成员列表加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

const displayValue = (value: string | null) => value || ''
const ratingClass = (member: MemberRow) => member.rating_tone ? `rating-badge--${member.rating_tone}` : ''
const avatarText = (member: MemberRow) => member.display_name.slice(-1)
const cellValue = (member: MemberRow, key: string) => {
  if (key === 'name') return member.display_name
  if (key === 'status') return member.status === 'completed' ? '已完成' : member.status === 'overdue' ? '已逾期' : '待完成'
  if (key === 'due_at') return member.due_at ? new Date(member.due_at).toLocaleString('zh-CN', { hour12: false }) : '--'
  return displayValue(member[key as keyof MemberRow] as string | null)
}
function applyColumns(keys: string[]) { selectedColumnKeys.value = keys; emit('columns-change', keys) }

const tableColumns = computed<PerformanceTableColumn[]>(() => visibleColumns.value.map(column => ({
  key: column.key,
  label: column.label,
  sortable: true,
  fixed: column.key === 'name',
})))

function onSortChange({ key, order }: { key: string; order: PerformanceSortOrder }) {
  sortBy.value = order ? key : ''
  sortOrder.value = order
  page.value = 1
  if (!props.reviewContext) void loadMembers()
}

function changePage(nextPage: number) {
  if (nextPage < 1 || nextPage === page.value) return
  page.value = nextPage
  if (!props.reviewContext) void loadMembers()
}

function changePageSize(nextPageSize: number) {
  pageSize.value = nextPageSize
  page.value = 1
  if (!props.reviewContext) void loadMembers()
}

function onRowClick(member: MemberRow) {
  if (props.reviewContext) emit('select-member', member)
}

watch(() => [props.projectId, props.reviewContext?.nodeId, props.reviewContext?.state], () => {
  page.value = 1
  void loadMembers()
})

onMounted(() => void loadMembers())
</script>

<template>
  <section class="member-list-panel" aria-label="成员列表">
    <div class="card-sticky-mask" aria-hidden="true"></div>
    <PerformanceListToolbar
      v-model:keyword="keyword"
      class="member-list-toolbar"
      search-placeholder="搜索成员"
      search-aria-label="搜索成员"
      :search-width="searchWidth"
      @search="page = 1; loadMembers()"
      @clear="page = 1; loadMembers()"
      @filter="emit('filter')"
    >
      <template v-if="showExport" #actions>
        <button class="member-action-button" type="button" aria-label="导出" @click="emit('export')"><PerformanceExportIcon class="export-icon" /><span>导出</span></button>
      </template>
    </PerformanceListToolbar>
    <PerformanceTableSummary :total="total" :hidden-column-count="hiddenColumnCount" @columns="columnDrawerOpen = true" />
    <PerformanceManagementTable
      :rows="displayRows"
      :loading="loading"
      loading-text="正在加载成员…"
      :empty-text="error || '暂无成员'"
      table-aria-label="成员列表"
      pagination-aria-label="成员列表分页"
      :page="page"
      :page-size="pageSize"
      :total="total"
      :sort-key="sortBy"
      :sort-order="sortOrder"
      scroll-mode="page"
      :columns="tableColumns"
      :selectable="!reviewContext"
      selection-key="id"
      :show-selection-bar="!reviewContext"
      row-key="id"
      :clickable-rows="Boolean(reviewContext)"
      @page-change="changePage"
      @page-size-change="changePageSize"
      @row-click="onRowClick"
      @sort-change="onSortChange"
    >
      <template #cell="{ row, column }">
        <div v-if="column.key === 'name'" class="member-identity"><span class="member-avatar">{{ avatarText(row) }}</span><span class="member-name">{{ row.display_name }}</span></div>
        <span v-else-if="column.key === 'rating' && row.rating" class="rating-badge" :class="ratingClass(row)">{{ row.rating }}</span>
        <span v-else class="table-text">{{ cellValue(row, column.key) }}</span>
      </template>
      <template #empty>
        <div v-if="loading" class="member-state" role="status">正在加载成员…</div>
        <div v-else-if="error" class="member-state member-state--error" role="alert">{{ error }}</div>
        <div v-else class="member-state">暂无成员</div>
      </template>
      <template #selection-actions>
        <PerformanceButton variant="outline-primary" aria-label="授权他人处理" @click="emit('authorize-selected')">授权他人处理</PerformanceButton>
        <PerformanceButton variant="outline-primary" aria-label="转交他人处理" @click="emit('transfer-selected')">转交他人处理</PerformanceButton>
      </template>
    </PerformanceManagementTable>
    <ProjectMemberColumnDrawer v-model="columnDrawerOpen" :columns="availableColumns" :selected-keys="selectedColumnKeys" @confirm="applyColumns" />
  </section>
</template>

<style scoped>
.member-list-panel { min-width:0; border-radius:8px; background:#fff; box-shadow:rgba(31,35,41,.03) 0 4px 16px 4px,rgba(31,35,41,.02) 0 4px 8px,rgba(31,35,41,.02) 0 2px 4px -4px; padding:0 20px 20px; color:#1f2329; }
.card-sticky-mask { position: sticky; top: 0; z-index: 19; flex: none; height: 20px; margin: 0 -20px; border-radius: 8px 8px 0 0; background: var(--color-bg-card, #fff); }
.member-list-toolbar{display:flex;align-items:center;gap:12px;height:32px;margin-bottom:16px}.member-action-button{display:inline-flex;align-items:center;justify-content:center;flex:0 0 80px;height:32px;padding:4px 11px;border:1px solid #d0d3d6;border-radius:6px;background:#fff;color:#1f2329;cursor:pointer;font:400 14px/22px inherit}.export-icon{display:block;flex:0 0 14px;width:14px;height:14px;margin-right:4px}
.member-identity{display:flex;align-items:center;min-width:0}.member-avatar{display:inline-flex;align-items:center;justify-content:center;flex:0 0 32px;width:32px;height:32px;border-radius:50%;background:#e5eaf5;color:#3b5b92;font-size:13px}.member-name{min-width:0;margin-left:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rating-badge{display:inline-flex;align-items:center;justify-content:center;min-width:44px;height:24px;padding:0 10px;box-sizing:border-box;border-radius:9999px;font-size:14px;line-height:24px}.rating-badge--teal{background:#d5f6f2;color:#024b41}.rating-badge--blue{background:#e1eaff;color:#0c296e}.rating-badge--green{background:#d9f5d6;color:#124b0c}
.table-text{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.member-state{display:grid;min-height:220px;place-items:center;color:#646a73;font-size:14px}.member-state--error{color:#d14343}
</style>
