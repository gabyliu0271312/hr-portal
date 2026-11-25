<template>
  <div class="report-comparison" :data-comparison="kind">
    <div v-if="unavailableMessage && !showExample" class="comparison-unavailable" role="status"><span>{{ unavailableMessage }}</span><button v-if="allowExamples" type="button" class="example-button" @click="showExample = true">查看示例</button></div>
      <div v-if="showExample" class="comparison-example-notice" role="status">示例数据，仅用于展示图表效果，不代表真实绩效结果。<button type="button" @click="showExample = false">关闭示例</button></div>
      <div class="comparison-mark-label"><span class="focus-stripe-icon" aria-hidden="true" /><span>重点关注区域</span></div>
      <PerformanceComparisonMatrix :rows="rows" :columns="columns" :cells="cells" :denominator="displayComparison.total" :row-dimension-options="yOptions" :column-dimension-options="xOptions" :row-dimension="displayComparison.yKey" :column-dimension="displayComparison.xKey" :row-label-prefix="kind === 'history' ? '本期终评：' : '终评：'" :column-label-prefix="kind === 'self-final' ? '自评：' : kind === 'history' ? '历史终评：' : '终评：'" :row-missing-label="rowMissingLabel" :column-missing-label="columnMissingLabel" :focus-areas="focusAreas" @dimension-change="changeDimension" @cell="!showExample && emit('cell', $event)">
        <template v-if="kind === 'history' && !showExample && comparison.historyCycles?.length" #column-selector><PerformanceReportCycleSelector axis="x" :label="historyLabel" :cycles="comparison.historyCycles || []" :selected-cycle="comparison.historyCycleId ?? undefined" :selected-key="comparison.xKey" :load-options="historyLoader" @select="(historyCycleId, xKey) => emit('change', { historyCycleId, xKey })" /></template>
        <template v-if="kind === 'history' && !showExample && comparison.yOptions?.length" #row-selector><PerformanceReportCycleSelector axis="y" :label="`${cycleName || '本期绩效'}：${comparison.yLabel || '未配置评估项'}`" :cycles="[{ id: 0, name: cycleName || '本期绩效' }]" :selected-cycle="0" :selected-key="comparison.yKey" :load-options="currentLoader" @select="(_cycle, yKey) => emit('change', { yKey })" /></template>
      </PerformanceComparisonMatrix>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PerformanceComparisonMatrix from './PerformanceComparisonMatrix.vue'
