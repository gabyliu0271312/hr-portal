<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { projectManagementApi, type ProjectMember } from '@/api/performance'
import type { PerformanceTableColumn } from './performanceTableColumns'
import UiFullScreenModal from '@/components/ui/UiFullScreenModal.vue'
import PerformanceManagementTable from './PerformanceManagementTable.vue'
import PerformanceSearchInput from './PerformanceSearchInput.vue'
import PerformanceFilterButton from './PerformanceFilterButton.vue'
import PerformanceMemberIdentity from './PerformanceMemberIdentity.vue'
import PerformanceRatingTag from './PerformanceRatingTag.vue'
import PerformanceEvaluateRatioPopover from './PerformanceEvaluateRatioPopover.vue'
import MetricTemplateEmptyIllustration from './MetricTemplateEmptyIllustration.vue'

const props = defineProps<{
  modelValue: boolean
  projectId: number
  cycleName: string
  level: string
  ratingKey: string
  ratingLabel: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; 'select-member': [member: ProjectMember] }>()

const rows = ref<ProjectMember[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref('')
const keyword = ref('')
const page = ref(1)
const pageSize = ref(50)
const sortKey = ref('name')
const sortOrder = ref<'asc' | 'desc' | ''>('asc')

const columns: PerformanceTableColumn[] = [
  { key: 'name', label: '姓名', width: 422, fixed: 'left', sortable: true },
  { key: 'department_path', label: '部门全路径', width: 422 },
  { key: 'rating', label: '绩效评级', width: 271, sortable: true },
  { key: 'completion', label: '360° 评估率', width: 271, sortable: true },
  { key: 'job_sequence', label: '序列', width: 196, sortable: true },
  { key: 'position_level', label: '职级', width: 234, sortable: true },
]

const subtitle = computed(() => `符合「${props.cycleName}-终评状态：已完成，${props.cycleName}-职级：${props.level}，${props.cycleName}-绩效评级（终评）：${props.ratingLabel}」的员工`)

function departmentPath(row: ProjectMember) {
  return row.department_path || '--'
}

async function load() {
  if (!props.modelValue || !props.projectId) return
  loading.value = true
  error.value = ''
  try {
    const result = await projectManagementApi.members(
      props.projectId,
      keyword.value.trim() || undefined,
      page.value,
      pageSize.value,
      sortKey.value || undefined,
      sortOrder.value || undefined,
      props.level,
      props.ratingKey,
    )
    rows.value = result.items
    total.value = result.total
  } catch {
    rows.value = []
    total.value = 0
    error.value = '人员列表加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function search() { page.value = 1; void load() }
function clearSearch() { keyword.value = ''; page.value = 1; void load() }
function changePage(value: number) { page.value = value; void load() }
function changePageSize(value: number) { pageSize.value = value; page.value = 1; void load() }
function changeSort(payload: { key: string; order: 'asc' | 'desc' | '' }) {
  sortKey.value = payload.key
  sortOrder.value = payload.order
  page.value = 1
  void load()
}
function close() { emit('update:modelValue', false) }
function onRowClick(row: ProjectMember) {
  if (row.can_view_detail) emit('select-member', row)
}

watch(() => props.modelValue, open => {
  if (!open) return
  keyword.value = ''
  page.value = 1
  sortKey.value = 'name'
  sortOrder.value = 'asc'
  void load()
})
</script>

<template>
  <UiFullScreenModal v-if="modelValue" title="人员列表" :show-footer="false" content-scroll="inner" @back="close">
    <template #subtitle><span class="matrix-people-subtitle">{{ subtitle }}</span></template>
    <div class="matrix-people-page">
      <p v-if="error" class="matrix-people-error" role="alert">{{ error }}</p>
      <div class="matrix-people-toolbar">
        <PerformanceSearchInput v-model="keyword" placeholder="搜索成员" aria-label="搜索成员" @search="search" @clear="clearSearch" />
        <PerformanceFilterButton :disabled="loading" @click="search" />
      </div>
      <div class="matrix-people-result" aria-live="polite">{{ total }}个结果</div>
      <PerformanceManagementTable
        class="matrix-people-table"
        :rows="rows"
        :columns="columns"
        :loading="loading"
        loading-text="正在加载人员…"
        :empty-text="error || '暂无人员'"
        table-aria-label="人员列表"
        pagination-aria-label="人员列表分页"
        scroll-mode="page"
        row-key="employee_no"
        :page="page"
        :page-size="pageSize"
        :total="total"
        :sort-key="sortKey"
        :sort-order="sortOrder"
        sort-mode="remote"
        :clickable-rows="rows.some(row => row.can_view_detail)"
        @row-click="onRowClick"
        @page-change="changePage"
        @page-size-change="changePageSize"
        @sort-change="changeSort"
      >
        <template #cell="{ row, column }">
          <PerformanceMemberIdentity v-if="column.key === 'name'" :display-name="(row as ProjectMember).display_name" :class="{ 'is-detail-link': (row as ProjectMember).can_view_detail }" />
          <span v-else-if="column.key === 'department_path'">{{ departmentPath(row as ProjectMember) }}</span>
          <PerformanceRatingTag v-else-if="column.key === 'rating' && (row as ProjectMember).rating" :label="(row as ProjectMember).rating!" :color="(row as ProjectMember).rating_tone || undefined" />
          <PerformanceEvaluateRatioPopover v-else-if="column.key === 'completion' && (row as ProjectMember).evaluate_ratio" :completion="(row as ProjectMember).completion || '0/0'" :ratio="(row as ProjectMember).evaluate_ratio" />
          <span v-else>{{ (row as ProjectMember)[column.key as keyof ProjectMember] || '--' }}</span>
        </template>
        <template #empty="{ loading: isLoading, text }">
          <div v-if="!isLoading" class="matrix-people-empty">
            <MetricTemplateEmptyIllustration />
            <span>{{ text }}</span>
          </div>
        </template>
      </PerformanceManagementTable>
    </div>
  </UiFullScreenModal>
</template>

<style scoped>
.matrix-people-subtitle { color: #646a73; font-size: 14px; font-weight: 400; line-height: 24px; white-space: nowrap; }
.matrix-people-page { width: 100%; min-width: 0; min-height: 0; display: flex; flex: 1 1 auto; flex-direction: column; padding: 16px 20px 20px; box-sizing: border-box; background: #fff; }
.matrix-people-error { margin: 0 0 12px; color: var(--performance-field-error-color); font-size: 14px; line-height: 22px; }
.matrix-people-toolbar { display: flex; flex: none; align-items: center; gap: 8px; min-height: 32px; }
.matrix-people-toolbar :deep(.performance-search-input) { flex: 1 1 auto; min-width: 0; height: 32px; }
.matrix-people-result { flex: none; margin-top: 16px; color: #1f2329; font-size: 14px; line-height: 22px; }
.matrix-people-table { flex: 1 1 auto; min-height: 0; margin-top: 8px; --ui-table-header-background: #fff; --ui-table-header-height: 47px; --ui-table-row-height: 55px; }
.matrix-people-table :deep(.ui-table__cell--head) { color: #646a73; font-weight: 500; }
.matrix-people-table :deep(.is-detail-link) { cursor: pointer; }
.matrix-people-table :deep(.is-detail-link .member-name) { color: var(--color-primary); text-decoration: none; }
.matrix-people-table :deep(.is-detail-link:hover .member-name) { color: var(--color-primary-hover); }
.matrix-people-table :deep(.table-pagination) { justify-content: flex-end; }
.matrix-people-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 20px 0; color: #646a73; font-size: 14px; line-height: 22px; }
</style>
