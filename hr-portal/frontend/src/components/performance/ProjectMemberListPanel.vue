<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { projectManagementApi, performanceWorkbenchApi, type ProjectMember, type PerformanceWorkbenchTaskPerson } from '@/api/performance'
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import PerformanceListToolbar from './PerformanceListToolbar.vue'
import PerformanceColumnVisibilityIcon from './PerformanceColumnVisibilityIcon.vue'
import PerformanceExportIcon from './PerformanceExportIcon.vue'
import ProjectMemberColumnDrawer, { type MemberColumnOption } from './ProjectMemberColumnDrawer.vue'

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
}>()
const keyword = ref('')
const members = ref<MemberRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 50
const loading = ref(false)
const error = ref('')
const sortBy = ref('')
const sortOrder = ref<'asc' | 'desc' | ''>('')

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
  return new Set(configuredRows.flatMap(member => member.visible_profile_fields || []).map(field => profileColumnKeys[field]).filter(Boolean))
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
      const result = await projectManagementApi.members(props.projectId, keyword.value.trim() || undefined, page.value, pageSize, sortBy.value || undefined, sortOrder.value || undefined)
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

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
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

function changeSort(key: string) {
  if (sortBy.value !== key) {
    sortBy.value = key
    sortOrder.value = 'desc'
  } else if (sortOrder.value === 'desc') {
    sortOrder.value = 'asc'
  } else {
    sortBy.value = ''
    sortOrder.value = ''
  }
  page.value = 1
  void loadMembers()
}

function changePage(nextPage: number) {
  if (nextPage < 1 || nextPage > pageCount.value || nextPage === page.value) return
  page.value = nextPage
  void loadMembers()
}

watch(() => [props.projectId, props.reviewContext?.nodeId, props.reviewContext?.state], () => {
  page.value = 1
  void loadMembers()
})

onMounted(() => void loadMembers())
</script>

<template>
  <section class="member-list-panel" aria-label="成员列表">
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
    <div class="member-list-summary"><span>{{ total }}个结果</span><button class="column-visibility-button" type="button" @click="columnDrawerOpen = true"><PerformanceColumnVisibilityIcon /><span>{{ hiddenColumnCount }} 列被隐藏</span></button></div>
    <div class="member-table-scroll">
      <table class="member-table">
        <colgroup><col class="selection-column" /><col v-for="column in visibleColumns" :key="column.key" :class="`${column.key}-column`" /></colgroup>
        <thead><tr><th class="selection-cell"><PerformanceCheckbox :model-value="false" label="全选成员" /></th><th v-for="column in visibleColumns" :key="column.key"><button class="sort-header" type="button" :aria-sort="sortBy === column.key ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'" @click="changeSort(column.key)"><span>{{ column.label }}</span><span class="sort-icons" :class="{ active: sortBy === column.key }" aria-hidden="true"><svg class="sort-up" width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" data-icon="ExpandUpFilled"><path d="M11.228 5.376a1 1 0 0 1 1.559 0l8.305 10.334a1 1 0 0 1-.78 1.626H3.703a1 1 0 0 1-.78-1.626l8.306-10.334Z" fill="currentColor" /></svg><svg class="sort-down" width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" data-icon="ExpandDownFilled"><path d="M11.22 18.46a1 1 0 0 0 1.56 0l8.305-10.334a1 1 0 0 0-.78-1.626H3.696a1 1 0 0 0-.78 1.626L11.22 18.46Z" fill="currentColor" /></svg></span></button></th></tr></thead>
        <tbody v-if="loading || error || !members.length">
          <tr><td class="member-state-cell" :colspan="visibleColumns.length + 1">
            <div v-if="loading" class="member-state" role="status">正在加载成员…</div>
            <div v-else-if="error" class="member-state member-state--error" role="alert">{{ error }}</div>
            <div v-else class="member-state">暂无成员</div>
          </td></tr>
        </tbody>
        <tbody v-else><tr v-for="member in members" :key="member.id" :class="{ 'member-row-clickable': reviewContext }" @click="reviewContext && emit('select-member', member)"><td class="selection-cell"><PerformanceCheckbox :model-value="false" :label="`选择${member.display_name}`" /></td><td v-for="column in visibleColumns" :key="column.key" :class="{ 'name-cell': column.key === 'name', 'completion-cell': column.key === 'completion' }"><div v-if="column.key === 'name'" class="member-identity"><span class="member-avatar">{{ avatarText(member) }}</span><span class="member-name">{{ member.display_name }}</span></div><span v-else-if="column.key === 'rating' && member.rating" class="rating-badge" :class="ratingClass(member)">{{ member.rating }}</span><span v-else class="table-text">{{ cellValue(member, column.key) }}</span></td></tr></tbody>
      </table>
    </div>
    <div class="member-pagination" aria-label="成员列表分页"><span>共 {{ total }} 条</span><button type="button" :disabled="page <= 1" aria-label="上一页" @click="changePage(page - 1)">‹</button><button class="current-page" type="button" aria-current="page">{{ page }}</button><button type="button" :disabled="page >= pageCount" aria-label="下一页" @click="changePage(page + 1)">›</button><span class="page-size">{{ pageSize }} 条/页⌄</span></div>
    <ProjectMemberColumnDrawer v-model="columnDrawerOpen" :columns="availableColumns" :selected-keys="selectedColumnKeys" @confirm="applyColumns" />
  </section>
