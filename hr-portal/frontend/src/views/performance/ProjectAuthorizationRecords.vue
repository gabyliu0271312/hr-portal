<template>
  <div ref="root" class="authorization-records">
    <UiPageHeader title="授权及转交记录" @back="goBack" />
    <PerformanceLineTabs v-model="activeTab" :tabs="tabs" flush fill class="record-tabs">
      <section class="records-surface">
        <div class="records-toolbar">
          <span>{{ rows.length }} 个记录</span>
          <PerformanceFilterButton ref="filterButton" :active="filterCount > 0" :count="filterCount" @click="toggleFilter" />
        </div>
        <PerformanceManagementTable
          :rows="pageRows"
          :columns="columns"
          :loading="loading"
          loading-text="正在加载记录…"
          :empty-text="error || '暂无记录'"
          table-aria-label="授权及转交记录"
          pagination-aria-label="授权及转交记录分页"
          :page="page"
          :page-size="pageSize"
          :total="rows.length"
          :highlight-row-key="highlightKey"
          scroll-mode="inner"
          fit-available-height
          row-key="id"
          :show-pagination="true"
          @page-change="page = $event"
          @page-size-change="changePageSize"
        >
          <template #cell="{ row, column }">
            <span v-if="column.key === 'status'"><span class="status-dot" />{{ row.status }}</span>
            <span v-else-if="column.key === 'stages'"><span v-for="stage in row.stages" :key="stage" class="stage-tag">{{ stage }}</span></span>
            <span v-else-if="column.key === 'reviewees'">{{ row.reviewees[0] || '--' }}<span v-if="row.reviewees.length > 1" class="more-count">+{{ row.reviewees.length - 1 }}</span></span>
            <button v-else-if="column.key === 'action' && row.can_revoke" class="text-action" type="button" :disabled="loading" @click="revoke(row)">撤销授权</button>
            <span v-else-if="column.key === 'action'">--</span>
            <span v-else-if="column.key === 'submitted_at'">{{ formatDate(row.submitted_at) }}</span>
            <span v-else>{{ row[column.key] || '--' }}</span>
          </template>
        </PerformanceManagementTable>
        <p v-if="notice" class="notice" role="status">{{ notice }}</p>
      </section>
    </PerformanceLineTabs>
    <PerformanceFilterPopover :visible="filterOpen" :anchor="filterAnchor" :aria-label="`${activeTab === 'transfer' ? '转交记录' : '授权记录'}筛选`" @close="cancelFilter">
      <PerformanceFormItem compact label="发起人">
        <PerformancePersonFilterSelect v-model="draftFilters.from" :cycle-id="cycleId" aria-label="发起人" />
      </PerformanceFormItem>
      <PerformanceFormItem compact :label="recipientFilterLabel">
        <PerformancePersonFilterSelect v-model="draftFilters.to" :cycle-id="cycleId" :aria-label="recipientFilterLabel" />
      </PerformanceFormItem>
      <PerformanceFormItem compact label="被评估人">
        <PerformancePersonFilterSelect v-model="draftFilters.reviewee" :cycle-id="cycleId" aria-label="被评估人" />
      </PerformanceFormItem>
      <PerformanceFormItem compact label="状态">
        <PerformanceSearchSelect :model-value="draftFilters.status" :options="statusOptions" selection-style="plain" placeholder="请选择" aria-label="状态" @update:model-value="draftFilters.status = $event as string | null" />
      </PerformanceFormItem>
      <template #footer>
        <PerformanceFilterActions @confirm="confirmFilter" @cancel="cancelFilter" @clear="clearFilter" />
      </template>
    </PerformanceFilterPopover>
    <PerformanceConfirmDialog v-model="confirmOpen" :message="`确认撤销对${revokeTarget?.authorized_person || '该人员'}的任务授权？`" description="撤销后，被授权人将失去该任务的处理资格；已保存和提交内容保留。" confirm-text="撤销授权" confirm-variant="primary" :loading="loading" @confirm="confirmRevoke" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { projectManagementApi, type AuthorizationRecordFilters, type ProjectAuthorizationRecord } from '@/api/performance'
import UiPageHeader from '@/components/ui/UiPageHeader.vue'
import PerformanceLineTabs from '@/components/performance/PerformanceLineTabs.vue'
import PerformanceManagementTable from '@/components/performance/PerformanceManagementTable.vue'
import PerformanceConfirmDialog from '@/components/performance/PerformanceConfirmDialog.vue'
import PerformanceFilterButton from '@/components/performance/PerformanceFilterButton.vue'
import PerformanceFilterPopover from '@/components/performance/PerformanceFilterPopover.vue'
import PerformanceFilterActions from '@/components/performance/PerformanceFilterActions.vue'
import PerformanceFormItem from '@/components/performance/PerformanceFormItem.vue'
import PerformancePersonFilterSelect, { type PerformancePersonFilterOption } from '@/components/performance/PerformancePersonFilterSelect.vue'
import PerformanceSearchSelect from '@/components/performance/PerformanceSearchSelect.vue'

