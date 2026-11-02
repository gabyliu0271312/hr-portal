<template>
  <section class="performance-reminder-panel" :class="{ 'is-preview': mode === 'preview' }" :aria-label="context.sectionTitle">
    <div v-if="mode !== 'preview'" class="performance-reminder-panel__heading">
      <h2>{{ context.sectionTitle }}</h2>
      <p class="performance-reminder-panel__description" :class="{ 'is-statistics': description.includes('　|　') }"><span v-for="(part, index) in description.split('　|　')" :key="index">{{ part }}</span></p>
    </div>
    <div class="performance-reminder-card">
      <div class="card-sticky-mask" aria-hidden="true"></div>
      <div class="performance-reminder-card__toolbar">
        <PerformanceListToolbar
          v-model:keyword="keyword"
          search-placeholder="搜索成员"
          search-aria-label="搜索成员"
          :gap="12"
          filter-disabled
          :search-width="mode === 'preview' ? '224px' : '100%'"
          :search-fill="mode !== 'preview'"
          @search="reload"
          @clear="reload"
          @filter="handleFilter"
        >
          <template #actions>
            <PerformanceExportButton v-if="mode === 'preview' || mode === 'cycle-remind'" :load-rows="exportPreviewRows" :filename="context.title" :disabled="loading || Boolean(error) || !total || !capabilities.canExport" @success="notice = '导出成功'" @error="notice = '导出失败，请稍后重试'" />
            <button v-else class="export-button" type="button" aria-label="导出" :disabled="!capabilities.canExport" @click="handleExport"><PerformanceExportIcon /><span>导出</span></button>
          </template>
        </PerformanceListToolbar>
      </div>
      <PerformanceTableSummary :total="total" :hidden-column-count="hiddenColumnCount" @columns="columnDrawerOpen = true" />
      <PerformanceManagementTable
        v-model:selected-keys="selectedKeys"
        :rows="sortedRows"
        :loading="loading"
        loading-text="正在加载成员…"
        :empty-text="error || (mode === 'preview' ? '暂无符合条件的员工' : '暂无未完成的被评估人')"
        table-aria-label="未完成的被评估人"
        pagination-aria-label="未完成人员分页"
        :page="page"
        :page-size="pageSize"
        :total="total"
        scroll-mode="page"
        :columns="tableColumns"
        :sort-key="sortKey"
        :sort-order="sortOrder"
        :selectable="mode !== 'preview'"
        :show-selection-bar="mode !== 'preview'"
        :selection-bar-target="selectionBarTarget"
        :is-row-selectable="row => !loading && !actionLoading && row.selectable !== false"
        selection-key="task_id"
        row-key="task_id"
        @page-change="changePage"
        @page-size-change="changePageSize"
        @sort-change="changeSort"
      >
        <template #cell="{ row, column }">
          <PerformanceMemberIdentity v-if="column.key === 'display_name'" :display-name="row.display_name" />
          <span v-else-if="column.key === 'reminder_target'" class="reminder-target"><PerformanceMemberIdentity :display-name="String(reminderCellValue(row, column.key))" /></span>
          <PerformanceMemberIdentity v-else-if="(column.key === 'direct_supervisor' || column.key === 'hrbp') && row[column.key]" :display-name="row[column.key]" />
          <PerformanceTaskStatus v-else-if="column.key === 'status'" :status="row.status" :due-at="row.due_at" />
          <span v-else-if="column.key === 'completion'" class="cell-text completion-text">{{ reminderCellValue(row, column.key) }}</span>
          <span v-else class="cell-text">{{ reminderCellValue(row, column.key) }}</span>
        </template>
        <template #empty="{ loading: tableLoading }">
          <div v-if="tableLoading" class="table-state" role="status">正在加载成员…</div>
          <div v-else-if="error" class="table-state table-state--error" role="alert">{{ error }} <button type="button" @click="initialize">重新加载</button></div>
          <div v-else class="table-state">{{ mode === 'preview' ? '暂无符合条件的员工' : '暂无未完成的被评估人' }}</div>
        </template>
        <template #selection-actions>
          <PerformanceButton v-if="mode === 'open-result'" variant="primary" :disabled="!selectedKeys.length || actionLoading" @click="handleAction('open-result')">开通所选成员</PerformanceButton>
          <PerformanceButton v-else variant="primary" :disabled="!selectedKeys.length || !capabilities.canRemind || actionLoading" @click="handleAction('remind')">催办</PerformanceButton>
          <PerformanceButton v-if="capabilities.canAuthorize" :disabled="actionLoading" @click="handleAction('authorize')">授权他人处理</PerformanceButton>
          <PerformanceButton v-if="capabilities.canTransfer" :disabled="actionLoading" @click="handleAction('transfer')">转交他人处理</PerformanceButton>
        </template>
      </PerformanceManagementTable>
      <div v-if="notice" class="performance-reminder-notice" role="status">{{ notice }}</div>
    </div>
    <PerformanceColumnVisibilityDrawer v-model="columnDrawerOpen" :columns="columns" :selected-keys="selectedColumnKeys" @confirm="applyColumns" />
    <PerformanceTaskDelegationDialog v-model="delegationOpen" :action="delegationAction" :tasks="delegationTasks" @completed="delegationCompleted" />
    <PerformanceConfirmDialog
      v-if="mode === 'open-result'"
      v-model="confirmOpen"
      message="确定开通所选成员的绩效结果嘛？"
      :description="`有${selectedKeys.length}名被评估人会立即收到结果开通的通知，并且可以在系统中查看自己的绩效结果。`"
      cancel-text="取消"
      confirm-text="确定"
      confirm-variant="primary"
      :loading="actionLoading"
      @confirm="confirmResults"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { performanceWorkbenchApi, projectManagementApi } from '@/api/performance'
