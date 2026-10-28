<template>
  <section class="performance-reminder-panel" :class="{ 'is-preview': mode === 'preview' }" :aria-label="context.sectionTitle">
    <div v-if="mode !== 'preview'" class="performance-reminder-panel__heading">
      <h2>{{ context.sectionTitle }}</h2>
      <p class="performance-reminder-panel__description">{{ description }}</p>
    </div>
    <div class="performance-reminder-card">
      <div class="performance-reminder-card__sticky">
        <PerformanceListToolbar
          v-model:keyword="keyword"
          search-placeholder="搜索成员"
          search-aria-label="搜索成员"
          :search-width="mode === 'preview' ? '224px' : '100%'"
          :search-fill="mode !== 'preview'"
          @search="reload"
          @clear="reload"
          @filter="handleFilter"
        >
          <template #actions>
            <PerformanceExportButton v-if="mode === 'preview'" :load-rows="exportPreviewRows" :filename="context.title" :disabled="loading || Boolean(error) || !total || !capabilities.canExport" @success="notice = '导出成功'" @error="notice = '导出失败，请稍后重试'" />
            <button v-else class="export-button" type="button" aria-label="导出" :disabled="!capabilities.canExport" @click="handleExport"><PerformanceExportIcon /><span>导出</span></button>
          </template>
        </PerformanceListToolbar>
      </div>
      <PerformanceTableSummary :total="total" :hidden-column-count="hiddenColumnCount" @columns="columnDrawerOpen = true" />
      <PerformanceTaskTable
        v-model:selected-keys="selectedKeys"
        :rows="rows"
        :columns="visibleColumns"
        :loading="loading"
        :error="error"
        :total="total"
        :page="page"
        :page-size="pageSize"
        :selectable="mode !== 'preview'"
        :empty-text="mode === 'preview' ? '暂无符合条件的员工' : '暂无未完成的被评估人'"
        @retry="load"
        @page-change="changePage"
      />
      <div class="performance-reminder-spacer" aria-hidden="true"></div>
      <div v-if="notice" class="performance-reminder-notice" role="status">{{ notice }}</div>
    </div>
    <PerformanceColumnVisibilityDrawer v-model="columnDrawerOpen" :columns="columns" :selected-keys="selectedColumnKeys" @confirm="applyColumns" />
    <PerformanceSelectionActionBar v-if="mode !== 'preview'" :selected-count="selectedKeys.length" :capabilities="capabilities" :action-mode="mode" :loading="actionLoading" @action="handleAction" @clear="selectedKeys = []" />
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
import PerformanceConfirmDialog from './PerformanceConfirmDialog.vue'
import PerformanceExportIcon from './PerformanceExportIcon.vue'
import PerformanceExportButton from './PerformanceExportButton.vue'
import PerformanceListToolbar from './PerformanceListToolbar.vue'
import PerformanceSelectionActionBar from './PerformanceSelectionActionBar.vue'
import PerformanceTableSummary from './PerformanceTableSummary.vue'
import PerformanceTaskTable from './PerformanceTaskTable.vue'
import { defaultReminderColumns, reminderCellValue, reminderColumnsForVisibility, type ReminderCapabilities, type ReminderColumn, type ReminderContext, type ReminderListResult, type ReminderProvider } from './performanceReminder'

const props = withDefaults(defineProps<{ context: ReminderContext; provider?: ReminderProvider; description?: string; mode?: 'remind' | 'open-result' | 'preview' }>(), { provider: undefined, description: '仅展示当前尚未完成上级评估的被评估人', mode: 'remind' })
const emit = defineEmits<{ filter: []; export: []; loaded: [total: number]; action: [action: 'authorize' | 'transfer'] }>()
const keyword = ref('')
const loadedKeyword = ref('')
const columnsInitialized = ref(false)
const rows = ref<ReminderListResult['items']>([])
const columns = ref<ReminderColumn[]>(defaultReminderColumns)
const selectedColumnKeys = ref(defaultReminderColumns.filter(column => column.visibleByDefault !== false).map(column => column.key))
const capabilities = ref<ReminderCapabilities>({ canRemind: true, canAuthorize: false, canTransfer: false, canExport: false })
const selectedKeys = ref<string[]>([])
const page = ref(1)
const pageSize = ref(50)
const total = ref(0)
const loading = ref(false)
const actionLoading = ref(false)
const error = ref('')
const notice = ref('')
const columnDrawerOpen = ref(false)
const confirmOpen = ref(false)
let requestSequence = 0

const visibleColumns = computed(() => selectedColumnKeys.value.map(key => columns.value.find(column => column.key === key)).filter((column): column is ReminderColumn => Boolean(column)))
const hiddenColumnCount = computed(() => Math.max(0, columns.value.length - selectedColumnKeys.value.length))

