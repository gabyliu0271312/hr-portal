<template>
  <div ref="root" class="report-matrix">
    <div class="matrix-toolbar"><span class="matrix-rating-tab">绩效评级</span></div>
    <div class="matrix-scroll">
      <el-table ref="table" :data="rows" row-key="id" :fit="false" :max-height="496" style="width: 100%" :default-sort="{ prop: 'total', order: 'descending' }" :row-class-name="rowClassName" empty-text="暂无部门统计数据" @sort-change="sort = { prop: $event.prop ?? 'total', order: $event.order }" :expand-row-keys="expandedKeys" @expand-change="(row, expanded) => updateExpanded(row.id, expanded)">
        <el-table-column prop="name" label="部门" min-width="240" fixed="left" class-name="matrix-department-column">
          <template #default="{ row }">
            <div class="matrix-department" :style="{ paddingLeft: `${row.depth * 16}px` }">
              <PerformanceIconButton v-if="row.children?.length" class="matrix-tree-toggle" :class="{ expanded: expandedKeys.includes(row.id) }" icon="ExpandRightFilled" :label="`${expandedKeys.includes(row.id) ? '收起' : '展开'}${row.name}`" :expanded="expandedKeys.includes(row.id)" @click="table?.toggleRowExpansion(row)" />
              <span v-else class="matrix-tree-placeholder" aria-hidden="true" />
              <span class="matrix-department-name" :title="row.name">{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column v-for="(rating, index) in report.ratings" :key="rating.key" :label="rating.label" :min-width="index === report.ratings.length - 1 ? lastRatingWidth : 140" align="right" sortable="custom" :prop="rating.key" class-name="matrix-rating-column">
          <template #header>
            <PerformanceSortHeader :label="rating.label" :order="sort.prop === rating.key ? sort.order : null" @click="changeSort(rating.key)">
              <PerformanceRatingTag :label="rating.label" :color="rating.color" />
            </PerformanceSortHeader>
          </template>
          <template #default="{ row }">
            <div v-if="row.counts[rating.key]" class="matrix-value" :class="heatClass(row.heatLevels?.[rating.key])">
              <span>{{ reportPercent(row.counts[rating.key], row.total) }}%</span><span>{{ row.counts[rating.key] }}</span>
            </div>
            <div v-else class="matrix-zero">--</div>
          </template>
        </el-table-column>
        <el-table-column prop="total" label="总人数" min-width="110" fixed="right" align="right" sortable="custom" class-name="matrix-total-column">
          <template #header><PerformanceSortHeader label="总人数" :order="sort.prop === 'total' ? sort.order : null" @click="changeSort('total')" /></template>
          <template #default="{ row }"><div class="matrix-total">{{ row.total }}</div></template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElTable, ElTableColumn, type TableInstance } from 'element-plus'
import PerformanceIconButton from './PerformanceIconButton.vue'
import PerformanceRatingTag from './PerformanceRatingTag.vue'
import PerformanceSortHeader from './PerformanceSortHeader.vue'
import { reportPercent, reportTotal, type ProjectStatisticsReport, type ReportDepartment } from './projectStatisticsReport'

const props = defineProps<{ report: ProjectStatisticsReport }>()
const root = ref<HTMLElement | null>(null)
const table = ref<TableInstance>()
const tableWidth = ref(0)
const lastRatingWidth = computed(() => Math.max(140, tableWidth.value - 240 - 110 - Math.max(0, props.report.ratings.length - 1) * 140))
interface MatrixRow extends Omit<ReportDepartment, 'children'> { total: number; depth: number; children?: MatrixRow[] }
const expandedKeys = ref<string[]>([])
function updateExpanded(id: string, expanded: unknown) {
  if (typeof expanded !== 'boolean') return
  expandedKeys.value = expanded ? [...new Set([...expandedKeys.value, id])] : expandedKeys.value.filter(key => key !== id)
}
const sort = ref<{ prop: string; order: 'ascending' | 'descending' | null }>({ prop: 'total', order: 'descending' })
function sorted(departments: ReportDepartment[], depth = 0): MatrixRow[] {
  const rows = departments.map(department => ({ ...department, depth, total: reportTotal(department.counts), children: department.children ? sorted(department.children, depth + 1) : undefined }))
  if (!sort.value.order) return rows
  const value = (row: MatrixRow) => sort.value.prop === 'total' ? row.total : (row.counts[sort.value.prop] ?? 0) / (row.total || 1)
  return rows.sort((a, b) => (value(a) - value(b)) * (sort.value.order === 'ascending' ? 1 : -1))
}
const rows = computed<MatrixRow[]>(() => props.report.departments.length ? [
  { id: 'report-summary', name: '汇总', depth: 0, counts: props.report.distribution, heatLevels: props.report.heatLevels, total: reportTotal(props.report.distribution) },
  ...sorted(props.report.departments),
] : [])
const rowClassName = ({ row }: { row: MatrixRow }) => row.id === 'report-summary' ? 'matrix-summary-row' : ''
const heatClass = (level?: number) => level === 1 || level === 2 || level === 3 ? `matrix-heat-${level}` : ''
function changeSort(prop: string) {
  const current = sort.value.prop === prop ? sort.value.order : null
  if (current === 'descending') {
    table.value?.clearSort()
    sort.value = { prop, order: null }
  } else table.value?.sort(prop, current === null ? 'ascending' : 'descending')
}
let resizeObserver: ResizeObserver | undefined
onMounted(() => {
  if (!root.value) return
  tableWidth.value = root.value.getBoundingClientRect().width
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(entries => { tableWidth.value = entries[0]?.contentRect.width ?? tableWidth.value })
    resizeObserver.observe(root.value)
  }
})
onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<style scoped>
.report-matrix { position: relative; min-width: 0; min-height: 200px; }
.matrix-toolbar { display: flex; height: 48px; }
.matrix-rating-tab { display: flex; align-items: center; box-sizing: border-box; height: 32px; padding: 0 16px; border: 1px solid #3370ff; border-radius: 6px; color: #3370ff; font-size: 14px; font-weight: 500; line-height: 22px; }
.matrix-scroll { min-width: 0; overflow-x: auto; }
.report-matrix :deep(.el-table) { --el-table-border-color: #eff0f1; --el-table-header-bg-color: #f8f9fa; --el-table-header-text-color: #646a73; --el-table-text-color: rgba(0, 0, 0, .88); border-radius: 8px 8px 0 0; font-size: 14px; font-weight: 400; }
.report-matrix :deep(.el-table__header-wrapper) { border-top: 1px solid var(--el-table-border-color); border-radius: 8px 8px 0 0; }
.report-matrix :deep(.el-table__header th.el-table__cell) { box-sizing: border-box; height: 55px; padding: 12px; font-weight: 500; }
.report-matrix :deep(.el-table__header .cell) { padding: 0; line-height: 22px; }
.report-matrix :deep(.matrix-rating-column .sort-header-label) { height: 30px; }
.report-matrix :deep(.el-table__header .caret-wrapper) { display: none; }
.report-matrix :deep(.el-table__body-wrapper .el-scrollbar__wrap) { max-height: 440px !important; }
.report-matrix :deep(.el-table__body td.el-table__cell) { box-sizing: border-box; height: 55px; padding: 0; }
.report-matrix :deep(.el-table__body .cell) { padding: 0; font-size: 14px; line-height: 22px; }
.report-matrix :deep(.matrix-department-column .el-table__expand-icon), .report-matrix :deep(.matrix-department-column .el-table__indent), .report-matrix :deep(.matrix-department-column .el-table__placeholder) { display: none; }
.matrix-value, .matrix-zero { box-sizing: border-box; height: 54px; border-radius: 0; font-size: 14px; font-weight: 400; line-height: 22px; text-align: right; font-variant-numeric: tabular-nums; }
.matrix-value { display: flex; flex-direction: column; justify-content: center; padding: 5px 12px; color: rgba(0, 0, 0, .88); }
.matrix-heat-1 { background: #e1eaff; color: #133c9a; }
.matrix-heat-2 { background: #bacefd; color: #133c9a; }
.matrix-heat-3 { background: #82a7fc; color: #fff; }
.matrix-zero { padding: 16px 12px; color: #8f959e; }
.matrix-department { display: flex; align-items: center; height: 54px; }
.matrix-department-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.matrix-tree-toggle { flex: 0 0 16px; width: 16px; height: 16px; margin: 0 4px 0 10px; padding: 3px; border-radius: 4px; color: #646a73; }
.matrix-tree-toggle :deep(svg) { width: 10px; height: 10px; }
.matrix-tree-toggle.expanded :deep(svg) { transform: rotate(90deg); }
.matrix-tree-placeholder { flex: 0 0 26px; }
.matrix-total { box-sizing: border-box; height: 54px; padding-right: 12px; line-height: 54px; text-align: right; font-variant-numeric: tabular-nums; }
</style>
