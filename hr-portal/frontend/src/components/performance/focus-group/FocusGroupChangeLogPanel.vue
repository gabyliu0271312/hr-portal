<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { performanceFocusGroupApi, type PerformanceFocusGroupChangeLogItem, type PerformanceFocusGroupChangePerson } from '@/api/performance'
import PerformanceManagementTable from '../PerformanceManagementTable.vue'
import MetricTemplateEmptyIllustration from '../MetricTemplateEmptyIllustration.vue'
import FocusGroupPeopleDialog from './FocusGroupPeopleDialog.vue'
import type { PerformanceTableColumn } from '../performanceTableColumns'

const props = defineProps<{
  cycleId: number | null
  groupId: number | null
}>()

const rows = ref<PerformanceFocusGroupChangeLogItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const error = ref('')

const columns = computed<PerformanceTableColumn[]>(() => [
  { key: 'operator', label: '操作人', width: 264 },
  { key: 'change_type', label: '操作类型', width: 200 },
  { key: 'condition', label: '操作条件', width: 450 },
  { key: 'count', label: '变更人员数', width: 223 },
  { key: 'changed_at', label: '操作时间', width: 223 },
])

async function load() {
  if (!props.cycleId || !props.groupId) return
  loading.value = true
  error.value = ''
  try {
    const result = await performanceFocusGroupApi.changeLog(props.cycleId, props.groupId, page.value, pageSize.value)
    rows.value = result.items
    total.value = result.total
  } catch (e: any) {
    rows.value = []
    total.value = 0
    error.value = e?.response?.data?.detail || '变更记录加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function changePage(value: number) {
  page.value = value
  void load()
}
function changePageSize(value: number) {
  pageSize.value = value
  page.value = 1
  void load()
}

function formatDateTime(value: string) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/* ---- 变更人员数展开弹窗 ---- */
const detailOpen = ref(false)
const detailTitle = ref('')
const detailItem = ref<PerformanceFocusGroupChangeLogItem | null>(null)
const detailRows = ref<PerformanceFocusGroupChangePerson[]>([])
const detailTotal = ref(0)
const detailLoading = ref(false)
const detailError = ref('')
let detailVersion = 0

async function loadDetailPeople(keyword: string, page: number, pageSize: number) {
  const item = detailItem.value
  if (!props.cycleId || !props.groupId || !item) return { total: 0, items: [] }
  const result = await performanceFocusGroupApi.changePeople(props.cycleId, props.groupId, item.event_id, item.user_ids, page, pageSize, keyword)
  return { total: result.total, items: result.items }
}

async function openCountDetail(item: PerformanceFocusGroupChangeLogItem) {
  if (!props.cycleId || !props.groupId || detailLoading.value) return
  const version = ++detailVersion
  detailItem.value = item
  detailOpen.value = true
  detailTitle.value = '人员列表'
  detailRows.value = []
  detailTotal.value = 0
  detailLoading.value = true
  detailError.value = ''
  try {
    const result = await loadDetailPeople('', 1, 10)
    if (version !== detailVersion || !result) return
    detailRows.value = result.items
    detailTotal.value = result.total
  } catch (e: any) {
    if (version === detailVersion) detailError.value = e?.response?.data?.detail || '人员加载失败，请稍后重试'
  } finally {
    if (version === detailVersion) detailLoading.value = false
  }
}

function closeCountDetail() {
  detailVersion += 1
  detailOpen.value = false
}

function updateDetailOpen(value: boolean) {
  if (!value) closeCountDetail()
  else detailOpen.value = true
}

watch(() => [props.cycleId, props.groupId], () => {
  page.value = 1
  rows.value = []
  total.value = 0
  void load()
}, { immediate: true })
</script>

<template>
  <div class="focus-group-changelog-panel">
    <PerformanceManagementTable
      :rows="rows"
      :columns="columns"
      :loading="loading"
      loading-text="正在加载变更记录…"
      :empty-text="error || '暂无变更记录'"
      table-aria-label="人员组变更记录表格"
      pagination-aria-label="人员组变更记录分页"
      scroll-mode="page"
      row-key="id"
      :page="page"
      :page-size="pageSize"
      :total="total"
      :show-pagination="true"
      @page-change="changePage"
      @page-size-change="changePageSize"
      class="focus-group-changelog-table"
    >
      <template #cell="{ row, column }">
        <button
          v-if="column.key === 'count'"
          class="focus-group-changelog-count"
          type="button"
          :disabled="loading || !(row as PerformanceFocusGroupChangeLogItem).count"
          @click="openCountDetail(row as PerformanceFocusGroupChangeLogItem)"
        >{{ (row as PerformanceFocusGroupChangeLogItem).count }}</button>
        <span v-else-if="column.key === 'changed_at'">{{ formatDateTime((row as PerformanceFocusGroupChangeLogItem).changed_at) }}</span>
        <span v-else>{{ (row as any)[column.key] || '--' }}</span>
      </template>
      <template #empty="{ loading: isLoading, text }">
        <div v-if="!isLoading" class="focus-group-empty">
          <MetricTemplateEmptyIllustration />
          <span class="focus-group-empty__text">{{ text }}</span>
        </div>
      </template>
    </PerformanceManagementTable>

    <FocusGroupPeopleDialog
      :model-value="detailOpen"
      :title="detailTitle"
      :rows="detailRows"
      :total="detailTotal"
      :loading="detailLoading"
      :error="detailError"
      :load-fn="loadDetailPeople"
      @update:model-value="updateDetailOpen"
    />
  </div>
</template>

<style scoped>
.focus-group-changelog-panel {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  gap: var(--spacing-3);
}
.focus-group-changelog-table {
  flex: 1 1 auto;
  min-height: 0;
  --ui-table-header-background: #ffffff;
  --ui-table-header-height: 47px;
}
.focus-group-changelog-table :deep(.ui-table__cell--head) {
  color: #646a73;
  font-weight: 500;
}
.focus-group-changelog-count {
  padding: 2px 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--performance-button-link-disabled-color);
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  cursor: pointer;
}
.focus-group-changelog-count:not(:disabled) {
  color: var(--color-primary-hover);
  cursor: pointer;
}
.focus-group-changelog-count:hover:not(:disabled) {
  background: #eff0f1;
}
.focus-group-changelog-count:disabled {
  cursor: not-allowed;
}
.focus-group-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 0;
}
.focus-group-empty__text {
  color: #646a73;
  font-size: 14px;
  line-height: 22px;
}
</style>