import PerformanceReportCycleSelector from './PerformanceReportCycleSelector.vue'
import type { PerformanceComparisonCellData, PerformanceComparisonFocusArea, PerformanceComparisonOption } from './performanceComparison'
import { mockProjectReportComparison, type ProjectReportComparisonData, type ReportRating, type ReportIndicator } from './projectStatisticsReport'
const props = withDefaults(defineProps<{ comparison: ProjectReportComparisonData; kind?: 'self-final' | 'dimension' | 'history'; allowExamples?: boolean; cycleName?: string; loadHistory?: (cycleId: number) => Promise<ReportIndicator[]> }>(), { kind: 'self-final', allowExamples: true })
const emit = defineEmits<{ change: [query: { xKey?: string; yKey?: string; historyCycleId?: number }]; cell: [cell: { rowKey: string; columnKey: string; count: number }] }>()
const showExample = ref(false)
watch([() => props.comparison, () => props.kind, () => props.allowExamples], () => { showExample.value = false })
const unavailableMessage = computed(() => props.comparison.emptyReason === 'INSUFFICIENT_DIMENSIONS' ? '当前绩效周期可对比的绩效维度不足两个，暂无维度对比数据' : props.comparison.emptyReason === 'NO_HISTORY' ? '暂无可对比的历史绩效周期' : props.comparison.emptyReason || '')
const displayComparison = computed(() => props.allowExamples && showExample.value ? mockProjectReportComparison() : props.comparison)
const toOptions = (ratings: ReportRating[]): PerformanceComparisonOption[] => ratings.map(rating => ({ value: rating.key, label: rating.label, color: rating.color }))
const rows = computed(() => toOptions(displayComparison.value.yRatings ?? (props.kind === 'self-final' || showExample.value ? displayComparison.value.ratings : [])))
const columns = computed(() => toOptions(displayComparison.value.xRatings ?? (props.kind !== 'history' || showExample.value ? displayComparison.value.ratings : [])))
const rowMissingLabel = computed(() => props.kind === 'dimension' ? '暂无第二评估项' : props.kind === 'history' ? '未配置本期终评评级' : '未配置终评评级')
const columnMissingLabel = computed(() => props.kind === 'self-final' ? '未配置自评评级' : props.kind === 'history' ? '暂无历史评级' : '未配置评估项评级')
const xOptions = computed(() => displayComparison.value.xOptions?.map(item => ({ value: item.key, label: item.label })) ?? [{ value: displayComparison.value.xKey || 'rating', label: displayComparison.value.xLabel || '绩效评级' }])
const yOptions = computed(() => displayComparison.value.yOptions?.map(item => ({ value: item.key, label: item.label })) ?? [{ value: displayComparison.value.yKey || 'rating', label: displayComparison.value.yLabel || '绩效评级' }])
const historyLabel = computed(() => `${props.comparison.historyCycles?.find(cycle => cycle.id === props.comparison.historyCycleId)?.name || '历史绩效'}：${props.comparison.xLabel || '请选择评估项'}`)
const historyLoader = computed(() => props.loadHistory || (async (cycleId: number) => {
  if (cycleId !== props.comparison.historyCycleId) throw new Error('HISTORY_PROVIDER_REQUIRED')
  return props.comparison.xOptions || []
}))
const currentLoader = computed(() => { const options = props.comparison.yOptions || []; return async () => options })
const cells = computed<PerformanceComparisonCellData[][]>(() => rows.value.map((_, row) => columns.value.map((_, column) => {
  const count = displayComparison.value.counts[row]?.[column] ?? 0
  const level = displayComparison.value.heatLevels[row]?.[column]
  return { count, heatLevel: count > 0 && (level === 1 || level === 2 || level === 3) ? level : undefined }
})))
const focusAreas = computed<PerformanceComparisonFocusArea[]>(() => {
  const rowSpan = Math.min(2, rows.value.length)
  const columnSpan = Math.min(2, columns.value.length)
  if (rows.value.length < 2 || columns.value.length < 2) return []
  return [{ side: 'right', rowStart: 1, rowSpan, columnSpan }, { side: 'left', rowStart: rows.value.length - rowSpan + 1, rowSpan, columnSpan }]
})
function changeDimension(axis: 'x' | 'y', key: string) { if (!showExample.value) emit('change', axis === 'x' ? { xKey: key } : { yKey: key }) }
</script>

<style scoped>
.report-comparison { position: relative; min-width: 0; margin-bottom: 0; color: rgba(0,0,0,.65); font-size: 14px; line-height: 22px; }
.comparison-mark-label { position: absolute; top: -34px; right: 0; display: flex; align-items: center; gap: 8px; height: 26px; margin-bottom: 8px; white-space: nowrap; }
.focus-stripe-icon { display: block; width: 15px; height: 15px; border: 1px solid #ffb34d; box-sizing: border-box; background: repeating-linear-gradient(135deg, rgba(255,179,77,.08) 0 2px, rgba(255,179,77,.45) 2px 3px, rgba(255,179,77,.08) 3px 6px); }
.comparison-unavailable { display: flex; align-items: center; flex-wrap: wrap; margin-bottom: 16px; gap: 12px; color: var(--color-text-secondary, #646a73); }
.example-button, .comparison-example-notice button { padding: 0; border: 0; background: transparent; color: var(--color-primary); font: inherit; cursor: pointer; }
.comparison-example-notice { margin-bottom: 16px; padding: 8px 12px; background: #f0f4ff; }.comparison-example-notice button { margin-left: 12px; }.history-cycle-control { width: 240px; max-width: 100%; margin-bottom: 16px; }.history-cycle-select { width: 100%; }
</style>