import PerformanceColumnVisibilityDrawer from './PerformanceColumnVisibilityDrawer.vue'
import PerformanceTaskDelegationDialog from './PerformanceTaskDelegationDialog.vue'
import PerformanceConfirmDialog from './PerformanceConfirmDialog.vue'
import PerformanceExportIcon from './PerformanceExportIcon.vue'
import PerformanceExportButton from './PerformanceExportButton.vue'
import PerformanceListToolbar from './PerformanceListToolbar.vue'
import PerformanceTableSummary from './PerformanceTableSummary.vue'
import PerformanceManagementTable from './PerformanceManagementTable.vue'
import PerformanceMemberIdentity from './PerformanceMemberIdentity.vue'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceTaskStatus from './PerformanceTaskStatus.vue'
import { sortPerformanceRows, type PerformanceSortOrder } from './performanceTableSort'
import { defaultReminderColumns, reminderCellValue, reminderColumnsForVisibility, type ReminderCapabilities, type ReminderColumn, type ReminderContext, type ReminderListResult, type ReminderProvider } from './performanceReminder'
import { REMINDER_DELEGATION_HIDDEN_NODE_KEYS } from './performanceReminderDelegation'

const props = withDefaults(defineProps<{ context: ReminderContext; provider?: ReminderProvider; description?: string; mode?: 'remind' | 'cycle-remind' | 'open-result' | 'preview'; selectAllAvailable?: boolean; selectionBarTarget?: string }>(), { provider: undefined, description: '仅展示当前尚未完成上级评估的被评估人', mode: 'remind', selectAllAvailable: undefined })
const emit = defineEmits<{ filter: []; export: []; loaded: [total: number]; action: [action: 'authorize' | 'transfer'] }>()
const keyword = ref('')
const loadedKeyword = ref('')
const columnsInitialized = ref(false)
const rows = ref<ReminderListResult['items']>([])
const columns = ref<ReminderColumn[]>(defaultReminderColumns)
const selectedColumnKeys = ref(defaultReminderColumns.filter(column => column.visibleByDefault !== false).map(column => column.key))
const capabilities = ref<ReminderCapabilities>({ canRemind: true, canAuthorize: false, canTransfer: false, canExport: false })
const selectedKeys = ref<string[]>([])
const taskMap = ref(new Map<string, { task_id: number; project_id: number; can_authorize?: boolean }>())
const delegationOpen = ref(false)
const delegationAction = ref<'AUTHORIZE' | 'TRANSFER'>('AUTHORIZE')
const delegationTasks = computed(() => selectedKeys.value.map(key => taskMap.value.get(key)).filter((task): task is { task_id: number; project_id: number; can_authorize?: boolean } => Boolean(task && task.can_authorize)))
function delegationCompleted(count: number, notificationStatus?: string) { selectedKeys.value = []; void load(); notice.value = notificationStatus === 'preview_only' ? `已处理 ${count} 个任务；测试模式：已记录 ${count} 条，未发送飞书通知` : `已处理 ${count} 个任务` }
const page = ref(1)
const pageSize = ref(50)
const sortKey = ref('')
const sortOrder = ref<PerformanceSortOrder>('')
const total = ref(0)
const loading = ref(false)
const actionLoading = ref(false)
const error = ref('')
const notice = ref('')
const columnDrawerOpen = ref(false)
const confirmOpen = ref(false)
let requestSequence = 0

