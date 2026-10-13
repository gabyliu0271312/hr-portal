<script setup lang="ts">
import { computed } from 'vue'
import FixedScoreOptionsSummary from './FixedScoreOptionsSummary.vue'
import PerformanceOptionNavigator, { type PerformanceOptionLayoutPolicy } from './PerformanceOptionNavigator.vue'
import ScoreMappingSummary from './ScoreMappingSummary.vue'
import ScoreRangeSummary from './ScoreRangeSummary.vue'
import { performanceLevelBackground as levelTriggerColor } from './performanceColorOptions'

interface RuleConfig { [key: string]: unknown }

const props = defineProps<{
  entryMode: 'regular_question' | 'sub_question'
  ruleType: '评级' | '评分' | '评分映射等级型'
  config: RuleConfig
  loading?: boolean
  error?: string
}>()

function record(value: unknown): RuleConfig {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RuleConfig : {}
}

function valueOf(source: RuleConfig, camel: string, snake: string): unknown {
  return source[camel] ?? source[snake]
}

function display(value: unknown): string {
  return value === undefined || value === null || value === '' ? '—' : String(value)
}

function displayLevelName(value: unknown): string {
  return value === undefined || value === null || value === '' ? '--' : String(value)
}

function booleanValue(source: RuleConfig, camel: string, snake: string): boolean {
  const value = valueOf(source, camel, snake)
  return value === true || value === 'true' || value === 1 || value === '1'
}

const levels = computed(() => Array.isArray(props.config.levels) ? props.config.levels.map(record) : [])
const ratingOptions = computed(() => levels.value.map((level, index) => ({
  id: String(level.id ?? level.code ?? `rating-level-${index + 1}`),
  label: display(level.code),
})))
const subRatingLayoutPolicy: PerformanceOptionLayoutPolicy = {
  viewportWidth: 759,
  viewportHeight: 38,
  optionMinWidth: 42,
  optionHeight: 32,
  connectorMinWidth: 12,
  connectorMaxWidth: 88,
  overflowGap: 12,
  naturalMax: 5,
  distributedMax: 10,
}
const score = computed(() => record(props.config.score ?? props.config))
const isFixedScore = computed(() => String(valueOf(score.value, 'method', 'score_method') ?? '').includes('固定分值'))
const mapping = computed(() => record(props.config.mapping ?? props.config))
const gradeParticipatesInCalculation = computed(() => booleanValue(props.config, 'gradeParticipatesInCalculation', 'grade_participates_in_calculation'))
const fixedOptions = computed(() => {
  const options = valueOf(score.value, 'fixedOptions', 'fixed_options')
  return Array.isArray(options) ? options.map(record) : []
})
const ratingSummary = computed(() => {
  if (!gradeParticipatesInCalculation.value) return '评级'
  const scores = levels.value.map((level) => Number(valueOf(level, 'quantifiedScore', 'quantified_score'))).filter(Number.isFinite)
  return scores.length ? `评级（量化分: ${Math.min(...scores)}-${Math.max(...scores)} 分）` : '评级'
})
</script>

<template>
  <div class="review-rule-config-renderer">
    <div v-if="loading" class="rule-config-state" role="status">正在加载评估规则配置...</div>
    <div v-else-if="error" class="rule-config-state rule-config-error" role="alert">{{ error }}</div>
    <template v-else-if="ruleType === '评级' && entryMode === 'sub_question'">
      <div class="sub-rating-tiers" aria-label="评级档位">
        <div class="config-field-label">评级档位</div>
        <PerformanceOptionNavigator
          class="sub-rating-tier-navigator"
          :options="ratingOptions"
          label="评级档位选项"
          appearance-variant="sub-question-rating"
          :layout-policy="subRatingLayoutPolicy"
          fluid
          :interactive="false"
        />
      </div>
    </template>
    <template v-else-if="ruleType === '评级'">
      <div class="rating-level-description" :class="{ quantified: gradeParticipatesInCalculation }" aria-label="配置等级描述">
        <div class="config-field-label">配置等级描述</div>
        <div class="level-grid level-grid-header" :class="{ quantified: gradeParticipatesInCalculation }">
          <span>等级代号</span>
          <span>等级名称</span>
          <span v-if="gradeParticipatesInCalculation">量化分</span>
          <span class="level-description-heading">等级描述</span>
        </div>
        <div v-for="(level, index) in levels" :key="String(level.id ?? index)" class="level-grid level-grid-row" :class="{ quantified: gradeParticipatesInCalculation }">
          <span class="level-code"><span class="level-code-pill" :style="{ backgroundColor: levelTriggerColor(level.color) }"><span class="level-code-text">{{ display(level.code) }}</span></span></span>
          <span class="level-name">{{ displayLevelName(level.name) }}</span>
          <span v-if="gradeParticipatesInCalculation" class="quantified-score">{{ display(valueOf(level, 'quantifiedScore', 'quantified_score')) }}</span>
          <input class="level-description-input" :value="display(valueOf(level, 'description', 'level_description')) === '—' ? '' : display(valueOf(level, 'description', 'level_description'))" aria-label="等级描述" />
        </div>
      </div>
      <span class="sr-only">{{ ratingSummary }}</span>
    </template>
    <section v-else-if="ruleType === '评分'" class="score-config" :aria-label="isFixedScore ? '分值选项' : '评分上下限'">
      <FixedScoreOptionsSummary v-if="isFixedScore" :options="fixedOptions" />
      <ScoreRangeSummary v-else :minimum="score.min" :maximum="score.max" :precision="score.precision" />
    </section>
    <section v-else class="mapping-config">
      <ScoreMappingSummary :mapping="mapping" />
    </section>
  </div>
</template>

<style scoped>
.review-rule-config-renderer { width: 100%; color: #1f2329; }
.rating-level-description, .sub-rating-tiers { margin-top: 16px; }
.rating-level-description { display: grid; grid-template-columns: minmax(70px, max-content) 70px minmax(0, 1fr); column-gap: 8px; }
.rating-level-description.quantified { grid-template-columns: minmax(70px, max-content) 70px 70px minmax(0, 1fr); }
.rating-level-description > .config-field-label, .level-grid { grid-column: 1 / -1; }
.sub-rating-tiers { width: 100%; min-width: 0; }
.sub-rating-tier-navigator { width: 100%; max-width: 100%; }
.config-field-label { height: 22px; margin-bottom: 8px; color: #1f2329; font-size: 14px; font-weight: 600; line-height: 22px; }
.level-grid { display: grid; grid-template-columns: subgrid; column-gap: 8px; align-items: center; width: 100%; }
.level-grid-header { height: 22px; color: #646a73; font-size: 14px; line-height: 22px; }
.level-description-heading { min-width: 0; }
.level-grid-row { min-height: 31.33px; margin-top: 12px; color: #1f2329; font-size: 14px; line-height: 22px; }
.level-code, .level-code-pill, .level-code-text { min-width: 0; }
.level-code-pill { display: inline-flex; align-items: center; width: max-content; max-width: 132px; height: 22px; padding: 0 8px; box-sizing: border-box; border-radius: 11px; }
.level-code-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.level-description-input { width: 100%; height: 32px; padding: 4px 11px; box-sizing: border-box; border: 1px solid #d0d3d6; border-radius: 6px; outline: none; color: #1f2329; font: 400 14px/22px inherit; }
.level-description-input:focus { border-color: #3370ff; }
.score-config, .mapping-config { margin-top: 16px; }
.rule-config-state { padding: 16px 0; color: #646a73; font-size: 14px; line-height: 22px; }
.rule-config-error { color: #d83931; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
</style>
