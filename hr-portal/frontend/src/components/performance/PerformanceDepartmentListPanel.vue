<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElTableColumn } from 'element-plus'
import { performanceCycleApi, type PerformanceCycleDepartmentItem } from '@/api/performance'
import type { PerformanceTableColumn } from './performanceTableColumns'
import PerformanceManagementTable from './PerformanceManagementTable.vue'
import PerformanceSearchInput from './PerformanceSearchInput.vue'

const props = defineProps<{ cycleId: number }>()

const keyword = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const rows = ref<PerformanceCycleDepartmentItem[]>([])
const loading = ref(false)

const columns: PerformanceTableColumn[] = [
  { key: 'department_name', label: '部门名称' },
  { key: 'parent_department', label: '上级部门' },
  { key: 'people_count', label: '人数' },
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
  pageSize.value = next
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
    <div class="department-panel-toolbar">
      <PerformanceSearchInput v-model="keyword" placeholder="搜索部门名称" @search="onSearch" @clear="onSearch" />
    </div>
    <div class="table-scroll-wrap">
      <PerformanceManagementTable
        :rows="rows"
        :loading="loading"
        loading-text="加载中"
        empty-text="暂无部门"
        table-aria-label="周期部门列表"
        pagination-aria-label="周期部门分页"
        scroll-mode="inner"
        :max-height="600"
        :page="page"
        :page-size="pageSize"
        :total="total"
        row-key="department_name"
        @page-change="onPageChange"
        @page-size-change="onPageSizeChange"
      >
        <el-table-column
          v-for="column in columns"
          :key="column.key"
          :prop="column.key"
          :label="column.label"
          min-width="160"
          show-overflow-tooltip
        />
        <el-table-column label="操作" width="280" fixed="right">
          <template #default>—</template>
        </el-table-column>
      </PerformanceManagementTable>
    </div>
  </div>
</template>

<style scoped>
.department-panel { min-width: 0; }
.table-scroll-wrap { overflow-x: auto; }
.department-panel-toolbar {
  margin-bottom: 12px;
}
</style>
