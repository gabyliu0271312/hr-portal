<template>
  <div class="report-comparison" data-comparison="self-final">
    <div class="comparison-mark-label">
      <span class="focus-stripe-icon" aria-hidden="true" />
      <span>重点关注区域</span>
    </div>
    <PerformanceComparisonMatrix
      :rows="ratings"
      :columns="ratings"
      :cells="cells"
      :denominator="comparison.total"
      :row-dimension-options="dimensionOptions"
      :column-dimension-options="dimensionOptions"
      :focus-areas="focusAreas"
    />
    <PerformanceReportCommentButton />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import PerformanceComparisonMatrix from './PerformanceComparisonMatrix.vue'
import PerformanceReportCommentButton from './PerformanceReportCommentButton.vue'
import type { PerformanceComparisonCellData, PerformanceComparisonFocusArea, PerformanceComparisonOption } from './performanceComparison'
import type { ProjectReportComparison } from './projectStatisticsReport'

const props = defineProps<{ comparison: ProjectReportComparison }>()
const ratings = computed<PerformanceComparisonOption[]>(() => props.comparison.ratings.map(rating => ({ value: rating.key, label: rating.label, color: rating.color })))
const dimensionOptions: PerformanceComparisonOption[] = [{ value: 'rating', label: '绩效评级' }]
const cells = computed<PerformanceComparisonCellData[][]>(() => props.comparison.counts.map((row, rowIndex) => row.map((count, columnIndex) => ({ count, heatLevel: count > 0 ? props.comparison.heatLevels[rowIndex][columnIndex] as 1 | 2 | 3 : undefined }))))
const focusAreas: PerformanceComparisonFocusArea[] = [
  { side: 'right', rowStart: 1, rowSpan: 2, columnSpan: 2 },
  { side: 'left', rowStart: 6, rowSpan: 2, columnSpan: 2 },
]
</script>

<style scoped>
.report-comparison { position: relative; min-width: 0; margin-bottom: 0; color: rgba(0, 0, 0, .65); font-size: 14px; line-height: 22px; }
.comparison-mark-label { position: absolute; top: -34px; right: 0; display: flex; align-items: center; gap: 8px; height: 26px; margin-bottom: 8px; white-space: nowrap; }
.focus-stripe-icon { display: block; width: 15px; height: 15px; border: 1px solid #ffb34d; box-sizing: border-box; background: repeating-linear-gradient(135deg, rgba(255, 179, 77, .08) 0 2px, rgba(255, 179, 77, .45) 2px 3px, rgba(255, 179, 77, .08) 3px 6px); }
</style>