</template>

<style scoped>
.member-list-panel { min-width:0; overflow:hidden; border-radius:8px; background:#fff; box-shadow:rgba(31,35,41,.03) 0 4px 16px 4px,rgba(31,35,41,.02) 0 4px 8px,rgba(31,35,41,.02) 0 2px 4px -4px; padding:20px; color:#1f2329; }
.member-list-toolbar{display:flex;align-items:center;gap:12px;height:32px;margin-bottom:16px}.member-search{flex:1;min-width:0}.member-action-button{display:inline-flex;align-items:center;justify-content:center;flex:0 0 80px;height:32px;padding:4px 11px;border:1px solid #d0d3d6;border-radius:6px;background:#fff;color:#1f2329;cursor:pointer;font:400 14px/22px inherit}.member-action-icon{width:14px;height:14px;margin-right:4px}.export-icon{display:block;flex:0 0 14px;width:14px;height:14px;margin-right:4px}.member-list-summary{display:flex;align-items:center;justify-content:space-between;height:22px;margin-bottom:12px;font-size:14px;line-height:22px}.column-visibility-button{display:inline-flex;align-items:center;height:22px;padding:2px 4px;border:0;border-radius:6px;background:transparent;color:#1456f0;cursor:pointer;font:inherit}.column-visibility-button svg{flex:0 0 16px;width:16px;height:16px;margin-right:4px}.member-table-scroll{overflow-x:auto;overflow-y:hidden}.member-table{width:100%;min-width:1120px;border-collapse:separate;border-spacing:0;table-layout:fixed;font-size:14px}.member-table col.selection-column{width:40px}.member-table col.name-column{width:224px}.member-table col.rating-column,.member-table col.completion-column{width:144px}.member-table col.sequence-column{width:104px}.member-table col.level-column{width:124px}.member-table col.date-column{width:134px}.member-table col.department-column{width:224px}.member-table th{position:relative;height:47px;padding:12px;border-bottom:1px solid rgba(31,35,41,.15);background:#fff;color:#646a73;font-weight:400;line-height:22px;text-align:left;white-space:nowrap}.member-table th:first-child,.member-table th:nth-child(2){position:sticky;left:0;z-index:2}.member-table th:nth-child(2){left:40px}.member-table td{height:52px;padding:0 12px;border-bottom:1px solid rgba(31,35,41,.08);background:#fff;vertical-align:middle;white-space:nowrap}.member-table td:first-child,.member-table td:nth-child(2){position:sticky;left:0;z-index:1}.member-table td:nth-child(2){left:40px}.member-table tbody tr:hover td{background:#f5f6f7}.member-row-clickable{cursor:pointer}.member-row-clickable:focus-visible td{outline:2px solid #3370ff;outline-offset:-2px}.selection-cell{padding-left:12px!important;padding-right:12px!important}.selection-cell :deep(.performance-checkbox__label){display:none}.member-identity{display:flex;align-items:center;min-width:0}.member-avatar{display:inline-flex;align-items:center;justify-content:center;flex:0 0 32px;width:32px;height:32px;border-radius:50%;background:#e5eaf5;color:#3b5b92;font-size:13px}.member-name{min-width:0;margin-left:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sort-header{display:inline-flex;align-items:center;padding:0;border:0;background:transparent;color:inherit;cursor:pointer;font:inherit}.sort-icons{display:inline-flex;flex-direction:column;width:10px;height:20px;margin-left:8px;color:#646a73}.sort-icons svg{width:10px;height:10px}.sort-icons.active .sort-up{color:v-bind("sortOrder === 'asc' ? '#1456f0' : '#646a73'")}.sort-icons.active .sort-down{color:v-bind("sortOrder === 'desc' ? '#1456f0' : '#646a73'")}.rating-badge{display:inline-flex;align-items:center;justify-content:center;min-width:44px;height:24px;padding:0 10px;box-sizing:border-box;border-radius:9999px;font-size:14px;line-height:24px}.rating-badge--teal{background:#d5f6f2;color:#024b41}.rating-badge--blue{background:#e1eaff;color:#0c296e}.rating-badge--green{background:#d9f5d6;color:#124b0c}.completion-cell{color:#3370ff}.table-text{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.member-pagination{display:flex;align-items:center;justify-content:flex-end;gap:8px;min-height:28px;margin-top:16px;color:#1f2329;font-size:14px}.member-pagination button{display:inline-grid;place-items:center;width:28px;height:28px;padding:0;border:1px solid #d0d3d6;border-radius:6px;background:#fff;color:#1f2329;cursor:pointer;font-size:18px}.member-pagination button:disabled{color:#bbbfc4;cursor:not-allowed}.member-pagination .current-page{border-color:#3370ff;color:#3370ff;font-size:14px}.page-size{min-width:76px;padding:5px 8px;border:1px solid #d0d3d6;border-radius:6px}.member-state{display:grid;min-height:220px;place-items:center;color:#646a73;font-size:14px}.member-state--error{color:#d14343}
.member-table td.member-state-cell { position: static; }
.member-table tbody tr:hover td.member-state-cell { background: #fff; }
</style>
