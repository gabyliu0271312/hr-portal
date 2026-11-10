<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElOption, ElSelect } from 'element-plus'
import { performanceCycleApi, type PerformanceCycleDepartmentItem } from '@/api/performance'
import PerformancePagination from './PerformancePagination.vue'
import PerformanceSearchInput from './PerformanceSearchInput.vue'
import UiSurface from '@/components/ui/UiSurface.vue'
import UiTable, { type UiTableColumn } from '@/components/ui/UiTable.vue'

const props = defineProps<{ cycleId: number }>()

const keyword = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const rows = ref<PerformanceCycleDepartmentItem[]>([])
const loading = ref(false)

/** 列规格对齐飞书人事组织架构页：操作列固定右侧（sticky，无投影） */
const columns: UiTableColumn[] = [
  { key: 'department_name', label: '部门名称', width: 280 },
  { key: 'parent_department', label: '上级部门', width: 280 },
  { key: 'people_count', label: '人数', width: 160 },
  { key: 'actions', label: '操作', width: 280, fixed: 'right' },
]

async function load() {
  loading.value = true
  try {
    const { items, total: count } = await performanceCycleApi.listDepartmentsPage(props.cycleId, {
      keyword: keyword.value || undefined,
      offset: (page.value - 1) * pageSize.value,
      limit: pageSize.value,
    })
    rows.value = items
    total.value = count
  } finally {
    loading.value = false
  }
}

function onPageChange(next: number) {
  page.value = next
  void load()
}

function onPageSizeChange(next: number) {
  pageSize.value = Number(next) || 10
  page.value = 1
  void load()
}

function onSearch() {
  page.value = 1
  void load()
}

watch(() => props.cycleId, () => {
  page.value = 1
  void load()
}, { immediate: true })
</script>

<template>
  <div class="department-panel">
    <UiSurface class="department-surface">
      <div class="department-toolbar">
        <PerformanceSearchInput v-model="keyword" placeholder="搜索部门名称" @search="onSearch" @clear="onSearch" />
      </div>
      <UiTable
        :columns="columns"
        :rows="rows"
        :loading="loading"
        loading-text="加载中"
        empty-text="暂无部门"
        aria-label="周期部门列表"
        row-key="department_name"
        :min-width="980"
      >
        <template #cell="{ row, column }">
          <span v-if="column.key === 'actions'" class="department-action-placeholder">—</span>
          <span v-else>{{ (row as unknown as Record<string, unknown>)[column.key] }}</span>
        </template>
      </UiTable>
    </UiSurface>
    <div class="department-footer">
      <span class="department-total">共 {{ total }} 个部门</span>
      <PerformancePagination
        :page="page"
        :page-size="pageSize"
        :total="total"
        aria-label="周期部门分页"
        @page-change="onPageChange"
      />
      <ElSelect
        class="department-page-size"
        :model-value="pageSize"
        size="small"
        aria-label="每页条数"
        @change="onPageSizeChange"
      >
        <ElOption v-for="size in [10, 20, 50, 100]" :key="size" :label="`${size} 条/页`" :value="size" />
      </ElSelect>
    </div>
  </div>
</template>

<style scoped>
.department-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.department-surface { margin-bottom: 12px; }
.department-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
  margin-bottom: var(--page-gap-toolbar-table);
}
.department-action-placeholder { color: var(--ui-table-placeholder-color); }
.department-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-pagination-group-gap);
  min-height: 28px;
  padding-bottom: 4px;
}
.department-total { color: var(--ui-table-header-color); font-size: 14px; line-height: 22px; }
.department-page-size { width: 104px; }
</style>
