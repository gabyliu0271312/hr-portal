<script setup lang="ts">
import { computed } from 'vue'
import ScoreRangeSummary from './ScoreRangeSummary.vue'

interface MappingRecord { [key: string]: unknown }

const props = defineProps<{ mapping: MappingRecord }>()

const intervals = computed(() => Array.isArray(props.mapping.intervals) ? props.mapping.intervals.map(record) : [])
const rule = computed(() => String(props.mapping.rule ?? 'a ≤ 分数 < b'))

const pillColors = [
  { background: 'rgb(253,226,226)', color: 'rgb(98,28,24)' },
  { background: 'rgb(250,241,209)', color: 'rgb(92,58,0)' },
  { background: 'rgb(217,245,214)', color: 'rgb(18,75,12)' },
  { background: 'rgb(236,226,254)', color: 'rgb(70,11,70)' },
]

function record(value: unknown): MappingRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as MappingRecord : {}
}

function display(value: unknown): string {
  return value === undefined || value === null || value === '' ? '—' : String(value)
}

function displayName(value: unknown): string {
  return value === undefined || value === null || value === '' ? '--' : String(value)
}

function lowerAt(index: number): unknown {
  return index === 0 ? props.mapping.min : intervals.value[index - 1]?.upper
}

function upperAt(index: number): unknown {
  return index === intervals.value.length - 1 ? props.mapping.max : intervals.value[index]?.upper
}

function intervalExpression(index: number): string {
  const lowerOperator = rule.value.includes('a <') ? '<' : '≤'
  const upperOperator = index === intervals.value.length - 1 || rule.value.includes('≤ b') ? '≤' : '<'
  return `${display(lowerAt(index))} ${lowerOperator} 分数 ${upperOperator} ${display(upperAt(index))}`
}

function pillStyle(index: number) {
  return pillColors[index % pillColors.length]
}
</script>

<template>
  <div class="score-mapping-summary" data-component="score-mapping-summary" aria-label="评分映射等级型配置">
    <div class="mapping-title">按分数子区间匹配等级</div>
    <div class="mapping-grid mapping-header" aria-label="映射表头">
      <span>评分上下限</span>
      <span>等级代号</span>
      <span>等级名称</span>
      <span>等级描述</span>
    </div>
    <div class="mapping-rows">
      <div v-for="(interval, index) in intervals" :key="String(interval.id ?? interval.code ?? index)" class="mapping-grid mapping-row">
        <span class="mapping-range">{{ intervalExpression(index) }}</span>
        <span class="mapping-code-pill" :style="pillStyle(index)">{{ display(interval.code) }}</span>
        <span class="mapping-name">{{ displayName(interval.name) }}</span>
        <input class="mapping-description-input" :value="String(interval.description ?? interval.level_description ?? '')" aria-label="等级描述" />
      </div>
    </div>
    <ScoreRangeSummary class="mapping-range-summary" :minimum="mapping.min" :maximum="mapping.max" :precision="mapping.precision" />
  </div>
</template>

<style scoped>
.score-mapping-summary { width: 100%; min-width: 0; color: #1f2329; }
.mapping-title { width: 100%; height: 22px; margin-bottom: 8px; font-size: 14px; font-weight: 600; line-height: 22px; }
.mapping-grid { display: grid; grid-template-columns: 180px 70px 70px minmax(0, 1fr); column-gap: 8px; align-items: center; width: 100%; }
.mapping-header { height: 22px; margin-bottom: 8px; color: #646a73; font-size: 14px; line-height: 22px; }
.mapping-row { min-height: 31.33px; margin-bottom: 12px; color: #1f2329; font-size: 14px; line-height: 22px; }
.mapping-row:last-child { margin-bottom: 0; }
.mapping-range, .mapping-name { min-width: 0; }
.mapping-code-pill { display: inline-flex; align-items: center; justify-content: center; width: max-content; min-width: 0; height: 22px; padding: 0 8px; box-sizing: border-box; border-radius: 9999px; white-space: nowrap; }
.mapping-description-input { width: 100%; height: 32px; padding: 4px 11px; box-sizing: border-box; border: 1px solid #d0d3d6; border-radius: 6px; outline: none; color: #1f2329; font: 400 14px/22px inherit; }
.mapping-description-input:focus { border-color: #3370ff; }
.mapping-range-summary { margin-top: 20px; }
</style>
