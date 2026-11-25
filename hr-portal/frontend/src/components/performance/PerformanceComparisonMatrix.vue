<template>
  <div class="performance-comparison-matrix">
    <div class="comparison-table-shell">
      <div class="comparison-axis comparison-axis-y">
        <div class="comparison-corner" aria-hidden="true" />
        <div class="y-axis-body" :style="bodyStyle">
          <slot name="row-selector"><PerformanceComparisonDimensionSelector :model-value="selectedRow" axis="y" :label-prefix="rowLabelPrefix" :options="rowDimensionOptions" @update:model-value="changeDimension('y', $event)" /></slot>
          <div class="row-labels"><div v-for="row in rows" :key="row.value" class="row-label"><PerformanceRatingTag :label="row.label" :color="row.color" /></div><div v-if="!rows.length" class="row-label comparison-axis-missing">{{ rowMissingLabel }}</div></div>
        </div>
      </div>
      <div class="comparison-axis comparison-axis-x" :style="{ minWidth: `${columns.length ? columns.length * 132 : 200}px` }">
        <slot name="column-selector"><PerformanceComparisonDimensionSelector :model-value="selectedColumn" axis="x" :label-prefix="columnLabelPrefix" :options="columnDimensionOptions" @update:model-value="changeDimension('x', $event)" /></slot>
        <div class="column-labels" :style="gridStyle"><div v-for="column in columns" :key="column.value" class="column-label"><PerformanceRatingTag :label="column.label" :color="column.color" /></div><div v-if="!columns.length" class="column-label comparison-axis-missing">{{ columnMissingLabel }}</div></div>
        <div class="matrix-body" :style="bodyStyle">
          <div v-if="hasAxes" class="matrix-grid" :style="gridStyle">
            <template v-for="(row, rowIndex) in rows" :key="row.value">
              <div v-for="(column, columnIndex) in columns" :key="column.value" class="performance-comparison-cell" :class="heatClass(rowIndex, columnIndex)" :aria-label="cellLabel(rowIndex, columnIndex)" @click="emit('cell', { rowKey: row.value, columnKey: column.value, count: cellAt(rowIndex, columnIndex).count })">
                <template v-if="cellAt(rowIndex, columnIndex).count > 0"><span>{{ percent(cellAt(rowIndex, columnIndex).count) }}%</span><span>{{ cellAt(rowIndex, columnIndex).count }}</span></template>
                <span v-else class="performance-comparison-cell__zero">--</span>
              </div>
            </template>
          </div>
          <div v-if="empty" class="comparison-empty" role="status"><MetricTemplateEmptyIllustration /><span>暂无统计数据</span></div>
          <template v-else><div v-for="(area, index) in focusAreas" :key="`${area.side}-${index}`" class="focus-area" :class="`focus-area-${area.side}`" :style="focusStyle(area)" aria-hidden="true" /></template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import PerformanceComparisonDimensionSelector from './PerformanceComparisonDimensionSelector.vue'
