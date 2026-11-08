<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElTableColumn } from 'element-plus'
import type { PerformanceCycleProjectShell } from '@/api/performance'
import PerformancePermissionButton from './PerformancePermissionButton.vue'
import PerformanceListToolbar from './PerformanceListToolbar.vue'
import PerformanceManagementTable from './PerformanceManagementTable.vue'
import PerformanceProjectActions from './PerformanceProjectActions.vue'

const props = withDefaults(defineProps<{
  projects?: PerformanceCycleProjectShell[]
  projectCount?: number
  canCreate?: boolean
  managedProjectRefs?: string[]
}>(), {
  projects: () => [],
  projectCount: 0,
  canCreate: false,
  managedProjectRefs: () => [],
})

const emit = defineEmits<{
  create: []
  edit: [project: PerformanceCycleProjectShell]
  start: [project: PerformanceCycleProjectShell]
  copy: [project: PerformanceCycleProjectShell]
  remove: [project: PerformanceCycleProjectShell]
}>()

const keyword = ref('')
const filterOpen = ref(false)
const rows = computed(() => props.projects)
const filteredRows = computed(() => {
  const value = keyword.value.trim().toLowerCase()
  return rows.value.filter(project => !value || project.name.toLowerCase().includes(value))
})
const total = computed(() => props.projectCount || filteredRows.value.length)
function canManage(project: PerformanceCycleProjectShell) {
  return props.canCreate || props.managedProjectRefs.includes(project.project_ref)
}
function projectRow(row: unknown) {
  return row as PerformanceCycleProjectShell
}
function projectStatus(project: PerformanceCycleProjectShell) {
  if (project.status === 'STARTED') return { label: '已启动', color: 'var(--performance-project-status-started)' }
  if (project.status === 'ARCHIVED') return { label: '已结束', color: 'var(--performance-project-status-ended)' }
  if (project.configuration_completed) return { label: '待启动', color: 'var(--performance-project-status-wait-start)' }
  return { label: '待完成配置', color: 'var(--performance-project-status-wait-config)' }
}
</script>

<template>
  <section class="project-settings" aria-labelledby="project-settings-title">
    <div class="project-heading">
      <h3 id="project-settings-title">项目设置</h3>
    </div>
    <PerformanceListToolbar class="project-tools" :keyword="keyword" search-placeholder="通过项目名称搜索" @update:keyword="keyword = $event" @filter="filterOpen = !filterOpen">
      <template #left>
        <PerformancePermissionButton op="C" :allowed="canCreate" variant="primary" class="project-create primary-button" aria-label="新建项目" @click="emit('create')">
          <span aria-hidden="true">＋</span> 新建
        </PerformancePermissionButton>
      </template>
    </PerformanceListToolbar>
    <div v-if="filterOpen" class="project-filter-panel" role="status">项目筛选将在项目配置功能开放后接入</div>
    <div class="project-table-wrap">
      <PerformanceManagementTable
        :rows="filteredRows"
        :loading="false"
        loading-text="正在加载项目..."
        empty-text="暂无项目"
        table-aria-label="项目设置表格"
        pagination-aria-label="项目分页"
        :total="total"
      >
        <el-table-column prop="name" label="项目名称" min-width="250" />
        <el-table-column prop="description" label="描述" min-width="251">
          <template #default="{ row }">{{ row.description || '--' }}</template>
        </el-table-column>
        <el-table-column label="项目管理员" min-width="120">
          <template #default="{ row }">{{ row.administrators.join('、') || '--' }}</template>
        </el-table-column>
        <el-table-column label="状态" min-width="110">
          <template #default="{ row }"><span class="project-status" :style="{ '--project-status-color': projectStatus(projectRow(row)).color }"><i />{{ projectStatus(projectRow(row)).label }}</span></template>
        </el-table-column>
        <el-table-column prop="evaluated_count" label="评估人数" min-width="148" />
        <el-table-column label="操作" width="180" fixed="right" class-name="fixed-operation">
          <template #default="{ row }">
            <PerformanceProjectActions
              :can-manage="canManage(projectRow(row))"
              :can-copy="canCreate"
              :started="projectRow(row).status === 'STARTED'"
              :project-name="projectRow(row).name"
              :status="projectRow(row).status"
              :configuration-completed="Boolean(projectRow(row).configuration_completed)"
              :start-blocked-reason="projectRow(row).start_blocked_reason || ''"
              @edit="emit('edit', projectRow(row))"
              @start="emit('start', projectRow(row))"
              @copy="emit('copy', projectRow(row))"
              @remove="emit('remove', projectRow(row))"
            />
          </template>
        </el-table-column>
      </PerformanceManagementTable>
    </div>
  </section>
</template>

<style scoped>
.project-settings { min-width: 0; }
.project-heading h3 { margin: 0 0 16px; color: #1f2329; font-size: 18px; font-weight: 600; line-height: 26px; }
.project-tools { margin-bottom: 16px; }
.project-tools :deep(.list-toolbar) { margin-bottom: 0; }
.project-tools :deep(.search-input) { width: 224px; }
.project-create { width: 80px; }
.project-filter-panel { margin: -8px 0 16px; padding: 10px 12px; border: 1px solid #d0d3d6; border-radius: 6px; color: #646a73; background: #fff; font-size: 14px; line-height: 22px; }
.project-table-wrap { min-width: 0; }
.project-status { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
.project-status i { width: 6px; height: 6px; border-radius: 50%; background: var(--project-status-color); }
</style>
