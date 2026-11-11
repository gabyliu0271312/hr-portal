<template>
  <div v-if="tips" class="performance-distribution-tips" aria-label="绩效结果强制建议分布提示">
    <div class="distribution-tips__head">
      <span class="distribution-tips__title">绩效结果强制 / 建议分布</span>
      <button v-if="hasRules" type="button" class="distribution-tips__toggle" :aria-expanded="expanded" @click="expanded = !expanded">
        {{ expanded ? '收起全部' : '展开全部' }}
        <svg class="distribution-tips__toggle-icon" :class="{ 'distribution-tips__toggle-icon--down': !expanded }" width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="m20.385 16.914.707-.707a1 1 0 0 0 0-1.414l-7.778-7.778a2 2 0 0 0-2.829 0l-7.778 7.778a1 1 0 0 0 0 1.414l.707.707a1 1 0 0 0 1.414 0l7.071-7.07 7.071 7.07a1 1 0 0 0 1.415 0Z" fill="currentColor"></path>
        </svg>
      </button>
    </div>
    <template v-if="expanded">
      <section v-for="group in groups" :key="group.control_mode" class="distribution-tips__group">
        <h3 class="distribution-tips__group-title">{{ group.label }}</h3>
        <div v-for="(rule, ruleIndex) in group.rules" :key="ruleIndex" class="distribution-tips__rule">
          <span class="distribution-tips__status-tag" :class="group.control_mode === 'HARD' ? 'distribution-tips__status-tag--error' : 'distribution-tips__status-tag--warning'">不符合</span>
          <div class="distribution-tips__rule-body">
            <p class="distribution-tips__rule-heading">{{ rule.assessment_label }}：校准范围内全部人员需满足</p>
            <p class="distribution-tips__rule-line">
              <span class="distribution-tips__rule-formula">{{ rule.formula }}</span>：
              <span class="distribution-tips__rule-state">{{ rule.needLabel }}，当前 {{ rule.current_people }} 人</span>
              <span v-if="rule.diffAction">，{{ rule.diffAction }}<span class="distribution-tips__diff" :class="rule.diffClass">{{ rule.diffCount }}</span>人</span>
            </p>
          </div>
        </div>
      </section>
      <p class="distribution-tips__note">说明：当基于比例计算所得的人数为小数时，会采用【{{ roundingLabel }}】的方式取整。</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PerformanceDistributionTips } from '@/api/performance'

const props = defineProps<{ tips: PerformanceDistributionTips | null }>()

const expanded = ref(true)
watch(() => props.tips, () => { expanded.value = true })

const operatorLabels: Record<string, string> = { EQ: '等于', LT: '小于', LTE: '小于等于', GT: '大于', GTE: '大于等于' }
const roundingLabels: Record<string, string> = { ROUND: '四舍五入', CEIL: '向上取整', FLOOR: '向下取整', NONE: '不强制取整' }

const hasRules = computed(() => Boolean(props.tips?.rules?.length))
const roundingLabel = computed(() => {
  const rounding = props.tips?.rules?.[0]?.conditions?.[0]?.rounding || 'ROUND'
  return roundingLabels[rounding] || rounding
})

interface TipGroup {
  control_mode: 'HARD' | 'SOFT'
  label: string
  rules: Array<{
    assessment_label: string
    formula: string
    needLabel: string
    current_people: number
    diffAction: string
    diffCount: string
    diffClass: 'distribution-tips__diff--error' | 'distribution-tips__diff--warning' | ''
  }>
}