async function defaultProvider(query: Parameters<ReminderProvider>[0]): Promise<ReminderListResult> {
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
  notice.value = ''
  const requestedKeyword = keyword.value.trim()
  try {
    const result = await (props.provider || defaultProvider)({ context: props.context, keyword: requestedKeyword, page: page.value, pageSize: pageSize.value })
    if (sequence !== requestSequence) return
    loadedKeyword.value = requestedKeyword
    rows.value = result.items
    total.value = result.total
    emit('loaded', result.total)
    columns.value = result.columns.length ? result.columns : defaultReminderColumns
    capabilities.value = result.capabilities
    const retainedKeys = selectedColumnKeys.value.filter(key => columns.value.some(column => column.key === key))
    const configuredDefaults = columns.value.filter(column => column.visibleByDefault !== false).map(column => column.key)
    selectedColumnKeys.value = ((!columnsInitialized.value && props.mode === 'preview') || !retainedKeys.length) ? configuredDefaults : retainedKeys
    columnsInitialized.value = true
    const availableKeys = new Set(rows.value.filter(row => row.selectable !== false).map(row => String(row.task_id)))
    selectedKeys.value = selectedKeys.value.filter(key => availableKeys.has(key))
  } catch {
    if (sequence === requestSequence) error.value = props.mode === 'preview' ? '人员加载失败，请稍后重试' : '未完成人员加载失败，请稍后重试'
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

function reload() {
  page.value = 1
  selectedKeys.value = []
  void load()
}

function changePage(nextPage: number) {
  page.value = nextPage
  selectedKeys.value = []
  void load()
}

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
    emit('action', action)
    return
  }
  if (!selectedKeys.value.length || actionLoading.value) return
  actionLoading.value = true
  notice.value = ''
  try {
    const result = await projectManagementApi.remindTasks(props.context.projectId, props.context.nodeId, selectedKeys.value.map(Number))
    selectedKeys.value = []
    notice.value = `已记录 ${result.accepted_task_ids.length} 条催办请求`
    await load()
  } catch {
    notice.value = '催办请求提交失败，请稍后重试'
  } finally {
    actionLoading.value = false
  }
}

async function confirmResults() {
  if (!selectedKeys.value.length || actionLoading.value) return
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

watch(() => [props.context.projectId, props.context.nodeId, props.context.reviewType], () => {
  columnsInitialized.value = false
  page.value = 1
  selectedKeys.value = []
  void load()
})
onMounted(() => void load())
</script>

<style scoped>
.performance-reminder-panel.is-preview .performance-reminder-card__sticky :deep(.search-input) { flex: 0 1 224px; max-width: 224px; }
.performance-reminder-panel.is-preview .performance-reminder-card__sticky :deep(.list-toolbar) { flex-wrap: wrap; }
.performance-reminder-panel{display:flex;min-width:0;min-height:100%;flex-direction:column}.performance-reminder-panel__heading{margin:0 0 16px}.performance-reminder-panel__heading h2{margin:0;color:#1f2329;font-size:18px;font-weight:600;line-height:26px}.performance-reminder-panel__description{margin:4px 0 0;color:#646a73;font-size:14px;line-height:22px}.performance-reminder-card{position:relative;display:flex;min-width:0;min-height:0;flex:1;flex-direction:column;padding:0 24px 24px;box-sizing:border-box;border:1px solid transparent;border-radius:8px;background:#fff;box-shadow:rgba(31,35,41,.03) 0 4px 16px 4px,rgba(31,35,41,.02) 0 4px 8px,rgba(31,35,41,.02) 0 2px 4px -4px}.performance-reminder-card__sticky{position:sticky;top:0;z-index:19;margin:0 -20px;padding:20px 20px 0;background:#fff;border-radius:8px}.performance-reminder-card__sticky :deep(.list-toolbar){margin-bottom:16px}.performance-reminder-card__sticky :deep(.search-input){flex:1;min-width:0}.export-button{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-width:80px;height:32px;margin-left:12px;padding:4px 11px;border:1px solid #d0d3d6;border-radius:6px;background:#fff;color:#1f2329;cursor:pointer;font:400 14px/22px inherit}.export-button:hover,.export-button:focus-visible{outline:0;background:#f2f3f5}.export-button:disabled{color:#bbbfc4;cursor:not-allowed}.export-button svg{display:block;width:14px;height:14px}.performance-reminder-spacer{height:30px;flex:0 0 30px}.performance-reminder-notice{margin-top:12px;color:#1456f0;font-size:14px;line-height:22px}
</style>
