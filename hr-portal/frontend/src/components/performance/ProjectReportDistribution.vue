<template>
  <div class="report-distribution">
    <div class="distribution-header">
      <span class="rating-tab">绩效评级</span>
      <div class="count-info"><span>总人数：{{ report.totalParticipants }}</span><span>已评估人数：{{ evaluated }}</span></div>
    </div>
    <div class="axis-name">人数占比</div>
    <div class="comparison-row">
      <button type="button" class="comparison-button" @click="emit('compare')"><AddOutlinedIcon />添加对比</button>
      <span class="summary-tag">汇总：{{ evaluated }}</span>
    </div>
    <p v-if="!evaluated" class="distribution-empty">暂无已评估数据</p>
    <figure v-else ref="figure" class="distribution-figure" aria-label="绩效评级人数占比分布">
      <div class="chart-scroll">
        <div class="chart">
          <div class="chart-grid" aria-hidden="true">
            <div v-for="tick in ticks" :key="tick" class="chart-gridline" :style="{ bottom: `${tick / maximum * 100}%` }"><span>{{ tick }}</span></div>
          </div>
          <div class="chart-columns" :style="{ gridTemplateColumns: `repeat(${report.ratings.length}, minmax(0, 1fr))` }">
            <div v-for="rating in report.ratings" :key="rating.key" class="chart-column" tabindex="0" :class="{ 'column-active': activeKey === rating.key }" :aria-label="`${rating.label}：${report.distribution[rating.key] ?? 0}人，占比${share(rating.key)}%`" @mouseenter="activate(rating.key, $event)" @mouseleave="activeKey = null; tooltipPosition = null" @focus="activate(rating.key, $event)" @blur="activeKey = null; tooltipPosition = null">
              <div class="chart-axis-line" aria-hidden="true"></div>
              <div class="chart-bar" :class="heatClass(rating.key)" :style="{ height: `${Number(share(rating.key)) / maximum * 100}%` }"></div>
              <span class="chart-label"><PerformanceRatingTag :label="rating.label" :color="rating.color" /></span>
            </div>
          </div>
        </div>
      </div>
      <div v-if="activeTooltip" class="chart-tooltip" role="tooltip" :style="tooltipStyle">
        <div class="tooltip-title">价值贡献（终评）</div>
        <div class="tooltip-rating">{{ activeTooltip.rating.label }}</div>
        <div class="tooltip-row"><span class="tooltip-dot" aria-hidden="true" /><span class="tooltip-row-label">我的团队数据</span><span class="tooltip-row-value">{{ share(activeTooltip.rating.key) }}% ({{ report.distribution[activeTooltip.rating.key] ?? 0 }} 人)</span></div>
        <div class="tooltip-row"><span class="tooltip-dot" aria-hidden="true" /><span class="tooltip-row-label">汇总</span><span class="tooltip-row-value">{{ share(activeTooltip.rating.key) }}% ({{ report.distribution[activeTooltip.rating.key] ?? 0 }} 人)</span></div>
      </div>
      <figcaption>占比按已评估人数计算</figcaption>
    </figure>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import AddOutlinedIcon from './AddOutlinedIcon.vue'
import PerformanceRatingTag from './PerformanceRatingTag.vue'
import { reportPercent, reportTotal, type ProjectStatisticsReport } from './projectStatisticsReport'
const props = defineProps<{ report: ProjectStatisticsReport }>()
const emit = defineEmits<{ compare: [] }>()
const evaluated = computed(() => reportTotal(props.report.distribution))
const share = (key: string) => reportPercent(props.report.distribution[key] ?? 0, evaluated.value)
const maximum = computed(() => Math.max(10, Math.ceil(Math.max(0, ...props.report.ratings.map(rating => Number(share(rating.key)))) / 10) * 10))
const ticks = computed(() => Array.from({ length: maximum.value / 10 + 1 }, (_, i) => i * 10))
const heatClass = (key: string) => {
  if (!(props.report.distribution[key] ?? 0)) return ''
  const level = props.report.heatLevels?.[key]
  return level === 1 || level === 2 || level === 3 ? `heat-${level}` : ''
}
const activeKey = ref<string | null>(null)
const tooltipPosition = ref<{ x: number; y: number } | null>(null)
const figure = ref<HTMLElement | null>(null)
function activate(key: string, event: MouseEvent | FocusEvent) {
  activeKey.value = key
  const column = event.currentTarget as HTMLElement
  const bar = column.querySelector<HTMLElement>('.chart-bar')
  const root = figure.value
  if (!bar || !root) { tooltipPosition.value = null; return }
  const barRect = bar.getBoundingClientRect()
  const rootRect = root.getBoundingClientRect()
  tooltipPosition.value = { x: barRect.left + barRect.width / 2 - rootRect.left, y: barRect.top - rootRect.top }
}
const activeTooltip = computed(() => {
  const rating = props.report.ratings.find(item => item.key === activeKey.value)
  return rating ? { rating } : null
})
const tooltipStyle = computed(() => tooltipPosition.value ? { left: `${tooltipPosition.value.x}px`, top: `${tooltipPosition.value.y}px` } : { display: 'none' })
</script>