interface AuthorizationFilterDraft {
  from: PerformancePersonFilterOption[]
  to: PerformancePersonFilterOption[]
  reviewee: PerformancePersonFilterOption[]
  status: string | null
}

interface AuthorizationRecordColumn {
  key: string
  label: string
  width: number
  fixed?: 'left' | 'right'
}

const route = useRoute()
const router = useRouter()
const root = ref<HTMLElement | null>(null)
const activeTab = ref('authorization')
const tabs = [{ key: 'authorization', label: '授权记录' }, { key: 'transfer', label: '转交记录' }]
const data = ref<{ authorization_records: ProjectAuthorizationRecord[]; transfer_records: ProjectAuthorizationRecord[] }>({ authorization_records: [], transfer_records: [] })
const loading = ref(false)
const error = ref('')
const notice = ref('')
const confirmOpen = ref(false)
const revokeTarget = ref<ProjectAuthorizationRecord | null>(null)
const page = ref(1)
const pageSize = ref(10)
const filterOpen = ref(false)
const filterAnchor = ref<HTMLElement | null>(null)
const filterButton = ref<InstanceType<typeof PerformanceFilterButton> | null>(null)
const emptyFilters = (): AuthorizationFilterDraft => ({ from: [], to: [], reviewee: [], status: null })
const cloneFilters = (filters: AuthorizationFilterDraft): AuthorizationFilterDraft => ({ from: [...filters.from], to: [...filters.to], reviewee: [...filters.reviewee], status: filters.status })
const appliedFilters = ref<AuthorizationFilterDraft>(emptyFilters())
const draftFilters = ref<AuthorizationFilterDraft>(emptyFilters())
const isTransferTab = computed(() => activeTab.value === 'transfer')
const statusOptions = computed(() => isTransferTab.value
  ? [{ value: 'transferred', label: '已转交' }, { value: 'revoked', label: '已撤销' }]
  : [{ value: 'authorized', label: '已授权' }, { value: 'revoked', label: '已撤销' }])
const recipientFilterLabel = computed(() => isTransferTab.value ? '被转交人' : '被授权人')
const columns = computed<AuthorizationRecordColumn[]>(() => [
  { key: 'initiator', label: '发起人', width: 180, fixed: 'left' },
  { key: 'status', label: '状态', width: 120 },
  { key: 'authorized_person', label: isTransferTab.value ? '被转交人' : '被授权人', width: 180 },
  { key: 'stages', label: isTransferTab.value ? '转交环节' : '授权环节', width: 240 },
  { key: 'reviewees', label: '被评估人', width: 200 },
  { key: 'submitted_at', label: '授权提交时间', width: 180 },
  { key: 'action', label: '操作', width: 150, fixed: 'right' },
])
const filterCount = computed(() => [appliedFilters.value.from.length, appliedFilters.value.to.length, appliedFilters.value.reviewee.length, appliedFilters.value.status].filter(Boolean).length)
let sequence = 0
const cycleId = computed(() => Number(route.query.cycle_id || 0))
const highlightTab = computed(() => route.query.highlight_tab === 'transfer' ? 'transfer' : route.query.highlight_tab === 'authorization' ? 'authorization' : '')
const highlightId = computed(() => typeof route.query.highlight_id === 'string' && route.query.highlight_id ? route.query.highlight_id : '')
const highlightKey = ref('')
const highlightRow = computed(() => rows.value.find(row => String(row.authorization_id ?? '') === highlightId.value))
const rows = computed(() => activeTab.value === 'authorization' ? data.value.authorization_records : data.value.transfer_records)
const pageRows = computed(() => rows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
function filterParams(): AuthorizationRecordFilters | undefined {
  const filters = appliedFilters.value
  const params: AuthorizationRecordFilters = {}
  if (filters.from.length) params.from_ids = filters.from.map(item => item.value)
  if (filters.to.length) params.to_ids = filters.to.map(item => item.value)
  if (filters.reviewee.length) params.reviewee_user_ids = filters.reviewee.map(item => item.value)
  if (filters.status) params.status = filters.status as AuthorizationRecordFilters['status']
  return Object.keys(params).length ? params : undefined
}
async function load() {
  if (!cycleId.value) { error.value = '缺少绩效周期'; return }
  const current = ++sequence
  loading.value = true; error.value = ''; page.value = 1
  data.value = { authorization_records: [], transfer_records: [] }
  const filters = filterParams()
  try {
    const result = filters ? await projectManagementApi.authorizationRecords(cycleId.value, filters) : await projectManagementApi.authorizationRecords(cycleId.value)
    if (current === sequence) data.value = result
  } catch {
    if (current === sequence) error.value = '授权记录加载失败，请稍后重试'
  } finally {
    if (current === sequence) loading.value = false
  }
  if (current !== sequence) return
  if (highlightTab.value) activeTab.value = highlightTab.value
  if (highlightId.value) locateHighlight()
}
function toggleFilter() {
  if (filterOpen.value) { cancelFilter(); return }
  const anchor = filterButton.value?.$el
  filterAnchor.value = anchor instanceof HTMLElement ? anchor : null
  draftFilters.value = cloneFilters(appliedFilters.value)
  filterOpen.value = true
}
function confirmFilter() {
  appliedFilters.value = cloneFilters(draftFilters.value)
  filterOpen.value = false
  void load()
}
function cancelFilter() {
  filterOpen.value = false
  draftFilters.value = cloneFilters(appliedFilters.value)
}
function clearFilter() {
  appliedFilters.value = emptyFilters()
  draftFilters.value = emptyFilters()
  void load()
}
function locateHighlight() {
  if (!highlightId.value || loading.value) return
  const target = highlightRow.value ? rows.value.indexOf(highlightRow.value) : -1
  highlightKey.value = target >= 0 ? rows.value[target].id : ''
  if (target >= 0) {
    page.value = Math.floor(target / pageSize.value) + 1
    void nextTick(() => { root.value?.querySelector('.is-highlighted, .is-highlighted-row')?.scrollIntoView?.({ block: 'nearest' }) })
  }
}
watch([highlightId, highlightTab], () => {
  if (highlightTab.value) activeTab.value = highlightTab.value
  locateHighlight()
})
function changePageSize(value: number) {
  pageSize.value = value
  page.value = 1
  if (highlightKey.value) locateHighlight()
}
function goBack() { void router.push({ name: 'PerformanceProjectManagement', query: { cycle_id: String(cycleId.value), management_role: route.query.management_role, project_id: route.query.project_id } }) }
function formatDate(value: string) { return value ? new Date(value).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 16) + '（GMT+8）' : '--' }
async function revoke(row: ProjectAuthorizationRecord) {
  if (!row.project_id || !row.task_id || !row.authorization_id || loading.value) return
  revokeTarget.value = row
  confirmOpen.value = true
}
async function confirmRevoke() {
  const row = revokeTarget.value
  if (!row?.project_id || !row.task_id || !row.authorization_id || loading.value) return
  confirmOpen.value = false
  loading.value = true
  try { await projectManagementApi.revokeTaskAuthorization(row.project_id, row.task_id, row.authorization_id); await load(); notice.value = '授权已撤销，已保存和提交内容保留' } catch { notice.value = '撤销失败，请刷新记录后重试' } finally { loading.value = false; revokeTarget.value = null }
}
watch(activeTab, () => {
  page.value = 1
  highlightKey.value = ''
  if (appliedFilters.value.status || draftFilters.value.status) {
    appliedFilters.value.status = null
    draftFilters.value.status = null
    void load()
  }
}, { flush: 'sync' })
watch(() => [cycleId.value, route.query.management_role, route.query.project_id], () => {
  confirmOpen.value = false
  revokeTarget.value = null
  notice.value = ''
  filterOpen.value = false
  appliedFilters.value = emptyFilters()
  draftFilters.value = emptyFilters()
  void load()
})
onMounted(() => void load())
</script>