import PerformanceRatingTag from './PerformanceRatingTag.vue'
import MetricTemplateEmptyIllustration from './MetricTemplateEmptyIllustration.vue'
import { reportPercent } from './projectStatisticsReport'
import type { PerformanceComparisonCellData, PerformanceComparisonFocusArea, PerformanceComparisonOption } from './performanceComparison'
const props = withDefaults(defineProps<{
  rows: PerformanceComparisonOption[]; columns: PerformanceComparisonOption[]; cells: PerformanceComparisonCellData[][]; denominator: number
  rowDimensionOptions: PerformanceComparisonOption[]; columnDimensionOptions: PerformanceComparisonOption[]
  rowDimension?: string; columnDimension?: string; rowLabelPrefix?: string; columnLabelPrefix?: string; focusAreas?: PerformanceComparisonFocusArea[]
  rowMissingLabel?: string; columnMissingLabel?: string
}>(), { focusAreas: () => [], rowLabelPrefix: '终评：', columnLabelPrefix: '自评：', rowMissingLabel: '未配置终评评级', columnMissingLabel: '未配置自评评级' })
const emit = defineEmits<{
  'update:rowDimension': [key: string]; 'update:columnDimension': [key: string]; 'dimension-change': [axis: 'x' | 'y', key: string]
  cell: [cell: { rowKey: string; columnKey: string; count: number }]
}>()
const selectedRow = computed(() => props.rowDimension ?? props.rowDimensionOptions[0]?.value ?? '')
const selectedColumn = computed(() => props.columnDimension ?? props.columnDimensionOptions[0]?.value ?? '')
function changeDimension(axis: 'x' | 'y', key: string) {
  if (axis === 'x') emit('update:columnDimension', key)
  else emit('update:rowDimension', key)
  emit('dimension-change', axis, key)
}
const gridStyle = computed(() => ({ gridTemplateColumns: `repeat(${Math.max(1, props.columns.length)}, minmax(132px, 1fr))` }))
const bodyStyle = computed(() => ({ height: `${Math.max(empty.value ? 3 : 1, props.rows.length) * 55}px` }))
const hasAxes = computed(() => props.rows.length > 0 && props.columns.length > 0)
const empty = computed(() => !hasAxes.value || !props.rows.some((_, row) => props.columns.some((_, column) => cellAt(row, column).count > 0)))
const cellAt = (row: number, column: number): PerformanceComparisonCellData => props.cells[row]?.[column] ?? { count: 0 }
const heatClass = (row: number, column: number) => { const cell = cellAt(row, column); return cell.count > 0 && cell.heatLevel ? `heat-${cell.heatLevel}` : '' }
const percent = (count: number) => reportPercent(count, props.denominator)
const cellLabel = (row: number, column: number) => `${props.rows[row]?.label || ''}，${props.columns[column]?.label || ''}，${cellAt(row, column).count ? `${percent(cellAt(row, column).count)}%，${cellAt(row, column).count}人` : '无数据'}`
const focusStyle = (area: PerformanceComparisonFocusArea) => ({
  top: `${Math.max(0, area.rowStart - 1) * 55}px`,
  height: `${Math.max(0, Math.min(area.rowSpan, props.rows.length - area.rowStart + 1)) * 55 - 1}px`,
  width: `${Math.min(area.columnSpan, props.columns.length) / Math.max(1, props.columns.length) * 100}%`,
})
</script>

<style scoped>
.performance-comparison-matrix { position: relative; min-width: 0; }
.comparison-table-shell { display: flex; width: 100%; min-width: 0; overflow-x: auto; border-top: 1px solid #dee0e3; }
.comparison-axis-y { position: relative; flex: 0 0 122px; width: 122px; border-right: 1px solid #dee0e3; }
.comparison-corner { height: 102px; border-bottom: 1px solid #dee0e3; background: #f8f9fa; box-sizing: border-box; }
.y-axis-body { position: relative; display: flex; background: #f8f9fa; }
.row-labels { position: absolute; inset: 0 0 0 44px; border-left: 1px solid #dee0e3; }
.row-label { display: flex; align-items: center; height: 55px; padding-left: 12px; border-bottom: 1px solid #eff0f1; box-sizing: border-box; }
.comparison-axis-x { position: relative; flex: 1 0 0; }
.column-labels { display: grid; height: 54px; border-bottom: 1px solid #dee0e3; box-sizing: border-box; }
.column-label { display: flex; align-items: center; justify-content: flex-end; padding: 15px 12px; box-sizing: border-box; }
.comparison-axis-missing { color: var(--color-text-tertiary, #8f959e); font-size: 12px; overflow-wrap: anywhere; }
.row-label.comparison-axis-missing { height: auto; min-height: 55px; padding: 8px; }
.matrix-body { position: relative; overflow: hidden; }
.matrix-grid { display: grid; grid-auto-rows: 55px; width: 100%; }
.performance-comparison-cell { display: flex; flex-direction: column; align-items: flex-end; justify-content: center; height: 55px; padding: 5px 12px; border-bottom: 1px solid #eff0f1; box-sizing: border-box; color: #133c9a; font-variant-numeric: tabular-nums; line-height: 22px; }
.heat-1 { background: #e1eaff; }.heat-2 { background: #bacefd; }.heat-3 { background: #82a7fc; color: #fff; }
.heat-1:hover, .heat-2:hover, .heat-3:hover { background: #bacefd; }
.performance-comparison-cell__zero { color: #8f959e; }
.comparison-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #8f959e; pointer-events: none; }
.comparison-empty :deep(svg) { max-width: 80%; height: 110px; }
.focus-area { position: absolute; z-index: 2; pointer-events: none; border: 1px solid #ffb34d; border-radius: 4px; box-sizing: border-box; background: repeating-linear-gradient(135deg, rgba(255,179,77,.05) 0 2px, rgba(255,179,77,.38) 2px 3px, rgba(255,179,77,.05) 3px 6px); }
.focus-area-left { left: 0; }.focus-area-right { right: 0; }
</style>
