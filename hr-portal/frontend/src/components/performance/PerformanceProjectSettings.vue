<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { performanceCycleApi, type PerformanceCycleProjectShell } from '@/api/performance'
import type { PerformanceTableColumn } from './performanceTableColumns'
import { usePerformanceFilterDraft } from '@/composables/usePerformanceFilterDraft'
import PerformancePermissionButton from './PerformancePermissionButton.vue'
import PerformanceListToolbar from './PerformanceListToolbar.vue'
import PerformanceManagementTable from './PerformanceManagementTable.vue'
import PerformanceProjectActions from './PerformanceProjectActions.vue'
import PerformanceMemberIdentity from './PerformanceMemberIdentity.vue'
import PerformanceFilterPopover from './PerformanceFilterPopover.vue'
import PerformanceFilterField from './PerformanceFilterField.vue'
import PerformanceFilterActions from './PerformanceFilterActions.vue'
import type { PerformanceSearchSelectOption } from './PerformanceSearchSelect.vue'
import type { PerformanceFilterField as PerformanceFilterFieldDescriptor } from './performanceFilterTypes'
import { PERFORMANCE_PROJECT_STATUS_META, PERFORMANCE_PROJECT_STATUS_OPTIONS, filterPerformanceProjects, performanceProjectStatusKey } from './performanceProjectFilter'

const props = withDefaults(defineProps<{
  projects?: PerformanceCycleProjectShell[]
  projectCount?: number
  canCreate?: boolean
  managedProjectRefs?: string[]
  cycleId?: number
}>(), {
  projects: () => [],
  projectCount: 0,
  canCreate: false,
  managedProjectRefs: () => [],
  cycleId: undefined,
})

const emit = defineEmits<{
  create: []
  edit: [project: PerformanceCycleProjectShell]
  start: [project: PerformanceCycleProjectShell]
  copy: [project: PerformanceCycleProjectShell]
  remove: [project: PerformanceCycleProjectShell]
}>()

type ProjectFilterValues = Record<string, string[]>
const filterDraft = usePerformanceFilterDraft<ProjectFilterValues>(() => ({ status: [], manager: [] }))
const { applied: appliedFilters, draft: draftFilters, activeCount: filterCount, open: openFilterDraft, confirm: confirmFilterDraft, cancel: cancelFilterDraft, clear: clearFilterDraft, reset: resetFilterDraft } = filterDraft

const keyword = ref('')
const filterOpen = ref(false)
const filterAnchor = ref<HTMLElement | null>(null)
const rows = computed(() => props.projects)
const filteredRows = computed(() => filterPerformanceProjects(rows.value, {
  keyword: keyword.value,
  statuses: appliedFilters.value.status,
  managers: appliedFilters.value.manager,
}))
const filterActive = computed(() => Boolean(keyword.value.trim()) || filterCount.value > 0)
const total = computed(() => filterActive.value ? filteredRows.value.length : (props.projectCount || filteredRows.value.length))
const columns: PerformanceTableColumn[] = [
  { key: 'name', label: '项目名称', width: 250 },
  { key: 'description', label: '描述', width: 251 },
  { key: 'administrators', label: '项目管理员', width: 120 },
  { key: 'status', label: '状态', width: 110 },
  { key: 'evaluated_count', label: '评估人数', width: 148 },
  { key: 'action', label: '操作', width: 180, fixed: 'right' },
]
const filterFields = computed<PerformanceFilterFieldDescriptor[]>(() => [
  { key: 'status', label: '状态', type: 'select', multiple: true, autoHeight: true, placeholder: '请选择', options: PERFORMANCE_PROJECT_STATUS_OPTIONS },
  { key: 'manager', label: '项目管理员', type: 'person', multiple: false, placeholder: '请搜索', emptyText: '周期人员中暂无匹配人员', loadingText: '搜索中', loadOptions: loadManagerOptions },
])