const groups = computed<TipGroup[]>(() => {
  const tips = props.tips
  if (!tips?.rules?.length) return []
  const byMode = new Map<'HARD' | 'SOFT', TipGroup>([
    ['HARD', { control_mode: 'HARD', label: '强制分布', rules: [] }],
    ['SOFT', { control_mode: 'SOFT', label: '建议分布', rules: [] }],
  ])
  for (const rule of tips.rules) {
    for (const condition of rule.conditions) {
      if (!condition.violated) continue
      const group = byMode.get(condition.control_mode)
      if (!group) continue
      const unitLabel = condition.unit === 'PERCENT' ? '%' : '人'
      const formula = `${condition.grades.join(' + ')} ${operatorLabels[condition.operator] || condition.operator} ${condition.value}${unitLabel}`
      let needLabel = ''
      if (condition.unit === 'PERCENT') {
        const comparison = condition.operator === 'LT' || condition.operator === 'LTE' ? '需小于' : '最少需'
        needLabel = `${comparison} ${condition.target_people} 人`
      } else {
        needLabel = `${operatorLabels[condition.operator] || condition.operator} ${condition.target_people} 人`
      }
      let diffAction = ''
      let diffCount = ''
      let diffClass: TipGroup['rules'][number]['diffClass'] = ''
      const diff = Math.abs(condition.diff)
      if (condition.diff < 0) {
        diffAction = '需减少 '
        diffCount = String(diff)
        diffClass = 'distribution-tips__diff--error'
      } else if (condition.diff > 0) {
        diffAction = '需增加 '
        diffCount = String(diff)
        diffClass = 'distribution-tips__diff--warning'
      }
      group.rules.push({
        assessment_label: rule.assessment_label,
        formula,
        needLabel,
        current_people: condition.current_people,
        diffAction,
        diffCount,
        diffClass,
      })
    }
  }
  return [byMode.get('HARD')!, byMode.get('SOFT')!].filter(group => group.rules.length > 0)
})
</script>

<style scoped>
.performance-distribution-tips {
  display: flex;
  flex: none;
  width: 100%;
  max-width: var(--performance-review-content-max-width, 1080px);
  flex-direction: column;
  gap: 12px;
  margin: 0 auto 16px;
  padding: 12px 24px 16px;
  box-sizing: border-box;
  border-radius: 4px;
  background: var(--color-bg-subtle);
  color: var(--color-text-primary);
}
.distribution-tips__head { position: relative; display: flex; align-items: center; justify-content: space-between; }
.distribution-tips__title { font-size: 14px; font-weight: 600; line-height: 22px; }
.distribution-tips__toggle { display: inline-flex; align-items: center; gap: 6px; padding: 0; border: 0; background: none; color: var(--color-action-primary); font-size: 14px; line-height: 22px; cursor: pointer; }
.distribution-tips__toggle-icon { display: block; width: 1em; height: 1em; transition: transform .2s ease; }
.distribution-tips__toggle-icon--down { transform: rotate(180deg); }
.distribution-tips__group { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
.distribution-tips__group-title { margin: 0; font-size: 14px; font-weight: 600; line-height: 22px; }
.distribution-tips__rule { display: flex; align-items: flex-start; gap: 16px; }
.distribution-tips__status-tag { display: inline-flex; align-items: center; flex: none; height: 20px; padding: 0 6px; box-sizing: border-box; border-radius: 4px; font-size: 12px; line-height: 20px; }
.distribution-tips__status-tag--error { background: color-mix(in srgb, var(--color-danger) 10%, transparent); color: var(--color-danger); }
.distribution-tips__status-tag--warning { background: color-mix(in srgb, var(--color-warning) 10%, transparent); color: var(--color-warning); }
.distribution-tips__rule-body { min-width: 0; }
.distribution-tips__rule-heading { margin: 0 0 4px; font-size: 14px; font-weight: 600; line-height: 22px; }
.distribution-tips__rule-line { margin: 0; font-size: 14px; line-height: 24px; }
.distribution-tips__rule-formula { font-weight: 600; }
.distribution-tips__rule-line .distribution-tips__rule-state { color: var(--color-text-secondary); }
.distribution-tips__diff { font-style: normal; }
.distribution-tips__diff--error { color: var(--color-danger); font-style: normal; }
.distribution-tips__diff--warning { color: var(--color-warning); font-style: normal; }
.distribution-tips__note { margin: 12px 0 0; color: var(--color-text-secondary); font-size: 12px; line-height: 22px; }
</style>
