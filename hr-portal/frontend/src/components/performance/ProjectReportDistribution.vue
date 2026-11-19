<template>
  <div class="report-distribution">
    <div class="distribution-header">
      <PerformanceSegmentedControl class="rating-tabs" :model-value="report.indicatorKey || indicatorOptions[0]?.value || ''" :options="indicatorOptions" aria-label="总览指标" @update:model-value="emit('indicator-change', $event)" />
      <div class="count-info"><span>总人数：{{ report.totalParticipants }}</span><span>已评估人数：{{ evaluated }}</span></div>
    </div>
    <div class="axis-name">人数占比</div>
    <div class="comparison-row">
      <ProjectReportComparisonMenu :groups="comparisonGroups" :selected="selectedKeys" @request="emit('compare', $event)" @toggle="toggleSeries" />
      <span v-for="item in series" :key="item.key" class="series-legend" :style="seriesStyle(item)">{{ item.label }}：{{ reportTotal(item.counts) }}<button type="button" :aria-label="`移除${item.label}`" @click="toggleSeries(item.key)">×</button></span>
    </div>
    <figure class="distribution-figure" :aria-label="`${indicatorLabel}人数占比分布`">
      <div class="chart-scroll">
        <div class="chart">
          <div class="chart-plot">
            <div class="chart-grid" aria-hidden="true"><div v-for="tick in ticks" :key="tick" class="chart-gridline" :style="{ bottom: `${tick / maximum * 100}%` }"><span v-if="tick">{{ tick }}%</span></div></div>
            <div class="chart-columns" :style="{ gridTemplateColumns: `repeat(${Math.max(1, report.ratings.length)}, minmax(0, 1fr))` }">
              <div v-for="rating in report.ratings" :key="rating.key" class="chart-column" tabindex="0" :class="{ 'column-active': activeKey === rating.key }" :aria-label="`${rating.label}：${report.distribution[rating.key] ?? 0}人，占比${reportPercent(report.distribution[rating.key] ?? 0, evaluated)}%`" @mouseenter="activate(rating.key, $event)" @mousemove="activate(rating.key, $event)" @mouseleave="hideTooltip" @focus.self="activate(rating.key, $event, firstBar(rating.key))" @blur="hideTooltip" @keydown.esc="hideTooltip">
                <div class="chart-axis-line" aria-hidden="true" />
                <div v-for="item in series" :key="item.key" class="chart-bar" :data-series="item.key" tabindex="0" :style="{ height: `${Number(share(item, rating.key)) / maximum * 100}%`, ...seriesStyle(item) }" :aria-label="`${item.label}：${share(item, rating.key)}%，${item.counts[rating.key] ?? 0}人`" @mouseenter.stop="activate(rating.key, $event, item.key)" @focus.stop="activate(rating.key, $event, item.key)" @blur="hideTooltip" />
                <span class="chart-label"><PerformanceRatingTag :label="rating.label" :color="rating.color" /></span>
              </div>
            </div>
            <div v-if="activeBar" class="chart-hover-line" aria-hidden="true" :style="{ top: `${100 - Number(share(activeBar, activeKey!)) / maximum * 100}%`, borderColor: activeBar.color }" />
            <div v-if="!hasData" class="distribution-empty" role="status"><MetricTemplateEmptyIllustration /><span>{{ series.length ? '暂无已评估数据' : '请选择对比数据' }}</span></div>
          </div>
        </div>
      </div>
      <Teleport to="body"><div v-if="activeRating" ref="tooltip" class="chart-tooltip" role="tooltip" :style="tooltipStyle"><div class="tooltip-title">{{ indicatorLabel }}（终评）<PerformanceRatingTag :label="activeRating.label" :color="activeRating.color" /></div><div class="tooltip-group-title">我的团队数据</div><div v-for="item in series" :key="item.key" class="tooltip-row"><span class="tooltip-dot" :style="seriesStyle(item)" aria-hidden="true" /><span>{{ item.label }}</span><span class="tooltip-row-value">{{ share(item, activeRating.key) }}% ({{ item.counts[activeRating.key] ?? 0 }} 人)</span></div></div></Teleport>
      <details class="distribution-table"><summary>查看数据表</summary><table><caption>占比按各组已评估人数计算</caption><thead><tr><th>分组</th><th v-for="rating in report.ratings" :key="rating.key">{{ rating.label }}</th></tr></thead><tbody><tr v-for="item in series" :key="item.key"><th>{{ item.label }}</th><td v-for="rating in report.ratings" :key="rating.key">{{ share(item, rating.key) }}% ({{ item.counts[rating.key] ?? 0 }} 人)</td></tr></tbody></table></details>
    </figure>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import PerformanceRatingTag from './PerformanceRatingTag.vue'
