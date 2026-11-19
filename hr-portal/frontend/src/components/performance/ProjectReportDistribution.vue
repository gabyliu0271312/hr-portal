<template>
  <div class="report-distribution">
    <div class="distribution-header">
      <ElDropdown v-if="report.indicators?.length" trigger="click" @command="emit('indicator-change', $event)"><button type="button" class="rating-tab">{{ indicatorLabel }}<DownOutlinedIcon /></button><template #dropdown><ElDropdownMenu><ElDropdownItem v-for="indicator in report.indicators" :key="indicator.key" :command="indicator.key">{{ indicator.label }}</ElDropdownItem></ElDropdownMenu></template></ElDropdown>
      <span v-else class="rating-tab">{{ indicatorLabel }}</span>
      <div class="count-info"><span>总人数：{{ report.totalParticipants }}</span><span>已评估人数：{{ evaluated }}</span></div>
    </div>
    <div class="axis-name">人数占比</div>
    <div class="comparison-row">
      <ElDropdown trigger="click" @command="requestComparison"><button type="button" class="comparison-button"><AddOutlinedIcon />添加对比</button><template #dropdown><ElDropdownMenu><ElDropdownItem v-for="option in comparisonDimensions" :key="option.value" :command="option.value">{{ option.label }}</ElDropdownItem></ElDropdownMenu></template></ElDropdown>
      <span class="summary-tag">汇总：{{ evaluated }}</span>
      <div v-if="comparisonDimension" class="comparison-group-control"><PerformanceSearchSelect class="comparison-groups" :model-value="selectedGroups[comparisonDimension] || []" :options="groupOptions" multiple aria-label="对比分组" placeholder="选择对比分组" @update:model-value="selectGroups" /></div>
      <span v-for="item in series.slice(1)" :key="item.key" class="series-legend"><i :style="seriesStyle(item)" />{{ item.label }}<button type="button" :aria-label="`移除${item.label}`" @click="removeSeries(item.key)">×</button></span>
    </div>
    <figure class="distribution-figure" :aria-label="`${indicatorLabel}人数占比分布`">
      <div class="chart-scroll">
        <div class="chart">
          <div class="chart-plot">
            <div class="chart-grid" aria-hidden="true"><div v-for="tick in ticks" :key="tick" class="chart-gridline" :style="{ bottom: `${tick / maximum * 100}%` }"><span v-if="tick">{{ tick }}%</span></div></div>
            <div class="chart-columns" :style="{ gridTemplateColumns: `repeat(${Math.max(1, report.ratings.length)}, minmax(0, 1fr))` }">
              <div v-for="rating in report.ratings" :key="rating.key" class="chart-column" tabindex="0" :class="{ 'column-active': activeKey === rating.key }" :aria-label="`${rating.label}：${report.distribution[rating.key] ?? 0}人，占比${share(series[0], rating.key)}%`" @mouseenter="activate(rating.key, $event)" @mousemove="activate(rating.key, $event)" @mouseleave="hideTooltip" @focus="activate(rating.key, $event)" @blur="hideTooltip">
                <div class="chart-axis-line" aria-hidden="true" />
                <div v-for="item in series" :key="item.key" class="chart-bar" :style="{ height: `${Number(share(item, rating.key)) / maximum * 100}%`, ...seriesStyle(item) }" :aria-label="`${item.label}：${share(item, rating.key)}%，${item.counts[rating.key] ?? 0}人`" />
                <span class="chart-label"><PerformanceRatingTag :label="rating.label" :color="rating.color" /></span>
              </div>
            </div>
            <div v-if="!hasData" class="distribution-empty" role="status"><MetricTemplateEmptyIllustration /><span>暂无已评估数据</span></div>
          </div>
        </div>
      </div>
      <Teleport to="body"><div v-if="activeRating" ref="tooltip" class="chart-tooltip" role="tooltip" :style="tooltipStyle"><div class="tooltip-title">{{ indicatorLabel }}（终评）<PerformanceRatingTag :label="activeRating.label" :color="activeRating.color" /></div><div class="tooltip-group-title">我的团队数据</div><div v-for="item in series" :key="item.key" class="tooltip-row"><span class="tooltip-dot" :style="seriesStyle(item)" aria-hidden="true" /><span>{{ item.label }}</span><span class="tooltip-row-value">{{ share(item, activeRating.key) }}% ({{ item.counts[activeRating.key] ?? 0 }} 人)</span></div></div></Teleport>
      <div class="chart-legend"><span v-for="item in series" :key="item.key"><i :style="seriesStyle(item)" />{{ item.label }}</span></div>
      <details v-if="series.some(item => item.color === '#646a73')" open class="distribution-table"><summary>查看数据表</summary><table><thead><tr><th>分组</th><th v-for="rating in report.ratings" :key="rating.key">{{ rating.label }}</th></tr></thead><tbody><tr v-for="item in series" :key="item.key"><th>{{ item.label }}</th><td v-for="rating in report.ratings" :key="rating.key">{{ share(item, rating.key) }}% ({{ item.counts[rating.key] ?? 0 }} 人)</td></tr></tbody></table></details>
      <figcaption>占比按各组已评估人数计算</figcaption>
    </figure>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ElDropdown, ElDropdownItem, ElDropdownMenu } from 'element-plus'
