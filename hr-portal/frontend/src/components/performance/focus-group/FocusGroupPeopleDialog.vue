<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PerformanceFocusGroupChangePerson } from '@/api/performance'
import UiFullScreenModal from '@/components/ui/UiFullScreenModal.vue'
import PerformanceManagementTable from '../PerformanceManagementTable.vue'
import PerformanceSearchInput from '../PerformanceSearchInput.vue'
import PerformanceFilterButton from '../PerformanceFilterButton.vue'
import MetricTemplateEmptyIllustration from '../MetricTemplateEmptyIllustration.vue'
import type { PerformanceTableColumn } from '../performanceTableColumns'

/**
 * 人员列表全屏弹窗（REA 对齐飞书人员列表页）。
 * - 页壳：UiFullScreenModal，title「人员列表」+ subtitle 组名，返回键关闭
 * - 工具栏：「搜索成员」搜索框 + 「筛选」按钮；数据源组件注入 loadFn 拉取
 * - 表格：姓名固定左列 / 直属上级 / 一级部门 / 末级部门 / 序列；一级部门读 department 物理列
 *   （花名册一级部门），末级部门从 organization_ref 拆路径（leafDepartment，与
 *   PerformancePeopleListPanel 同源复用），序列读后端 format_job_sequence（职位族-职位类，
 *   与绩效评估「上级评估」成员列表同逻辑）
 * - 分页：共 N 条 + 页码 + 条/页（走 PerformanceManagementTable 内置 UiPagination）
 */
const props = defineProps<{
  modelValue: boolean
  title: string
  subtitle?: string
  rows: PerformanceFocusGroupChangePerson[]
  total?: number
  loading: boolean
  error: string
  /** 数据源注入：当前页数据拉取（含 keyword）；不传则组件本地过滤分页 */
  loadFn?: (keyword: string, page: number, pageSize: number) => Promise<{ total: number; items: PerformanceFocusGroupChangePerson[] }> | null
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const keyword = ref('')
const page = ref(1)
const pageSize = ref(10)

const columns: PerformanceTableColumn[] = [
  { key: 'display_name', label: '姓名', width: 312, fixed: 'left' },
  { key: 'direct_supervisor_name', label: '直属上级', width: 312 },
  { key: 'department', label: '一级部门', width: 312 },
  { key: 'leaf_department', label: '末级部门', width: 312 },
  { key: 'job_sequence', label: '序列', width: 312 },
]

function leafDepartment(row: PerformanceFocusGroupChangePerson): string {
  const parts = (row.organization_ref ?? '').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

const resultCount = computed(() => {
  if (props.loadFn) return props.total ?? 0
  const query = keyword.value.trim()
  if (!query) return props.rows.length
  return props.rows.filter(row => searchableText(row).includes(query)).length
})
const displayedRows = computed(() => {
  if (props.loadFn) return props.rows
  const query = keyword.value.trim()
  const filtered = query ? props.rows.filter(row => searchableText(row).includes(query)) : props.rows
  const start = (page.value - 1) * pageSize.value
  return filtered.slice(start, start + pageSize.value)
})

function searchableText(row: PerformanceFocusGroupChangePerson) {
  return [row.display_name, row.employee_no, row.direct_supervisor_name, row.department, leafDepartment(row), row.department_2, row.job_sequence]
    .filter(Boolean)
    .join(' ')
}

function onSearch() {
  page.value = 1
  if (props.loadFn) void props.loadFn?.(keyword.value.trim(), 1, pageSize.value)
}

function onClear() {
  keyword.value = ''
  page.value = 1
  if (props.loadFn) void props.loadFn?.('', 1, pageSize.value)
}

function changePage(value: number) {
  page.value = value
  if (props.loadFn) void props.loadFn?.(keyword.value.trim(), value, pageSize.value)
}
function changePageSize(value: number) {
  pageSize.value = value
  page.value = 1
  if (props.loadFn) void props.loadFn?.(keyword.value.trim(), 1, value)
}

function onFilter() {
  onSearch()
}

watch(() => props.modelValue, open => {
  if (open) {
    keyword.value = ''
    page.value = 1
  }
})

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <UiFullScreenModal v-if="props.modelValue" :title="props.title" :show-footer="false" content-scroll="inner" @back="close">
    <template #subtitle>{{ props.subtitle }}</template>
    <div class="focus-group-people-page">
      <p v-if="props.error" class="focus-group-people-error" role="alert">{{ props.error }}</p>
      <div class="focus-group-people-toolbar">
        <PerformanceSearchInput
          v-model="keyword"
          placeholder="搜索成员"
          aria-label="搜索成员"
          @search="onSearch"
          @clear="onClear"
        />
        <PerformanceFilterButton :disabled="props.loading" @click="onFilter" />
      </div>
      <div class="focus-group-people-result" aria-live="polite">{{ resultCount }}个结果</div>
      <PerformanceManagementTable
        :rows="displayedRows"
        :columns="columns"
        :loading="props.loading"
        loading-text="正在加载人员…"
        :empty-text="props.error || '暂无人员'"
        table-aria-label="人员列表"
        pagination-aria-label="人员列表分页"
        scroll-mode="page"
        row-key="employee_no"
        :show-pagination="true"
        :page="page"
        :page-size="pageSize"
        :total="resultCount"
        @page-change="changePage"
        @page-size-change="changePageSize"
        class="focus-group-people-table"
      >
        <template #pagination-prefix>
          <span class="focus-group-people-total">共 {{ resultCount }} 条</span>
        </template>
        <template #cell="{ row, column }">
          <span v-if="column.key === 'leaf_department'">{{ leafDepartment(row as PerformanceFocusGroupChangePerson) || '--' }}</span>
          <span v-else>{{ (row as PerformanceFocusGroupChangePerson)[column.key as keyof PerformanceFocusGroupChangePerson] ?? '--' }}</span>
        </template>
        <template #empty="{ loading: isLoading, text }">
          <div v-if="!isLoading" class="focus-group-people-empty">
            <MetricTemplateEmptyIllustration />
            <span class="focus-group-people-empty__text">{{ text }}</span>
          </div>
        </template>
      </PerformanceManagementTable>
    </div>
  </UiFullScreenModal>
</template>

<style scoped>
.focus-group-people-page {
  width: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  padding: 16px 20px 20px;
  box-sizing: border-box;
  background: #ffffff;
}
.focus-group-people-error { margin: 0 0 var(--spacing-3); color: var(--performance-field-error-color); font-size: var(--font-size-md); line-height: 22px; }
.focus-group-people-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  min-height: 32px;
}
.focus-group-people-toolbar :deep(.performance-search-input) {
  flex: 1 1 auto;
  min-width: 0;
  height: 32px;
}
.focus-group-people-result {
  flex: none;
  margin: 16px 0 0;
  color: #1f2329;
  font-size: 14px;
  line-height: 22px;
}
.focus-group-people-table {
  flex: 1 1 auto;
  min-height: 0;
  margin-top: 8px;
  --ui-table-header-background: #ffffff;
  --ui-table-header-height: 47px;
  --ui-table-row-height: 55px;
}
.focus-group-people-table :deep(.ui-table__cell--head) {
  color: #646a73;
  font-weight: 500;
}
.focus-group-people-table :deep(.table-pagination) {
  justify-content: flex-end;
}
.focus-group-people-total {
  color: #1f2329;
  font-size: 14px;
  line-height: 22px;
}
.focus-group-people-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 0;
}
.focus-group-people-empty__text {
  color: #646a73;
  font-size: 14px;
  line-height: 22px;
}
</style>
