<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PerformanceFocusGroupChangePerson } from '@/api/performance'
import UiFullScreenModal from '@/components/ui/UiFullScreenModal.vue'
import PerformanceManagementTable from '../PerformanceManagementTable.vue'
import UiSurface from '@/components/ui/UiSurface.vue'
import PerformanceListToolbar from '../PerformanceListToolbar.vue'
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
  <UiFullScreenModal v-if="props.modelValue" class="focus-group-people-dialog" :title="props.title" :show-footer="false" content-scroll="page" @back="close">
    <template #subtitle>{{ props.subtitle }}</template>
    <div class="focus-group-people-page">
      <UiSurface class="focus-group-people-surface" radius="all" min-width="0" padding="var(--ui-surface-padding-spacious)">
      <p v-if="props.error" class="focus-group-people-error" role="alert">{{ props.error }}</p>
      <PerformanceListToolbar v-model:keyword="keyword" search-placeholder="搜索成员" search-aria-label="搜索成员" search-fill :filter-disabled="props.loading" @search="onSearch" @clear="onClear" @filter="onFilter" />
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
      </UiSurface>
    </div>
  </UiFullScreenModal>
</template>

<style scoped>
.focus-group-people-dialog {
  --ui-fullscreen-background: var(--performance-page-surface);
  --performance-fullscreen-content-bottom-space: 0px;
}
.focus-group-people-page {
  width: 100%;
  min-width: 0;
  min-height: 100%;
  flex: 1 0 auto;
  padding: var(--spacing-5) var(--ui-page-content-inset) var(--ui-page-content-inset);
  box-sizing: border-box;
}
.focus-group-people-surface { width: 100%; }
.focus-group-people-error { margin: 0 0 var(--spacing-3); color: var(--performance-field-error-color); font-size: var(--font-size-md); line-height: var(--ui-table-line-height); }
.focus-group-people-result {
  margin-bottom: var(--spacing-2);
  color: var(--ui-table-text-color);
  font-size: var(--ui-table-font-size);
  line-height: var(--ui-table-line-height);
}
.focus-group-people-total { color: var(--ui-pagination-color); font-size: var(--font-size-md); line-height: var(--ui-table-line-height); }
.focus-group-people-empty { display: flex; flex-direction: column; align-items: center; gap: var(--spacing-2); padding: var(--spacing-5) 0; }
.focus-group-people-empty__text { color: var(--color-text-secondary); font-size: var(--font-size-md); line-height: var(--ui-table-line-height); }
</style>