import AddOutlinedIcon from './AddOutlinedIcon.vue'
import DownOutlinedIcon from './DownOutlinedIcon.vue'
import PerformanceRatingTag from './PerformanceRatingTag.vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import MetricTemplateEmptyIllustration from './MetricTemplateEmptyIllustration.vue'
import { reportPercent, reportTotal, type ProjectStatisticsReport, type ReportDepartment } from './projectStatisticsReport'
type ComparisonDimension = 'team' | 'department' | 'sequence'
const props = defineProps<{ report: ProjectStatisticsReport; comparisonReports?: Partial<Record<ComparisonDimension, ProjectStatisticsReport>> }>()
const emit = defineEmits<{ compare: [dimension: ComparisonDimension]; 'indicator-change': [key: string] }>()
const indicatorLabel = computed(() => props.report.indicatorLabel || props.report.indicators?.find(item => item.key === props.report.indicatorKey)?.label || '绩效评级')
const evaluated = computed(() => reportTotal(props.report.distribution))
const comparisonDimensions = [{ value: 'team', label: '团队' }, { value: 'department', label: '部门' }, { value: 'sequence', label: '序列' }] as const
const comparisonDimension = ref<ComparisonDimension>()
const selectedGroups = ref<Partial<Record<ComparisonDimension, string[]>>>({})
const palette = ['#4e83fd', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']
const colorSlots = new Map<string, string>()
function flatten(rows: ReportDepartment[]): ReportDepartment[] { return rows.flatMap(row => [row, ...flatten(row.children || [])]) }
const groupOptions = computed(() => flatten(comparisonDimension.value ? props.comparisonReports?.[comparisonDimension.value]?.departments || [] : []).map(row => ({ value: row.id, label: row.name })))
function requestComparison(dimension: ComparisonDimension) { comparisonDimension.value = dimension; emit('compare', dimension) }
function selectGroups(value: string | string[] | null) {
  if (!comparisonDimension.value) return
  const dimension = comparisonDimension.value
  const values = Array.isArray(value) ? value : []
  values.forEach(id => { const key = `${dimension}:${id}`; if (!colorSlots.has(key)) colorSlots.set(key, palette[colorSlots.size + 1] || '#646a73') })
  selectedGroups.value = { ...selectedGroups.value, [dimension]: values }
}
function removeSeries(key: string) {
  for (const dimension of comparisonDimensions) selectedGroups.value[dimension.value] = selectedGroups.value[dimension.value]?.filter(id => `${dimension.value}:${id}` !== key)
}
const series = computed(() => {
  const result = [{ key: 'summary', label: '汇总', counts: props.report.distribution, color: palette[0] }]
  for (const dimension of comparisonDimensions) {
    const report = props.comparisonReports?.[dimension.value]
    if (!report) continue
    for (const row of flatten(report.departments)) if (selectedGroups.value[dimension.value]?.includes(row.id)) result.push({ key: `${dimension.value}:${row.id}`, label: row.name, counts: row.counts, color: colorSlots.get(`${dimension.value}:${row.id}`) || '#646a73' })
  }
  return result
})
const share = (item: typeof series.value[number], key: string) => reportPercent(item.counts[key] ?? 0, reportTotal(item.counts))
function seriesStyle(item: typeof series.value[number]) {
  const slot = [...colorSlots.keys()].indexOf(item.key)
  return { backgroundColor: item.color, backgroundImage: item.color === '#646a73' ? `repeating-linear-gradient(${slot % 2 ? 45 : 135}deg, transparent 0 ${3 + slot % 4}px, rgba(255,255,255,.65) ${3 + slot % 4}px ${5 + slot % 4}px)` : undefined }
}
const hasData = computed(() => series.value.some(item => reportTotal(item.counts) > 0))
const maximum = computed(() => Math.max(10, Math.ceil(Math.max(0, ...series.value.flatMap(item => props.report.ratings.map(rating => Number(share(item, rating.key))))) / 10) * 10))
const ticks = computed(() => Array.from({ length: maximum.value / 10 + 1 }, (_, i) => i * 10))
const activeKey = ref<string | null>(null)
const activeRating = computed(() => props.report.ratings.find(item => item.key === activeKey.value))
const tooltip = ref<HTMLElement>()
const tooltipStyle = ref<Record<string, string>>({})
function hideTooltip() { activeKey.value = null }
async function activate(key: string, event: MouseEvent | FocusEvent) {
  if (!hasData.value) return
  activeKey.value = key
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const x = event instanceof MouseEvent ? event.clientX : box.left + box.width / 2
  const y = event instanceof MouseEvent ? event.clientY : box.top + box.height / 2
  await nextTick()
  const width = tooltip.value?.offsetWidth || 280
  const height = tooltip.value?.offsetHeight || 112
  tooltipStyle.value = { left: `${Math.max(12, Math.min(x + 16, window.innerWidth - width - 12))}px`, top: `${Math.max(12, Math.min(y + 16, window.innerHeight - height - 12))}px` }
}
watch(() => props.report, () => { selectedGroups.value = {}; colorSlots.clear(); hideTooltip() })
</script>

<style scoped>
.distribution-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
.rating-tab { display: inline-flex; align-items: center; gap: 8px; box-sizing: border-box; height: 32px; padding: 0 16px; border: 1px solid #3370ff; border-radius: 6px; color: #3370ff; background: #fff; font: inherit; font-size: 14px; font-weight: 500; }
button.rating-tab { cursor: pointer; }.rating-tab :deep(svg) { width: 14px; height: 14px; }
.count-info { display: flex; gap: 16px; flex-wrap: wrap; color: #646a73; font-size: 13px; }
.axis-name { color: #646a73; font-size: 12px; }
.comparison-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 8px 0 0 68px; }
.comparison-button { display: inline-flex; align-items: center; gap: 4px; height: 28px; border: 1px solid #3370ff; border-radius: 6px; background: #fff; color: var(--color-primary); padding: 0 8px; font: inherit; line-height: 20px; cursor: pointer; }
.comparison-button:hover { background: #e0e9ff; }.comparison-button :deep(svg) { width: 14px; height: 14px; }
.summary-tag { display: inline-flex; align-items: center; box-sizing: border-box; height: 28px; padding: 0 8px; background: #4e83fd; color: #fff; border-radius: 6px; font-size: 14px; }
.comparison-group-control { flex: 0 1 220px; width: 220px; min-width: 0; max-width: 100%; }.comparison-groups { width: 100%; }.series-legend { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; }.series-legend button { border: 0; background: transparent; color: #646a73; cursor: pointer; font: inherit; }
.distribution-figure { position: relative; margin: 0; }.chart-scroll { overflow-x: auto; }.chart { position: relative; min-width: 380px; height: 400px; }.chart-plot { position: absolute; inset: 30px 0 38px 68px; }
.chart-grid { position: absolute; inset: 0; border-left: 1px solid #d8d8d8; pointer-events: none; }.chart-gridline { position: absolute; left: 0; right: 0; border-top: 1px dashed rgba(216,216,216,.5); }.chart-gridline:first-child { border-top-style: solid; }
.chart-gridline span { position: absolute; right: calc(100% + 8px); top: -10px; color: #646a73; font-size: 12px; font-variant-numeric: tabular-nums; }
.chart-columns { position: absolute; inset: 0; display: grid; }.chart-column { display: flex; gap: 2px; position: relative; justify-content: center; align-items: flex-end; min-width: 0; height: 100%; }
.chart-axis-line { position: absolute; inset: 0; pointer-events: none; }.chart-column.column-active .chart-axis-line { background: #f7f7f7; opacity: .7; }
.chart-bar { position: relative; flex: 0 1 24px; width: 24px; max-width: calc(100% - 8px); border-radius: 4px 4px 0 0; z-index: 1; }.chart-label { position: absolute; top: calc(100% + 12px); left: 0; right: 0; display: flex; justify-content: center; }
.chart-tooltip { position: fixed; z-index: 9999999; min-width: min(280px, calc(100vw - 24px)); max-width: calc(100vw - 24px); box-sizing: border-box; padding: 16px; background: #fff; border: 1px solid #fff; border-radius: 6px; box-shadow: 0 4px 16px rgba(0,0,0,.16); color: #666; font-size: 14px; line-height: 22px; pointer-events: none; }
.tooltip-title { display: flex; align-items: center; gap: 16px; font-weight: 500; }.tooltip-group-title { margin-top: 8px; }.tooltip-row { display: flex; align-items: center; gap: 8px; margin-top: 4px; }.tooltip-dot { flex: 0 0 8px; width: 8px; height: 8px; border-radius: 50%; }.tooltip-row-value { margin-left: auto; text-align: right; font-variant-numeric: tabular-nums; }
.chart-legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 16px; font-size: 12px; color: #646a73; }.chart-legend span { display: inline-flex; align-items: center; gap: 6px; }.chart-legend i, .series-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; }
figcaption { margin-top: 8px; color: #646a73; font-size: 12px; }.distribution-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #8f959e; pointer-events: none; }.distribution-empty :deep(svg) { max-width: 80%; }
.distribution-table { margin-top: 16px; overflow-x: auto; color: #646a73; font-size: 12px; }.distribution-table summary { cursor: pointer; }.distribution-table table { margin-top: 8px; border-collapse: collapse; white-space: nowrap; }.distribution-table th, .distribution-table td { padding: 8px 12px; border: 1px solid #dee0e3; text-align: right; }.distribution-table th { font-weight: 500; }
@media (forced-colors: active) { .chart-bar { background: CanvasText !important; border: 1px solid Canvas; forced-color-adjust: none; } }
</style>
