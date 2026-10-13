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
    <figure v-else class="distribution-figure" aria-label="绩效评级人数占比分布">
      <div class="chart-scroll">
        <div class="chart">
          <div class="chart-grid" aria-hidden="true">
            <div v-for="tick in ticks" :key="tick" class="chart-gridline" :style="{ bottom: `${tick / maximum * 100}%` }"><span>{{ tick }}%</span></div>
          </div>
          <div class="chart-columns" :style="{ gridTemplateColumns: `repeat(${report.ratings.length}, minmax(0, 1fr))` }">
            <div v-for="rating in report.ratings" :key="rating.key" class="chart-column" tabindex="0" :aria-label="`${rating.label}：${report.distribution[rating.key] ?? 0}人，占比${share(rating.key)}%`">
              <div class="chart-bar" :style="{ height: `${Number(share(rating.key)) / maximum * 100}%` }" />
              <span class="chart-label">{{ rating.label }}</span>
              <div class="chart-tooltip" aria-hidden="true">{{ rating.label }}<br>{{ report.distribution[rating.key] ?? 0 }} 人 · {{ share(rating.key) }}%</div>
            </div>
          </div>
        </div>
      </div>
      <figcaption>占比按已评估人数计算</figcaption>
    </figure>
    <details class="distribution-data">
      <summary>查看图表数据</summary>
      <table>
        <caption>绩效评级分布</caption>
        <thead><tr><th scope="col">绩效评级</th><th scope="col">人数</th><th scope="col">人数占比</th></tr></thead>
        <tbody><tr v-for="rating in report.ratings" :key="rating.key"><th scope="row">{{ rating.label }}</th><td>{{ report.distribution[rating.key] ?? 0 }}</td><td>{{ share(rating.key) }}%</td></tr></tbody>
      </table>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AddOutlinedIcon from './AddOutlinedIcon.vue'
import { reportPercent, reportTotal, type ProjectStatisticsReport } from './projectStatisticsReport'
const props = defineProps<{ report: ProjectStatisticsReport }>()
const emit = defineEmits<{ compare: [] }>()
const evaluated = computed(() => reportTotal(props.report.distribution))
const share = (key: string) => reportPercent(props.report.distribution[key] ?? 0, evaluated.value)
const maximum = computed(() => Math.max(10, Math.ceil(Math.max(0, ...props.report.ratings.map(rating => Number(share(rating.key)))) / 10) * 10))
const ticks = computed(() => Array.from({ length: maximum.value / 10 + 1 }, (_, i) => i * 10))
</script>

<style scoped>
.distribution-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
.rating-tab { padding: 6px 12px; border: 1px solid #d0d3d6; border-radius: 6px; font-weight: 500; }
.count-info { display: flex; gap: 16px; flex-wrap: wrap; color: #646a73; font-size: 13px; }
.axis-name { color: #646a73; font-size: 12px; }
.comparison-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 8px 0 24px 40px; }
.comparison-button { display: inline-flex; align-items: center; gap: 4px; border: 1px solid #3370ff; border-radius: 6px; background: #fff; color: #1456f0; padding: 3px 8px; font: inherit; line-height: 20px; cursor: pointer; }
.comparison-button :deep(svg) { width: 14px; height: 14px; }
.summary-tag { padding: 2px 8px; background: #eff3ff; color: #1f2329; border-radius: 4px; font-size: 12px; }
.distribution-figure { margin: 0; }
.chart-scroll { overflow-x: auto; padding: 0 0 8px; }
.chart { position: relative; min-width: 380px; height: 240px; margin: 12px 8px 36px 40px; }
.chart-grid { position: absolute; inset: 0; pointer-events: none; }
.chart-gridline { position: absolute; left: 0; right: 0; border-top: 1px solid #eff0f1; }
.chart-gridline span { position: absolute; right: calc(100% + 8px); top: -10px; color: #646a73; font-size: 11px; font-variant-numeric: tabular-nums; }
.chart-columns { position: absolute; inset: 0; display: grid; }
.chart-column { display: flex; position: relative; justify-content: center; align-items: flex-end; min-width: 0; height: 100%; outline-offset: 2px; }
.chart-column:focus-visible { outline: 2px solid #3370ff; }
.chart-bar { width: 24px; max-width: calc(100% - 8px); background: #3370ff; border-radius: 4px 4px 0 0; }
.chart-label { position: absolute; top: calc(100% + 12px); left: 0; right: 0; text-align: center; color: #646a73; font-size: 12px; }
.chart-tooltip { display: none; position: absolute; z-index: 2; top: 8px; padding: 8px 10px; white-space: nowrap; background: #fff; border: 1px solid #dee0e3; border-radius: 6px; box-shadow: 0 4px 12px #1f23291a; color: #1f2329; font-size: 12px; pointer-events: none; }
.chart-column:first-child .chart-tooltip { left: 0; }
.chart-column:last-child .chart-tooltip { right: 0; }
.chart-column:hover .chart-tooltip, .chart-column:focus .chart-tooltip { display: block; }
figcaption { color: #646a73; font-size: 12px; }
.distribution-empty { padding: 48px 0; text-align: center; color: #646a73; }
.distribution-data { margin-top: 12px; color: #646a73; font-size: 12px; }
.distribution-data summary { cursor: pointer; width: fit-content; }
.distribution-data table { width: 100%; margin-top: 12px; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.distribution-data th, .distribution-data td { border-bottom: 1px solid #eff0f1; padding: 6px 12px; text-align: left; }
.distribution-data caption { text-align: left; padding: 6px 12px; }
@media (forced-colors: active) { .chart-bar { background: CanvasText; forced-color-adjust: none; } }
</style>
