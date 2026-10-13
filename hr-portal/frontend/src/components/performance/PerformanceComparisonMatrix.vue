<template>
  <div class="performance-comparison-matrix">
    <div class="comparison-table-shell">
      <div class="comparison-axis comparison-axis-y">
        <div class="comparison-corner" aria-hidden="true" />
        <div class="y-axis-body">
          <PerformanceComparisonDimensionSelector v-model="rowDimension" axis="y" label-prefix="终评：" :options="rowDimensionOptions" />
          <div class="row-labels">
            <div v-for="row in rows" :key="row.value" class="row-label">
              <PerformanceRatingTag :label="row.label" :color="row.color" />
            </div>
          </div>
        </div>
      </div>
      <div class="comparison-axis comparison-axis-x">
        <PerformanceComparisonDimensionSelector v-model="columnDimension" axis="x" label-prefix="自评：" :options="columnDimensionOptions" />
        <div class="column-labels">
          <div v-for="column in columns" :key="column.value" class="column-label">
            <PerformanceRatingTag :label="column.label" :color="column.color" />
          </div>
        </div>
        <div class="matrix-body">
          <div class="matrix-grid">
            <template v-for="(row, rowIndex) in cells" :key="rows[rowIndex]?.value || rowIndex">
              <PerformanceComparisonCell
                v-for="(cell, columnIndex) in row"
                :key="`${rowIndex}-${columnIndex}`"
                :count="cell.count"
                :percent="percent(cell.count)"
                :heat-level="cell.heatLevel"
                :label="cellLabel(rowIndex, columnIndex, cell.count)"
              />
            </template>
          </div>
          <div
            v-for="(area, index) in focusAreas"
            :key="`${area.side}-${index}`"
            class="focus-area"
            :class="`focus-area-${area.side}`"
            :style="focusStyle(area)"
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import PerformanceComparisonCell from './PerformanceComparisonCell.vue'
import PerformanceComparisonDimensionSelector from './PerformanceComparisonDimensionSelector.vue'
import PerformanceRatingTag from './PerformanceRatingTag.vue'
import { reportPercent } from './projectStatisticsReport'
import type { PerformanceComparisonCellData, PerformanceComparisonFocusArea, PerformanceComparisonOption } from './performanceComparison'

const props = withDefaults(defineProps<{
  rows: PerformanceComparisonOption[]
  columns: PerformanceComparisonOption[]
  cells: PerformanceComparisonCellData[][]
  denominator: number
  rowDimensionOptions: PerformanceComparisonOption[]
  columnDimensionOptions: PerformanceComparisonOption[]
  focusAreas?: PerformanceComparisonFocusArea[]
}>(), { focusAreas: () => [] })

const rowDimension = ref(props.rowDimensionOptions[0]?.value || '')
const columnDimension = ref(props.columnDimensionOptions[0]?.value || '')
const focusAreas = computed(() => props.focusAreas || [])
const percent = (count: number) => reportPercent(count, props.denominator)
const cellLabel = (rowIndex: number, columnIndex: number, count: number) => `${props.rows[rowIndex]?.label || ''}，${props.columns[columnIndex]?.label || ''}，${count ? `${percent(count)}%，${count}人` : '无数据'}`
const focusStyle = (area: PerformanceComparisonFocusArea) => ({
  top: `${(area.rowStart - 1) * 55}px`,
  height: `${area.rowSpan * 55 - 1}px`,
  width: `calc(${area.columnSpan * 100}% / ${props.columns.length})`,
})
</script>

<style scoped>
.performance-comparison-matrix { position: relative; min-width: 0; }
.comparison-table-shell { display: flex; width: 100%; min-width: 924px; height: 488px; overflow: visible; border-top: 1px solid #dee0e3; }
.comparison-axis-y { position: relative; flex: 0 0 122px; width: 122px; border-right: 1px solid #dee0e3; }
.comparison-corner { height: 102px; border-bottom: 1px solid #dee0e3; background: #f8f9fa; box-sizing: border-box; }
.y-axis-body { position: relative; display: flex; height: 385px; background: #f8f9fa; }
.row-labels { position: absolute; top: 0; right: 0; left: 44px; height: 385px; border-left: 1px solid #dee0e3; }
.row-label { display: flex; align-items: center; justify-content: flex-start; height: 55px; padding-left: 12px; border-bottom: 1px solid #eff0f1; box-sizing: border-box; }
.comparison-axis-x { position: relative; flex: 1 1 auto; min-width: 0; overflow: visible; }
.column-labels { display: grid; grid-template-columns: repeat(7, minmax(132px, 1fr)); height: 54px; border-bottom: 1px solid #dee0e3; }
.column-label { display: flex; align-items: center; justify-content: flex-end; padding: 15px 12px; box-sizing: border-box; }
.matrix-body { position: relative; min-width: 924px; height: 385px; overflow: hidden; }
.matrix-grid { position: relative; z-index: 0; display: grid; grid-template-columns: repeat(7, minmax(132px, 1fr)); grid-template-rows: repeat(7, 55px); width: 100%; height: 385px; }
.focus-area { position: absolute; z-index: 2; pointer-events: none; border: 1px solid #ffb34d; border-radius: 4px; box-sizing: border-box; background: repeating-linear-gradient(135deg, rgba(255, 179, 77, .05) 0 2px, rgba(255, 179, 77, .38) 2px 3px, rgba(255, 179, 77, .05) 3px 6px); }
.focus-area-left { left: 0; }
.focus-area-right { right: 0; }
@media (max-width: 900px) { .comparison-table-shell { overflow-x: auto; } }
</style>