function canManage(project: PerformanceCycleProjectShell) {
  return props.canCreate || props.managedProjectRefs.includes(project.project_ref)
}
function projectRow(row: unknown) {
  return row as PerformanceCycleProjectShell
}
function projectStatus(project: PerformanceCycleProjectShell) {
  return PERFORMANCE_PROJECT_STATUS_META[performanceProjectStatusKey(project)]
}
async function loadManagerOptions(keyword: string): Promise<PerformanceSearchSelectOption[]> {
  if (!props.cycleId) return []
  const page = await performanceCycleApi.listPeoplePage(props.cycleId, { keyword, offset: 0, limit: 20 })
  const seen = new Set<string>()
  const options: PerformanceSearchSelectOption[] = []
  for (const person of page.items) {
    const name = person.display_name?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    options.push({
      value: name,
      label: name,
      subLabel: person.department || person.organization_ref || undefined,
      avatarFallback: name.slice(-1),
      searchText: `${name} ${person.employee_no} ${person.department || ''}`,
    })
  }
  return options
}
function toggleFilter(anchor?: HTMLElement) {
  if (filterOpen.value) { cancelFilter(); return }
  if (anchor instanceof HTMLElement) filterAnchor.value = anchor
  openFilterDraft()
  filterOpen.value = true
}
function confirmFilter() {
  confirmFilterDraft()
  filterOpen.value = false
}
function cancelFilter() {
  cancelFilterDraft()
  filterOpen.value = false
}
function clearFilter() {
  clearFilterDraft()
}
watch(() => props.cycleId, () => {
  resetFilterDraft()
  filterOpen.value = false
  filterAnchor.value = null
})
</script>

<template>
  <section class="project-settings" aria-labelledby="project-settings-title">
    <div class="project-heading">
      <h3 id="project-settings-title">项目设置</h3>
    </div>
    <PerformanceListToolbar class="project-tools" :keyword="keyword" search-width="var(--performance-project-search-width)" search-placeholder="通过项目名称搜索" :filter-active="filterCount > 0" :filter-count="filterCount" @update:keyword="keyword = $event" @filter="toggleFilter">
      <template #left>
        <PerformancePermissionButton op="C" :allowed="canCreate" variant="primary" class="project-create primary-button" aria-label="新建项目" @click="emit('create')">
          <span aria-hidden="true">＋</span> 新建
        </PerformancePermissionButton>
      </template>
    </PerformanceListToolbar>
    <PerformanceFilterPopover :visible="filterOpen" :anchor="filterAnchor" aria-label="项目筛选" @close="cancelFilter">
      <PerformanceFilterField v-for="field in filterFields" :key="field.key" v-model="draftFilters[field.key]" :field="field" />
      <template #footer>
        <PerformanceFilterActions @confirm="confirmFilter" @cancel="cancelFilter" @clear="clearFilter" />
      </template>
    </PerformanceFilterPopover>
    <div class="project-table-wrap">
      <PerformanceManagementTable
        :rows="filteredRows"
        :columns="columns"
        :loading="false"
        loading-text="正在加载项目..."
        empty-text="暂无项目"
        table-aria-label="项目设置表格"
        pagination-aria-label="项目分页"
        :total="total"
      >
        <template #cell="{ row, column, value }">
          <span v-if="column.key === 'description'">{{ value || '--' }}</span>
          <div v-else-if="column.key === 'administrators'" class="project-administrators-cell">
            <div v-if="projectRow(row).administrators.length" class="project-administrators">
              <PerformanceMemberIdentity v-for="(name, index) in projectRow(row).administrators" :key="index" :display-name="name" size="sm" tag />
            </div>
            <span v-else>--</span>
          </div>
          <span v-else-if="column.key === 'status'" class="project-status" :style="{ '--project-status-color': projectStatus(projectRow(row)).color }"><i />{{ projectStatus(projectRow(row)).label }}</span>
          <PerformanceProjectActions
            v-else-if="column.key === 'action'"
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
          <span v-else>{{ value }}</span>
        </template>
      </PerformanceManagementTable>
    </div>
  </section>
</template>

<style scoped>
.project-settings { min-width: 0; }
.project-heading h3 { margin: 0 0 var(--spacing-4); color: var(--color-text-primary); font-size: 18px; font-weight: 600; line-height: 26px; }
.project-tools { margin-bottom: var(--spacing-4); }
.project-tools :deep(.list-toolbar) { margin-bottom: 0; }
.project-administrators-cell { padding-block: var(--spacing-3); }
.project-administrators { display: flex; flex-direction: column; align-items: flex-start; gap: var(--performance-project-administrator-gap); }
.project-administrators :deep(.member-identity) { max-width: 100%; min-height: var(--performance-icon-button-size); color: var(--color-text-primary); }
.project-administrators :deep(.member-name) { max-width: var(--performance-project-administrator-name-width); color: inherit; }
.project-create { width: var(--performance-button-min-width); }
.project-table-wrap { min-width: 0; }
.project-table-wrap :deep(.el-table td.el-table__cell) { padding-left: 0; padding-right: 0; }
.project-status { display: inline-flex; align-items: center; gap: var(--spacing-2); white-space: nowrap; }
.project-status i { width: var(--performance-project-status-dot-size); height: var(--performance-project-status-dot-size); border-radius: 50%; background: var(--project-status-color); }
</style>