import PerformanceSegmentedControl from './PerformanceSegmentedControl.vue'
import ProjectReportComparisonMenu from './ProjectReportComparisonMenu.vue'
import MetricTemplateEmptyIllustration from './MetricTemplateEmptyIllustration.vue'
import { reportPercent, reportTotal, type ProjectStatisticsReport, type ReportDepartment } from './projectStatisticsReport'
type ComparisonDimension = 'team' | 'department' | 'sequence'
const props = defineProps<{ report: ProjectStatisticsReport; comparisonReports?: Partial<Record<ComparisonDimension, ProjectStatisticsReport>> }>()
const emit = defineEmits<{ compare: [dimension: ComparisonDimension]; 'indicator-change': [key: string] }>()
const indicatorLabel = computed(() => props.report.indicatorLabel || props.report.indicators?.find(item => item.key === props.report.indicatorKey)?.label || '绩效评级')
const indicatorOptions = computed(() => props.report.indicators?.length ? props.report.indicators.map(item => ({ value: item.key, label: item.label })) : [{ value: props.report.indicatorKey || '', label: indicatorLabel.value }])
const evaluated = computed(() => reportTotal(props.report.distribution))
const comparisonDimensions = ['team', 'sequence', 'department'] as const
const selectedKeys = ref(['summary'])
const palette = ['#4e83fd', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']
const colorSlots = new Map<string, string>()
const selectedLabels = new Map<string, string>()
function flatten(rows: ReportDepartment[]): ReportDepartment[] { return rows.flatMap(row => [row, ...flatten(row.children || [])]) }
const comparisonGroups = computed(() => Object.fromEntries(comparisonDimensions.map(dimension => {
  const report = props.comparisonReports?.[dimension]
  return [dimension, report && report.indicatorKey === props.report.indicatorKey ? report.departments : []]
})))
const rowsByKey = computed(() => new Map<string, ReportDepartment>(comparisonDimensions.flatMap(dimension => flatten(comparisonGroups.value[dimension]).map(row => [`${dimension}:${row.id}`, row] as const))))
function toggleSeries(key: string) {
  if (selectedKeys.value.includes(key)) selectedKeys.value = selectedKeys.value.filter(value => value !== key)
  else {
    if (key !== 'summary') {
      const row = rowsByKey.value.get(key)
      if (!row) return
      selectedLabels.set(key, row.name)
      if (!colorSlots.has(key)) colorSlots.set(key, palette[colorSlots.size + 1] || '#646a73')
    }
    selectedKeys.value = [...selectedKeys.value, key]
  }
  hideTooltip()
}
const series = computed(() => selectedKeys.value.map(key => {
  if (key === 'summary') return { key, label: '汇总', counts: props.report.distribution, color: palette[0] }
  const row = rowsByKey.value.get(key)
  return { key, label: row?.name || selectedLabels.get(key) || key, counts: row?.counts || {}, color: colorSlots.get(key) || '#646a73' }
}))
const share = (item: typeof series.value[number], key: string) => reportPercent(item.counts[key] ?? 0, reportTotal(item.counts))
function seriesStyle(item: typeof series.value[number]) {
  const slot = [...colorSlots.keys()].indexOf(item.key)
  return { backgroundColor: item.color, backgroundImage: item.color === '#646a73' ? `repeating-linear-gradient(${slot % 2 ? 45 : 135}deg, transparent 0 ${3 + slot % 4}px, rgba(255,255,255,.65) ${3 + slot % 4}px ${5 + slot % 4}px)` : undefined }
}
const hasData = computed(() => series.value.some(item => reportTotal(item.counts) > 0))
const maximum = computed(() => Math.max(10, Math.ceil(Math.max(0, ...series.value.flatMap(item => props.report.ratings.map(rating => Number(share(item, rating.key))))) / 10) * 10))
const ticks = computed(() => Array.from({ length: maximum.value / 10 + 1 }, (_, i) => i * 10))
const activeKey = ref<string | null>(null)
const activeSeriesKey = ref<string | null>(null)
const activeRating = computed(() => props.report.ratings.find(item => item.key === activeKey.value))
const activeBar = computed(() => series.value.find(item => item.key === activeSeriesKey.value && (item.counts[activeKey.value || ''] || 0) > 0))
const tooltip = ref<HTMLElement>()
const tooltipStyle = ref<Record<string, string>>({})
const firstBar = (key: string) => series.value.find(item => (item.counts[key] || 0) > 0)?.key
function hideTooltip() { activeKey.value = null; activeSeriesKey.value = null }
async function activate(key: string, event: MouseEvent | FocusEvent, seriesKey?: string) {
  if (!hasData.value) return
  activeKey.value = key
  activeSeriesKey.value = seriesKey || (event.target as HTMLElement).closest<HTMLElement>('.chart-bar')?.dataset.series || null
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const x = event instanceof MouseEvent ? event.clientX : box.left + box.width / 2
  const y = event instanceof MouseEvent ? event.clientY : box.top + box.height / 2
  await nextTick()
  if (activeKey.value !== key) return
  const width = tooltip.value?.offsetWidth || 280
  const height = tooltip.value?.offsetHeight || 112
  tooltipStyle.value = { left: `${Math.max(12, Math.min(x + 16, window.innerWidth - width - 12))}px`, top: `${Math.max(12, Math.min(y + 16, window.innerHeight - height - 12))}px` }
}
watch(() => props.report, hideTooltip)
</script>

<style scoped>
.distribution-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
.rating-tabs :deep(.segment) { height: 32px; padding: 0 16px; }.rating-tabs :deep(.segment.first.last) { border-radius: 6px; }
.count-info { display: flex; gap: 16px; flex-wrap: wrap; color: #646a73; font-size: 13px; }
.axis-name { color: #646a73; font-size: 12px; }
.comparison-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 8px 0 0 68px; }
.series-legend { display: inline-flex; align-items: center; gap: 6px; box-sizing: border-box; height: 28px; padding: 0 8px; border-radius: 6px; color: #fff; font-size: 14px; }.series-legend button { border: 0; padding: 0; background: transparent; color: inherit; cursor: pointer; font: inherit; }
.distribution-figure { position: relative; margin: 0; }.chart-scroll { overflow-x: auto; }.chart { position: relative; min-width: 380px; height: 400px; }.chart-plot { position: absolute; inset: 30px 0 38px 68px; }
.chart-grid { position: absolute; inset: 0; border-left: 1px solid #d8d8d8; pointer-events: none; }.chart-gridline { position: absolute; left: 0; right: 0; border-top: 1px dashed rgba(216,216,216,.5); }.chart-gridline:first-child { border-top-style: solid; }
.chart-gridline span { position: absolute; right: calc(100% + 8px); top: -10px; color: #646a73; font-size: 12px; font-variant-numeric: tabular-nums; }
.chart-columns { position: absolute; inset: 0; display: grid; }.chart-column { display: flex; gap: 2px; position: relative; justify-content: center; align-items: flex-end; min-width: 0; height: 100%; }
.chart-axis-line { position: absolute; inset: 0; pointer-events: none; }.chart-column.column-active .chart-axis-line { background: #f7f7f7; opacity: .7; }
.chart-bar { position: relative; flex: 0 1 24px; width: 24px; max-width: calc(100% - 8px); border-radius: 4px 4px 0 0; z-index: 1; }.chart-label { position: absolute; top: calc(100% + 12px); left: 0; right: 0; display: flex; justify-content: center; }
.chart-hover-line { position: absolute; left: 0; right: 0; border-top: 1px dashed; pointer-events: none; z-index: 2; }
.chart-tooltip { position: fixed; z-index: 9999999; min-width: min(280px, calc(100vw - 24px)); max-width: calc(100vw - 24px); box-sizing: border-box; padding: 16px; background: #fff; border: 1px solid #fff; border-radius: 6px; box-shadow: 0 4px 16px rgba(0,0,0,.16); color: #666; font-size: 14px; line-height: 22px; pointer-events: none; }
.tooltip-title { display: flex; align-items: center; gap: 16px; font-weight: 500; }.tooltip-group-title { margin-top: 8px; }.tooltip-row { display: flex; align-items: center; gap: 8px; margin-top: 4px; }.tooltip-dot { flex: 0 0 8px; width: 8px; height: 8px; border-radius: 50%; }.tooltip-row-value { margin-left: auto; text-align: right; font-variant-numeric: tabular-nums; }
.distribution-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #8f959e; pointer-events: none; }.distribution-empty :deep(svg) { max-width: 80%; }
.distribution-table { margin-top: 16px; overflow-x: auto; color: #646a73; font-size: 12px; }.distribution-table summary { cursor: pointer; }.distribution-table table { margin-top: 8px; border-collapse: collapse; white-space: nowrap; }.distribution-table th, .distribution-table td { padding: 8px 12px; border: 1px solid #dee0e3; text-align: right; }.distribution-table th { font-weight: 500; }
@media (forced-colors: active) { .chart-bar { background: CanvasText !important; border: 1px solid Canvas; forced-color-adjust: none; }.series-legend { color: CanvasText; border: 1px solid CanvasText; } }
</style>