const visibleColumns = computed(() => selectedColumnKeys.value.map(key => columns.value.find(column => column.key === key)).filter((column): column is ReminderColumn => Boolean(column)))
const tableColumns = computed(() => visibleColumns.value.map(column => ({ key: column.key, label: column.label, width: column.minWidth || 144, fixed: column.key === 'display_name', sortable: column.key !== 'reminder_target' && column.key !== 'hrbp' })))
const sortedRows = computed(() => sortPerformanceRows(rows.value, sortKey.value, sortOrder.value, (row, key) => reminderCellValue(row, key)))
const hiddenColumnCount = computed(() => Math.max(0, columns.value.length - selectedColumnKeys.value.length))
const selectAllEligible = computed(() => props.selectAllAvailable ?? props.mode === 'cycle-remind')

async function defaultProvider(query: Parameters<ReminderProvider>[0]): Promise<ReminderListResult> {
  if (props.mode === 'cycle-remind') {
    const result = await projectManagementApi.reminderPeople(query.context.cycleId, query.context.nodeId, query.keyword.trim(), query.page, query.pageSize, query.context.departmentPath)
    return {
      items: result.items,
      total: result.total,
      columns: reminderColumnsForVisibility(result.items),
      capabilities: { canRemind: true, canAuthorize: result.items.some(item => item.can_authorize), canTransfer: query.context.nodeId !== 'calibration' && result.items.some(item => item.can_authorize), canExport: true },
    }
  }
  if (props.mode === 'open-result') {
    const result = await projectManagementApi.openingPeople(props.context.cycleId, query.keyword.trim(), query.page, query.pageSize)
    return {
      items: result.items.map(item => ({
        task_id: item.employee_no,
        employee_no: item.employee_no, display_name: item.display_name, project_name: item.project_name,
        status: item.can_open ? 'pending' : 'unavailable', selectable: item.can_open, unavailable_reason: item.unavailable_reason,
        due_at: null, job_family: null, job_category: null, standard_position: null, job_sequence: null, position_level: null,
        hire_date: null, department: null, employee_type: null, employment_status: null,
      })),
      total: result.total,
      columns: [
        { key: 'display_name', label: '被评估人', locked: true, visibleByDefault: true },
        { key: 'project_name', label: '所属项目', visibleByDefault: true },
        { key: 'unavailable_reason', label: '开通状态', visibleByDefault: true },
      ],
      capabilities: { canRemind: false, canAuthorize: false, canTransfer: false, canExport: false },
    }
  }
  const result = await performanceWorkbenchApi.taskPeople(query.context.projectId, query.context.nodeId, 'pending', query.keyword.trim() || undefined)
  const start = (query.page - 1) * query.pageSize
  return {
    items: result.slice(start, start + query.pageSize),
    total: result.length,
    columns: reminderColumnsForVisibility(result),
    capabilities: { canRemind: true, canAuthorize: false, canTransfer: false, canExport: false },
  }
}