<style scoped>
.distribution-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
.rating-tab { padding: 6px 12px; border: 1px solid #d0d3d6; border-radius: 6px; font-weight: 500; }
.count-info { display: flex; gap: 16px; flex-wrap: wrap; color: #646a73; font-size: 13px; }
.axis-name { color: #646a73; font-size: 12px; }
.comparison-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 8px 0 24px 40px; }
.comparison-button { display: inline-flex; align-items: center; gap: 4px; border: 1px solid #3370ff; border-radius: 6px; background: #fff; color: var(--color-primary); padding: 3px 8px; font: inherit; line-height: 20px; cursor: pointer; }
.comparison-button :deep(svg) { width: 14px; height: 14px; }
.summary-tag { padding: 2px 8px; background: #eff3ff; color: #1f2329; border-radius: 4px; font-size: 12px; }
.distribution-figure { position: relative; margin: 0; }
.chart-scroll { overflow-x: auto; padding: 0 0 8px; }
.chart { position: relative; min-width: 380px; height: 240px; margin: 12px 8px 36px 40px; }
.chart-grid { position: absolute; inset: 0; pointer-events: none; }
.chart-gridline { position: absolute; left: 0; right: 0; border-top: 1px solid #eff0f1; }
.chart-gridline span { position: absolute; right: calc(100% + 8px); top: -10px; color: #646a73; font-size: 11px; font-variant-numeric: tabular-nums; }
.chart-columns { position: absolute; inset: 0; display: grid; }
.chart-column { display: flex; position: relative; justify-content: center; align-items: flex-end; min-width: 0; height: 100%; }
.chart-axis-line { position: absolute; inset: 0; background: transparent; pointer-events: none; }
.chart-column.column-active .chart-axis-line { background: #f6f6f6; }
.chart-bar { position: relative; width: 24px; max-width: calc(100% - 8px); border-radius: 4px 4px 0 0; z-index: 1; }
.chart-bar.heat-1 { background: #e1eaff; }
.chart-bar.heat-2 { background: #bacefd; }
.chart-bar.heat-3 { background: #82a7fc; }
.chart-bar.heat-2:hover { background: #a9bff3; }
.chart-label { position: absolute; top: calc(100% + 12px); left: 0; right: 0; display: flex; justify-content: center; }
.chart-tooltip { position: absolute; z-index: 9999999; transform: translate(-50%, calc(-100% - 6px)); width: 282px; max-width: calc(100vw - 24px); box-sizing: border-box; padding: 8px 12px; background: #fff; border: 1px solid #fff; border-radius: 6px; box-shadow: rgba(0, 0, 0, 0.16) 0 4px 16px; color: #666; font-size: 14px; line-height: 22px; pointer-events: none; }
.tooltip-title { color: #666; font-weight: 500; }
.tooltip-rating { display: flex; align-items: center; gap: 4px; color: #666; font-weight: 500; }
.tooltip-row { display: flex; align-items: center; gap: 8px; }
.tooltip-dot { flex: 0 0 8px; width: 8px; height: 8px; border-radius: 50%; background: #3370ff; }
.tooltip-row-label { color: #666; }
.tooltip-row-value { text-align: right; color: #666; font-variant-numeric: tabular-nums; }
figcaption { color: #646a73; font-size: 12px; }
.distribution-empty { padding: 48px 0; text-align: center; color: #646a73; }
@media (forced-colors: active) { .chart-bar { background: CanvasText; forced-color-adjust: none; } }
</style>