<style scoped>
.authorization-records :deep(thead .feishu-cell) { font-weight:400; }

:where(.project-management-page, .project-reminder-page, .authorization-records, .calibration-authorization) { font-family: 'Helvetica Neue', Tahoma, 'PingFang SC', 'Microsoft Yahei', Arial, 'Hiragino Sans GB', sans-serif; }

.authorization-records { position:relative; display:flex; width:100vw; min-width:0; height:100vh; min-height:0; flex-direction:column; overflow:hidden; background:var(--ui-page-background); color:var(--color-text-primary); }
.record-tabs { flex:1; min-height:0; padding:calc(var(--layout-topbar-height) + var(--spacing-3)) var(--spacing-5) var(--spacing-5); }
.record-tabs :deep(.line-tabs-content) { padding-top:0; }
.records-surface { display:flex; flex:1; min-width:0; min-height:0; flex-direction:column; margin-top:0; padding:0 var(--spacing-5) var(--spacing-5); border-radius:var(--radius-lg); background:var(--color-bg-card); }
.records-toolbar { display:flex; height:var(--performance-authorization-toolbar-height); flex-shrink:0; align-items:center; justify-content:space-between; border-bottom:1px solid var(--performance-popover-border); font-size:var(--font-size-md); }
.status-dot { display:inline-block; width:var(--performance-authorization-status-dot-size); height:var(--performance-authorization-status-dot-size); margin-right:var(--spacing-2); border-radius:50%; background:var(--color-primary); }
.stage-tag { display:inline-block; margin-right:var(--spacing-2); padding:var(--spacing-1) var(--spacing-2); border-radius:var(--radius-sm); background:var(--color-surface-disabled); white-space:nowrap; }
.more-count { display:inline-block; margin-left:var(--spacing-2); padding:var(--performance-authorization-count-padding-block) var(--spacing-2); border-radius:var(--performance-authorization-count-radius); background:var(--color-surface-disabled); }
.text-action { border:0; background:transparent; color:var(--color-primary); font:inherit; cursor:pointer; }
.notice { color:var(--color-text-tertiary); }
</style>
