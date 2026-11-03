<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElTableColumn } from 'element-plus'
import { performanceCycleApi, type PerformanceCyclePerson } from '@/api/performance'
import { performanceColumnWidth, type PerformanceTableColumn } from './performanceTableColumns'
import PerformanceManagementTable from './PerformanceManagementTable.vue'
import PerformanceSearchInput from './PerformanceSearchInput.vue'

const props = defineProps<{ cycleId: number }>()

const keyword = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const rows = ref<PerformanceCyclePerson[]>([])
const loading = ref(false)

const columns: PerformanceTableColumn[] = [
  { key: 'display_name', label: '姓名' },
  { key: 'direct_supervisor_name', label: '直属上级' },
  { key: 'department', label: '一级部门' },
  { key: 'leaf_department', label: '末级部门' },
  { key: 'hrbp_name', label: 'HRBP' },
  { key: 'employee_type', label: '员工类型' },
  { key: 'job_family', label: '职类' },
  { key: 'job_category', label: '子职类' },
  { key: 'standard_position', label: '岗位' },
  { key: 'position_level', label: '职位层级' },
  { key: 'hire_date', label: '入职日期' },
]

async function load() {
  loading.value = true
  try {
    const { items, total: count } = await performanceCycleApi.listPeoplePage(props.cycleId, {
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

function leafDepartment(row: PerformanceCyclePerson): string {
  const parts = (row.organization_ref ?? '').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}
</script>

<template>
  <div class="people-panel">
    <PerformanceManagementTable
      viewport-surface
      :rows="rows"
      :loading="loading"
      loading-text="加载中"
      empty-text="暂无人员"
      table-aria-label="周期人员列表"
      pagination-aria-label="周期人员分页"
      scroll-mode="inner"
      :max-height="600"
      :page="page"
      :page-size="pageSize"
      :total="total"
      row-key="employee_no"
      @page-change="onPageChange"
      @page-size-change="onPageSizeChange"
    >
      <template #toolbar>
        <PerformanceSearchInput v-model="keyword" placeholder="搜索姓名或工号" @search="onSearch" @clear="onSearch" />
      </template>
      <el-table-column
        v-for="column in columns"
        :key="column.key"
        :prop="column.key"
        :label="column.label"
        :min-width="performanceColumnWidth(column.key)"
        show-overflow-tooltip
      >
        <template v-if="column.key === 'leaf_department'" #default="{ row }">
          {{ leafDepartment(row as PerformanceCyclePerson) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="280" fixed="right">
        <template #default>—</template>
      </el-table-column>
    </PerformanceManagementTable>
  </div>
</template>

<style scoped>
.people-panel {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
</style>
