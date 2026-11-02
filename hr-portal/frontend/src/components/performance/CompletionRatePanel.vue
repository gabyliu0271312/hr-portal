<template>
  <PerformanceSurfaceCard title="完成率">
    <div class="toolbar">
      <PerformanceSegmentedControl :model-value="viewMode" :options="viewOptions" aria-label="完成率查看维度" @update:model-value="selectViewMode" />
      <PerformanceFilterButton disabled />
    </div>
    <div v-if="viewMode === 'by-org'" class="department-view">
      <div v-if="departmentLoading" class="department-state">正在加载组织完成率…</div>
      <div v-else-if="departmentError" class="department-state department-state--error">{{ departmentError }}<button type="button" @click="loadDepartment">重新加载</button></div>
      <div v-else class="department-table-wrap">
        <table class="department-table">
          <thead>
            <tr>
              <th class="department-name-cell"><PerformanceSortHeader label="部门" :order="orderOf('department')" align="left" @click="sortBy('department')" /></th>
              <th v-for="column in departmentColumns" :key="column.key"><PerformanceSortHeader :label="column.title" :order="orderOf(column.key)" @click="sortBy(column.key)" /></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in departmentRows" :key="row.id || row.department">
              <td class="department-name-cell" :style="{ paddingLeft: `${12 + row.depth * 24}px` }"><button v-if="row.children?.length" class="expand-button" type="button" :aria-label="`展开${row.department}`" :aria-expanded="expanded.has(row.id || row.department)" @click="toggleDepartment(row.id || row.department)"><svg viewBox="0 0 12 12" :class="{ expanded: expanded.has(row.id || row.department) }"><path d="M4 2 8 6 4 10Z" fill="currentColor" /></svg></button><span v-else class="expand-spacer" />{{ row.department }}</td>
              <td v-for="column in departmentColumns" :key="column.key" :class="{ 'is-progress': row.metrics[column.key]?.completion_rate < 100 }">
                <button v-if="row.metrics[column.key]" class="rate-link" type="button" :title="`查看${row.department}「${column.title}」未完成人员`" @click="emit('action', { action: 'remind', nodeKey: column.key, title: column.title, departmentPath: row.id || row.department, description: reminderMetricsForRate({ completionRate: row.metrics[column.key].completion_rate, completed: row.metrics[column.key].completed_count, total: row.metrics[column.key].total_count }) })">
                  <span>{{ formatRate(row.metrics[column.key]?.completion_rate) }}</span>
                  <small>{{ row.metrics[column.key]?.completed_count }}/{{ row.metrics[column.key]?.total_count }}</small>
                </button>
                <span v-else>{{ formatRate(undefined) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div v-else class="node-grid">
      <CompletionNodeCard v-for="node in nodes" :key="node.key" :node="node">
        <template v-if="node.key === 'view-result'" #header-extra>
          <PerformanceSegmentedControl v-model="resultView" size="sm" :options="resultOptions" aria-label="结果查看维度" />
        </template>
        <template v-if="node.canRemind" #actions>
          <PerformanceTextButton class="node-action" label="去催办" @click="emit('action', { action: 'remind', nodeKey: node.key, title: node.reminderTitle || node.title, description: reminderMetrics(node) })" />
        </template>
        <template v-else-if="node.key === 'view-result' && node.status !== 'unavailable'" #actions>
          <PerformanceTextButton class="node-action" label="去开通" @click="emit('action', { action: 'enable-result', nodeKey: node.key, title: node.title, description: '' })" />
        </template>
      </CompletionNodeCard>
    </div>
  </PerformanceSurfaceCard>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { ProjectManagementDepartmentCompletion, ProjectManagementDepartmentRow } from '@/api/performance'
import PerformanceSurfaceCard from './PerformanceSurfaceCard.vue'
import PerformanceSegmentedControl from './PerformanceSegmentedControl.vue'
import PerformanceFilterButton from './PerformanceFilterButton.vue'
import PerformanceSortHeader from './PerformanceSortHeader.vue'
import { nextPerformanceSort, sortPerformanceRows, type PerformanceSortOrder } from './performanceTableSort'
import PerformanceTextButton from './PerformanceTextButton.vue'
import CompletionNodeCard, { type CompletionNode } from './CompletionNodeCard.vue'
import ViewVideoOutlinedIcon from './ViewVideoOutlinedIcon.vue'
import OrganizationOutlinedIcon from './OrganizationOutlinedIcon.vue'

const props = defineProps<{ nodes: CompletionNode[]; cycleId?: number; departmentProvider?: (cycleId: number) => Promise<ProjectManagementDepartmentCompletion>; viewMode?: string }>()
const emit = defineEmits<{ action: [payload: { action: 'remind' | 'enable-result'; nodeKey: string; title: string; description?: string; departmentPath?: string }]; 'update:viewMode': [value: string] }>()
const viewMode = computed(() => props.viewMode || 'by-person')
const viewOptions = [
  { value: 'by-person', label: '全部', icon: ViewVideoOutlinedIcon },
  { value: 'by-org', label: '按部门', icon: OrganizationOutlinedIcon },
]
const resultView = ref('opened')
const resultOptions = [{ value: 'opened', label: '已开通' }, { value: 'reconsidered', label: '已复议', disabled: true }]
const departmentLoading = ref(false)
const departmentError = ref('')
const departmentData = ref<ProjectManagementDepartmentCompletion | null>(null)
const departmentColumns = computed(() => departmentData.value?.columns || [])
const expanded = ref(new Set<string>())
const sortKey = ref('')
const sortOrder = ref<PerformanceSortOrder>('')
const departmentRows = computed(() => {
  const flatten = (rows: ProjectManagementDepartmentRow[], depth = 0): Array<ProjectManagementDepartmentRow & { depth: number }> => sortPerformanceRows(rows, sortKey.value, sortOrder.value, (row, key) => key === 'department' ? row.department : row.metrics[key]?.completion_rate).flatMap(row => [
    { ...row, depth }, ...(expanded.value.has(row.id || row.department) ? flatten(row.children || [], depth + 1) : []),
  ])
  return flatten(departmentData.value?.rows || [])
})
function toggleDepartment(key: string) { const next = new Set(expanded.value); if (next.has(key)) next.delete(key); else next.add(key); expanded.value = next }
function sortBy(key: string) { const next = nextPerformanceSort(sortKey.value, sortOrder.value, key); sortKey.value = next.key; sortOrder.value = next.order }
function selectViewMode(value: string) {
  if (value === viewMode.value) return
  emit('update:viewMode', value)
}
function orderOf(key: string) { return sortKey.value !== key || !sortOrder.value ? null : sortOrder.value === 'asc' ? 'ascending' : 'descending' }

function formatRate(value: number | undefined) { return `${Number(value || 0).toFixed(2)}%` }
function reminderMetrics(node: CompletionNode) {
  const deadline = node.deadline ? node.deadline.replace('（已截止）', '') : '--'
  return `完成率：${node.progress}　|　完成情况：${node.completionStatus || '--'}　|　截止时间：${deadline}`
}
function reminderMetricsForRate(value: { completionRate: number; completed: number; total: number }) {
  return `完成率：${formatRate(value.completionRate)}　|　完成情况：${value.completed}/${value.total}`
}
async function loadDepartment() {
  if (!props.cycleId || !props.departmentProvider) return
  departmentLoading.value = true
  departmentError.value = ''
  const requestedCycle = props.cycleId
  try { const data = await props.departmentProvider(requestedCycle); if (props.cycleId === requestedCycle) departmentData.value = data } catch { if (props.cycleId === requestedCycle) departmentError.value = '组织完成率加载失败，请稍后重试' } finally { if (props.cycleId === requestedCycle) departmentLoading.value = false }
}
watch(() => props.viewMode, (value) => { if (value === 'by-org') void loadDepartment() }, { immediate: true })
watch(() => props.cycleId, () => { departmentData.value = null; expanded.value = new Set(); if (viewMode.value === 'by-org') void loadDepartment() })
</script>

<style scoped>
.toolbar { display: flex; height: 32px; flex: none; justify-content: space-between; }
.node-grid { display: grid; flex: 1; min-width: 0; min-height: 0; padding-top: 16px; gap: 16px; grid-template-columns: repeat(3, minmax(0, 1fr)); align-content: start; }
.node-action { margin: -2px -4px -2px 16px; }
.department-view { min-width: 0; padding-top: 16px; }
.department-table-wrap { overflow-x: auto; border-top: 1px solid rgba(31,35,41,.15); }
.department-table { width: max-content; min-width: 100%; border-collapse: separate; border-spacing: 0; color: #1f2329; font-size: 14px; table-layout: fixed; }
.department-table th, .department-table td { height: 52px; padding: 12px; border-bottom: 1px solid rgba(31,35,41,.12); box-sizing: border-box; white-space: nowrap; text-align: center; }
.department-table th { height: 68px; color: #646a73; font-weight: 400; white-space: normal; vertical-align: middle; }
.department-table th:not(.department-name-cell), .department-table td:not(.department-name-cell) { min-width: 144px; }
.department-name-cell { width: 240px; min-width: 240px; text-align: left!important; }
.department-table td:not(.department-name-cell) span, .department-table td:not(.department-name-cell) small { display: block; }
.department-table td:not(.department-name-cell) span { color: #1f2329; font-size: 14px; line-height: 22px; }
.department-table td.is-progress .rate-link span { color: #3370ff; }
.rate-link { display: block; width: 100%; padding: 0; border: 0; background: transparent; cursor: pointer; font-family: inherit; }
.rate-link:focus-visible { outline: 0; box-shadow: 0 0 0 2px rgba(51,112,255,.35); }
.department-table small { color: #1f2329; font-size: 12px; line-height: 20px; }
.sort-glyph { display: inline-block; margin-left: 6px; color: #8f959e; font-size: 13px; }
.expand-glyph { display: inline-block; margin: 0 16px 0 12px; color: #646a73; font-size: 20px; line-height: 12px; }
.department-state { display: grid; min-height: 220px; place-items: center; gap: 8px; color: #646a73; }
.department-state--error { color: #d14343; }
.department-state button { border: 0; background: transparent; color: #3370ff; cursor: pointer; font: inherit; }
</style>

<style scoped>
.expand-button, .expand-spacer { display:inline-flex; width:20px; height:24px; margin-right:8px; align-items:center; justify-content:center; border:0; padding:0; background:transparent; color:#646a73; vertical-align:middle; }
.expand-button { cursor:pointer; }
.expand-button svg { width:12px; height:12px; }
.expand-button svg.expanded { transform:rotate(90deg); }
.department-name-cell { position:sticky; left:0; background:#fff; border-right:1px solid #dee0e3; z-index:1; }
.department-table small { color:inherit; }
.department-table td.is-progress .rate-link small { color:#3370ff; }
.department-table th :deep(.sort-header-label) { white-space:normal; }
</style>