async function load() {
  const sequence = ++requestSequence
  loading.value = true
  error.value = ''
  const requestedKeyword = keyword.value.trim()
  try {
    const result = await (props.provider || defaultProvider)({ context: props.context, keyword: requestedKeyword, page: page.value, pageSize: pageSize.value })
    if (sequence !== requestSequence) return
    loadedKeyword.value = requestedKeyword
    rows.value = result.items
    for (const row of result.items) taskMap.value.set(String(row.task_id), { task_id: Number(row.task_id), project_id: row.project_id || props.context.projectId, can_authorize: row.can_authorize })
    total.value = result.total
    emit('loaded', result.total)
    columns.value = result.columns.length ? result.columns : defaultReminderColumns
    capabilities.value = result.capabilities
    if (props.mode === 'cycle-remind' && REMINDER_DELEGATION_HIDDEN_NODE_KEYS.has(props.context.nodeId)) {
      capabilities.value = { ...capabilities.value, canAuthorize: false, canTransfer: false }
    }
    const retainedKeys = selectedColumnKeys.value.filter(key => columns.value.some(column => column.key === key))
    const configuredDefaults = columns.value.filter(column => column.visibleByDefault !== false).map(column => column.key)
    selectedColumnKeys.value = ((!columnsInitialized.value && props.mode === 'preview') || !retainedKeys.length) ? configuredDefaults : retainedKeys
    columnsInitialized.value = true
    const availableKeys = new Set(rows.value.filter(row => row.selectable !== false).map(row => String(row.task_id)))
    if (!selectAllEligible.value) selectedKeys.value = selectedKeys.value.filter(key => availableKeys.has(key))
  } catch {
    if (sequence === requestSequence) error.value = props.mode === 'preview' ? '人员加载失败，请稍后重试' : '未完成人员加载失败，请稍后重试'
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

async function initialize() {
  const sequence = ++requestSequence
  loading.value = true
  error.value = ''
  notice.value = ''
  selectedKeys.value = []
  taskMap.value = new Map()
  const query = { context: { ...props.context }, keyword: keyword.value.trim(), page: page.value, pageSize: pageSize.value }
  try {
    const provider = props.provider || defaultProvider
    const result = await provider(query)
    if (sequence !== requestSequence) return
    rows.value = result.items
    for (const row of result.items) taskMap.value.set(String(row.task_id), { task_id: Number(row.task_id), project_id: row.project_id || props.context.projectId, can_authorize: row.can_authorize })
    total.value = result.total
    columns.value = result.columns
    selectedColumnKeys.value = columns.value.filter(column => column.visibleByDefault !== false).map(column => column.key)
    capabilities.value = result.capabilities
    if (props.mode === 'cycle-remind' && REMINDER_DELEGATION_HIDDEN_NODE_KEYS.has(props.context.nodeId)) {
      capabilities.value = { ...capabilities.value, canAuthorize: false, canTransfer: false }
    }
    emit('loaded', result.total)
    if (selectAllEligible.value) {
      const selection: string[] = []
      for (let nextPage = 1; (nextPage - 1) * 100 < result.total; nextPage++) {
        const next = await provider({ ...query, page: nextPage, pageSize: 100 })
        if (sequence !== requestSequence) return
        if (next.total !== result.total || !next.items.length) throw new Error('人员名单已变化，请刷新后重试')
        for (const row of next.items) taskMap.value.set(String(row.task_id), { task_id: Number(row.task_id), project_id: row.project_id || props.context.projectId, can_authorize: row.can_authorize })
        selection.push(...next.items.filter(row => row.selectable !== false).map(row => String(row.task_id)))
      }
      selectedKeys.value = [...new Set(selection)]
    }
    loadedKeyword.value = query.keyword
  } catch {
    if (sequence === requestSequence) { selectedKeys.value = []; error.value = '人员加载失败，请重新加载'; rows.value = [] }
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

function reload() {
  page.value = 1
  void initialize()
}

function changePage(nextPage: number) {
  if (actionLoading.value) return
  page.value = nextPage
  if (!selectAllEligible.value) selectedKeys.value = []
  void load()
}

function changePageSize(size: number) { if (actionLoading.value) return; pageSize.value = size; page.value = 1; void load() }
function changeSort(value: { key: string; order: PerformanceSortOrder }) { sortKey.value = value.key; sortOrder.value = value.order }

function applyColumns(keys: string[]) {
  selectedColumnKeys.value = keys
}

function handleFilter() {
  notice.value = '筛选条件暂未配置'
  emit('filter')
}

async function exportPreviewRows() {
  const provider = props.provider || defaultProvider
  const query = { context: { ...props.context }, keyword: loadedKeyword.value, page: 1, pageSize: 100 }
  const exportColumns = [...visibleColumns.value]
  const exported = [exportColumns.map(column => column.label)]
  let count = 0
  let expected: number | undefined
  do {
    const result = await provider({ ...query })
    if (expected === undefined) expected = result.total
    if (result.total !== expected || (count < expected && !result.items.length)) throw new Error('人员名单已变化，请刷新后重试')
    exported.push(...result.items.map(person => exportColumns.map(column => String(reminderCellValue(person, column.key)))))
    count += result.items.length
    query.page += 1
  } while (count < expected)
  return exported
}

function handleExport() {
  notice.value = '导出能力暂未接入'
  emit('export')
}

async function handleAction(action: 'remind' | 'authorize' | 'transfer' | 'open-result') {
  if (action === 'open-result') {
    if (selectedKeys.value.length) confirmOpen.value = true
    return
  }
  if (action !== 'remind') {
    delegationAction.value = action === 'transfer' ? 'TRANSFER' : 'AUTHORIZE'
    delegationOpen.value = true
    return
  }
  if (!selectedKeys.value.length || actionLoading.value || loading.value || error.value) return
  actionLoading.value = true
  notice.value = ''
  try {
    const result = props.mode === 'cycle-remind'
      ? await projectManagementApi.remindCycleTasks(props.context.cycleId, props.context.nodeId, selectedKeys.value.map(Number), props.context.departmentPath)
      : await projectManagementApi.remindTasks(props.context.projectId, props.context.nodeId, selectedKeys.value.map(Number))
    selectedKeys.value = (result.failed_task_ids || []).map(String)
    await load()
    const previewCount = result.preview_task_ids?.length || 0
    const statusText = result.delivery_status === 'preview_only' ? `测试模式：已记录 ${previewCount} 条，未发送飞书通知` : result.delivery_status === 'success' ? '催办已发送' : result.delivery_status === 'partial_success' ? '催办部分发送成功' : '催办发送失败'
    notice.value = `${statusText}${result.delivery_status === 'preview_only' ? '' : `：${result.accepted_task_ids.length} 条，跳过 ${result.skipped_task_ids.length} 条`}${result.failed_task_ids?.length ? `，失败 ${result.failed_task_ids.length} 条` : ''}${result.errors?.some(item => item.error.includes('未确认')) ? '；发送结果未确认，请核对通知日志后再重试' : ''}`
  } catch {
    notice.value = '催办请求提交失败，请稍后重试'
  } finally {
    actionLoading.value = false
  }
}

async function confirmResults() {
  if (!selectedKeys.value.length || actionLoading.value || loading.value || error.value) return
  const selected = rows.value.filter(row => row.selectable !== false && selectedKeys.value.includes(String(row.task_id))).map(row => row.employee_no)
  if (!selected.length) { confirmOpen.value = false; return }
  actionLoading.value = true
  try {
    const result = await projectManagementApi.openResults(props.context.cycleId, selected)
    confirmOpen.value = false
    selectedKeys.value = []
    await load()
    notice.value = `实际开通 ${result.accepted_employee_nos.length} 人，跳过 ${result.skipped_employee_nos.length} 人`
  } catch {
    notice.value = '结果开通失败，请稍后重试'
  } finally {
    actionLoading.value = false
  }
}

watch(() => [props.context.projectId, props.context.cycleId, props.context.nodeId, props.context.reviewType], () => {
  columnsInitialized.value = false
  page.value = 1
  selectedKeys.value = []
  void initialize()
})
onMounted(() => void initialize())
</script>

<style scoped>
.performance-reminder-panel :deep(.performance-sort-header) { height:22px; font-weight:400; }
.performance-reminder-panel :deep(.member-avatar) { width:24px; height:24px; flex-basis:24px; font-size:12px; }
.performance-reminder-panel :deep(.member-name) { margin-left:8px; }
.reminder-target :deep(.member-avatar) { width:20px; height:20px; flex-basis:20px; }
.performance-reminder-panel__description.is-statistics { display:flex; align-items:center; flex-wrap:wrap; }
.is-statistics > span + span::before { content:''; display:inline-block; height:12px; margin:0 12px; border-left:1px solid #dee0e3; vertical-align:middle; }

.performance-reminder-panel :deep(.selection-bar) { left:0!important; right:0!important; bottom:0; width:100vw; z-index:30; height:60px; padding:0 20px; }
.performance-reminder-panel :deep(.selection-bar-spacer) { height:60px; }
.performance-reminder-panel :deep(thead .feishu-cell) { font-weight:400; }

.cell-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.completion-text { color: var(--color-primary); }
.reminder-target { display:inline-flex; max-width:100%; padding:2px 8px; border-radius:16px; background:#eff0f1; }
.table-state { display:grid; min-height:220px; place-content:center; gap:8px; color:#646a73; }
.table-state--error { color:#d14343; }

.performance-reminder-panel.is-preview .performance-reminder-card__toolbar :deep(.search-input) { flex: 0 1 224px; max-width: 224px; }
.performance-reminder-panel.is-preview .performance-reminder-card__toolbar :deep(.list-toolbar) { flex-wrap: wrap; }
.performance-reminder-panel{display:flex;min-width:0;min-height:100%;flex-direction:column}.performance-reminder-panel__heading{margin:0 0 16px}.performance-reminder-panel__heading h2{margin:0;color:#1f2329;font-size:18px;font-weight:600;line-height:26px}.performance-reminder-panel__description{margin:0;color:#646a73;font-size:14px;line-height:22px}.performance-reminder-card{position:relative;display:flex;min-width:0;min-height:0;flex:1 0 auto;flex-direction:column;padding:0 24px 24px;box-sizing:border-box;border:1px solid transparent;border-radius:8px;background:#fff;box-shadow:rgba(31,35,41,.03) 0 4px 16px 4px,rgba(31,35,41,.02) 0 4px 8px,rgba(31,35,41,.02) 0 2px 4px -4px;--performance-table-container-padding:var(--performance-review-surface-inset)}.card-sticky-mask{position:sticky;top:calc(-1 * var(--performance-table-container-padding, 0px));z-index:19;flex:none;height:20px;margin:0 -24px;border-radius:8px 8px 0 0;background:var(--color-bg-card, #fff)}.performance-reminder-card__toolbar{margin:0 -24px;padding:0 24px;background:#fff}.performance-reminder-card__toolbar :deep(.list-toolbar){margin:0 -24px;padding:0 24px;background:#fff}
.performance-reminder-card__toolbar + .performance-table-summary{margin-top:16px;margin-bottom:6.666667px}.performance-reminder-card__toolbar :deep(.search-input){flex:1;min-width:0}.export-button{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-width:80px;height:32px;margin-left:12px;padding:4px 11px;border:1px solid #d0d3d6;border-radius:6px;background:#fff;color:#1f2329;cursor:pointer;font:400 14px/22px inherit}.export-button:hover,.export-button:focus-visible{outline:0;background:#f2f3f5}.export-button:disabled{color:#bbbfc4;cursor:not-allowed}.export-button svg{display:block;width:14px;height:14px}.performance-reminder-spacer{height:30px;flex:0 0 30px}.performance-reminder-notice{margin-top:12px;color:var(--color-primary);font-size:14px;line-height:22px}
</style>
